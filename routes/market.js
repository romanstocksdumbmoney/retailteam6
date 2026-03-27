const express = require('express');
const {
  normalizeTicker,
  buildStockOutlook,
  buildOptionsSnapshot,
  buildEarningsGambling,
  buildSocialScan,
  buildUnusualMoves,
  getAiDiscovery,
  getTrendTrades,
  getHighIvTracker,
  getPremiumSpikes,
  getRealizedPatterns,
  getWildTakes,
  analyzeAiTradePattern,
  analyzeAiTradeScreenshot
} = require('../services/marketEngine');
const {
  configureAutoTrader,
  getAutoTraderStatus,
  getLiveFundingProfile,
  getAutoTraderAccountView,
  saveAutoTraderLiveTradingProfile,
  runAutoTraderCycle,
  listAutoTraderSectors,
  setBotActive,
  setAutoTraderFundingMode,
  fundAutoTrader
} = require('../services/autoTraderService');
const { createFundingCheckoutSession } = require('../services/stripeService');
const { parseAuthToken } = require('../services/authService');
const { getUserById } = require('../services/userStore');

const router = express.Router();
const FREE_SCAN_METHODS = new Set(['llm-sentiment']);

function parsePlan(req) {
  return req.user && req.user.plan === 'pro' ? 'pro' : 'free';
}

function isPro(req) {
  return parsePlan(req) === 'pro';
}

function attachOptionalUser(req, _res, next) {
  const parsed = parseAuthToken(req.header('authorization'));
  if (!parsed.ok) {
    return next();
  }
  const user = getUserById(parsed.userId);
  if (!user) {
    return next();
  }
  req.user = user;
  return next();
}

function requirePro(req, res, next) {
  if (!isPro(req)) {
    return res.status(403).json({
      error: 'pro_required',
      message: 'This endpoint is available on the Pro plan only. Upgrade to Pro to unlock it.'
    });
  }
  return next();
}

function requireLiveFundingAccess(req, res, next) {
  if (!isPro(req)) {
    return res.status(403).json({
      error: 'live_funding_purchase_required',
      message: 'Buy into Live Funding Mode first by upgrading to Pro.'
    });
  }
  return next();
}

function requireSignedIn(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Login required.'
    });
  }
  return next();
}

function estimateSpotPrice(ticker) {
  const source = normalizeTicker(ticker);
  let sum = 0;
  for (let i = 0; i < source.length; i += 1) {
    sum += source.charCodeAt(i);
  }
  return 80 + (sum % 220);
}

function parseDaysToExpiry(rawExpiration, rawDays) {
  const explicit = Number(rawDays);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.trunc(explicit);
  }

  if (!rawExpiration) {
    return 30;
  }

  const expiration = new Date(String(rawExpiration));
  if (Number.isNaN(expiration.getTime())) {
    return 30;
  }

  const now = Date.now();
  const ms = expiration.getTime() - now;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function buildStockOutlookPayload(ticker) {
  const snapshot = buildStockOutlook(ticker);
  return {
    ticker: snapshot.symbol,
    outlook: snapshot.probabilities,
    analystRatings: {
      bullish: snapshot.analystRatings.bullish,
      bearish: snapshot.analystRatings.bearish,
      neutral: snapshot.analystRatings.neutral,
      total: snapshot.analystRatings.total
    },
    coverage: snapshot.coverage,
    events: snapshot.events.map((event) => ({
      label: event.name,
      impact: event.impact > 0 ? `+${event.impact}` : String(event.impact)
    })),
    updatedAt: snapshot.generatedAt
  };
}

function buildScannerPayload({ ticker, method, plan }) {
  const snapshot = buildSocialScan({
    symbol: ticker,
    method,
    aiEngine: 'gpt',
    mode: 'market-flow'
  });

  const metrics = snapshot.metrics;
  const fullSummary = `${snapshot.symbol}: flow ${metrics.marketFlowScore}/100, gamma ${metrics.gammaExposureUsd.toLocaleString()}, call premium $${metrics.callPremiumUsd.toLocaleString()}, put premium $${metrics.putPremiumUsd.toLocaleString()}.`;

  if (plan === 'free') {
    return {
      result: {
        ticker: snapshot.symbol,
        method: snapshot.scannerMethod,
        summary: `${snapshot.symbol}: sentiment ${metrics.sentimentScore}, confidence ${metrics.confidence} (free preview).`,
        source: 'x.com + AI consensus (preview)',
        lastRunUtc: snapshot.generatedAt,
        isLimited: true
      }
    };
  }

  return {
    result: {
      ticker: snapshot.symbol,
      method: snapshot.scannerMethod,
      summary: fullSummary,
      source: `x.com + ${snapshot.aiEngine} (${snapshot.mode})`,
      lastRunUtc: snapshot.generatedAt,
      isLimited: false,
      metrics: {
        marketFlowScore: metrics.marketFlowScore,
        gammaExposureUsd: metrics.gammaExposureUsd,
        callPremiumUsd: metrics.callPremiumUsd,
        putPremiumUsd: metrics.putPremiumUsd,
        putCallRatio: metrics.putCallRatio,
        sentimentScore: metrics.sentimentScore,
        confidence: metrics.confidence
      }
    }
  };
}

function stockOutlookHandler(req, res) {
  const ticker = normalizeTicker(req.query.ticker || req.query.q || 'AAPL');
  if (!ticker) {
    return res.status(400).json({ error: 'invalid_ticker', message: 'Provide ?ticker=TSLA' });
  }

  return res.json(buildStockOutlookPayload(ticker));
}

function stockByParamHandler(req, res) {
  const ticker = normalizeTicker(req.params.ticker);
  if (!ticker) {
    return res.status(400).json({ error: 'invalid_ticker' });
  }

  return res.json(buildStockOutlookPayload(ticker));
}

function stockSearchHandler(req, res) {
  const ticker = normalizeTicker(req.query.q || req.query.ticker);
  if (!ticker) {
    return res.status(400).json({ error: 'missing_query', message: 'Use ?q=TSLA' });
  }

  return res.json(buildStockOutlookPayload(ticker));
}

function scanHandler(req, res) {
  const ticker = normalizeTicker(req.query.ticker || req.query.q || 'SPY');
  const method = String(req.query.method || 'llm-sentiment').toLowerCase();
  const plan = parsePlan(req);

  if (plan !== 'pro' && !FREE_SCAN_METHODS.has(method)) {
    return res.status(403).json({
      error: 'pro_required',
      message: `Scanner method "${method}" is Pro-only.`
    });
  }

  return res.json(buildScannerPayload({ ticker, method, plan }));
}

function optionsHandler(req, res) {
  const ticker = normalizeTicker(req.query.ticker || req.query.symbol || req.query.q || 'AAPL');
  const spot = Number(req.query.spot || req.query.underlying || req.query.price || estimateSpotPrice(ticker));
  const strike = Number(req.query.strike || spot);
  const daysToExpiry = parseDaysToExpiry(req.query.expiration, req.query.daysToExpiry || req.query.dte);
  const impliedVolatility = Number(req.query.iv || req.query.impliedVol || req.query.impliedVolatility || 0.4);
  const contractType = String(req.query.type || 'call').toLowerCase() === 'put' ? 'put' : 'call';

  const snapshot = buildOptionsSnapshot({
    spotPrice: spot,
    strikePrice: strike,
    daysToExpiry,
    impliedVolatility,
    callOpenInterest: Number(req.query.callOi || 12000),
    putOpenInterest: Number(req.query.putOi || 10000)
  });

  const expirationIso = req.query.expiration || new Date(Date.now() + daysToExpiry * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const selectedPremium = contractType === 'call' ? snapshot.callPremium : snapshot.putPremium;

  return res.json({
    ticker,
    contract: {
      type: contractType,
      strike: Number(strike.toFixed(2)),
      expiration: expirationIso,
      premiumPerShare: selectedPremium,
      premiumPerContractUsd: Math.round(selectedPremium * 100)
    },
    premium: {
      callPremiumUsd: Math.round(snapshot.callPremium * 100),
      putPremiumUsd: Math.round(snapshot.putPremium * 100)
    },
    gammaExposure: {
      call: snapshot.callGammaExposureUsd,
      put: snapshot.putGammaExposureUsd,
      net: snapshot.netGammaExposureUsd,
      notional: Math.abs(snapshot.netGammaExposureUsd),
      signedDirection: snapshot.netGammaExposureUsd >= 0 ? 'positive' : 'negative'
    },
    assumptions: {
      spot: Number(spot.toFixed(2)),
      daysToExpiry,
      impliedVolatility
    }
  });
}

router.use(attachOptionalUser);

router.get('/unusual-moves', requirePro, (_req, res) => {
  const raw = buildUnusualMoves();
  return res.json({
    data: raw.map((move) => ({
      ticker: move.symbol,
      size: move.side.toUpperCase(),
      sentiment: move.sentiment,
      premiumUsd: move.notionalUsd,
      detectedAt: move.detectedAt
    }))
  });
});

router.get('/earnings-gambling', async (req, res) => {
  const limit = Number(req.query.limit || 5);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(8, Math.trunc(limit))) : 5;
  const targetDate = String(req.query.targetDate || '').trim();
  const includeCompleted = String(req.query.includeCompleted || '').trim().toLowerCase() === 'true';
  const board = await buildEarningsGambling(boundedLimit, { targetDate, includeCompleted });
  const raw = board.items || [];
  const boardDate = board.scheduleDate || null;

  return res.json({
    source: board.source || 'simulated',
    scheduleDate: boardDate,
    scheduleLabel: board.scheduleLabel || (boardDate ? `Upcoming earnings (${boardDate})` : 'Upcoming earnings'),
    items: raw.map((item) => ({
      ticker: item.symbol,
      reportTimeLabel: item.reportTime,
      eventDate: item.earningsDate,
      eventDateLabel: item.earningsDateLabel,
      direction: item.predictedDirection,
      volume: item.volume,
      volumeSource: item.volumeSource,
      verificationStatus: item.verificationStatus,
      verificationScore: item.verificationScore,
      recentNews: item.recentNews || [],
      analystPushes: item.analystPushes || [],
      unusualWhalesIntel: item.unusualWhalesIntel || item.intel,
      unusualWhales: item.unusualWhales,
      futureGrowthSignals: item.futureGrowthSignals,
      predictedMove: {
        up: item.probabilityUp,
        down: item.probabilityDown
      }
    })),
    updatedAt: new Date().toISOString()
  });
});

router.get('/pro-status', (req, res) => {
  return res.json({
    plan: parsePlan(req),
    proFeatures: [
      'x.com multi-method scanner',
      'advanced options calculator + gamma exposure',
      'unusual moves feed',
      'high iv tracker'
    ]
  });
});

router.get('/ai-discovery', (req, res) => {
  const query = String(req.query.query || req.query.q || '');
  return res.json(getAiDiscovery(query));
});

router.get('/trend-trades-sources', (_req, res) => {
  const options = getTrendTrades(1, 'all').availableSources || ['all'];
  return res.json({ options });
});

router.get('/trend-trades', requirePro, (req, res) => {
  const limit = Number(req.query.limit || 8);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 8;
  const source = String(req.query.source || 'all');
  return res.json(getTrendTrades(boundedLimit, source));
});

router.get('/high-iv', requirePro, (req, res) => {
  const limit = Number(req.query.limit || 8);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 8;
  return res.json(getHighIvTracker(boundedLimit));
});

router.get('/premium-spikes', requirePro, (req, res) => {
  const limit = Number(req.query.limit || 10);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(30, Math.trunc(limit))) : 10;
  return res.json(getPremiumSpikes(boundedLimit));
});

router.get('/realized-patterns', (req, res) => {
  const limit = Number(req.query.limit || 8);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 8;
  const patternType = String(req.query.type || 'all');
  return res.json(getRealizedPatterns(boundedLimit, patternType));
});

router.get('/wild-takes', (req, res) => {
  const limit = Number(req.query.limit || 10);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(30, Math.trunc(limit))) : 10;
  return res.json(getWildTakes(boundedLimit));
});

router.post('/ai-trade/analyze', requireSignedIn, (req, res) => {
  try {
    const imageDataUrl = String(req.body?.imageDataUrl || '');
    const symbol = String(req.body?.symbol || '');
    const timeframe = String(req.body?.timeframe || '');
    const analysis = analyzeAiTradePattern({
      imageDataUrl,
      symbol,
      timeframe
    });
    return res.json(analysis);
  } catch (error) {
    if (String(error.message) === 'missing_image') {
      return res.status(400).json({
        error: 'missing_image',
        message: 'Please upload a chart image to run AI Trade analysis.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not analyze this pattern image.'
    });
  }
});

router.post('/ai-analyzer/analyze', requireSignedIn, (req, res) => {
  try {
    const imageDataUrl = String(req.body?.imageDataUrl || '');
    const symbol = String(req.body?.symbol || '');
    const timeframe = String(req.body?.timeframe || '');
    const direction = String(req.body?.direction || '');
    const entryPrice = Number(req.body?.entryPrice || 0);
    const exitPrice = Number(req.body?.exitPrice || 0);
    const analysis = analyzeAiTradeScreenshot({
      imageDataUrl,
      symbol,
      timeframe,
      direction,
      entryPrice,
      exitPrice,
      imageName: req.body?.imageName,
      imageSize: req.body?.imageSize,
      imageHash: req.body?.imageHash
    });
    return res.json(analysis);
  } catch (error) {
    if (String(error.message) === 'missing_image') {
      return res.status(400).json({
        error: 'missing_image',
        message: 'Please upload a screenshot to run AI Analyzer.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not analyze this trade screenshot.'
    });
  }
});

router.get('/auto-trader/sectors', requireSignedIn, (_req, res) => {
  return res.json({
    sectors: listAutoTraderSectors()
  });
});

router.post('/auto-trader/bot', requireSignedIn, (req, res) => {
  try {
    const payload = configureAutoTrader(req.user, req.body || {});
    return res.status(201).json(payload);
  } catch (error) {
    const message = String(error.message || '');
    if (message === 'invalid_capital') {
      return res.status(400).json({ error: 'invalid_capital', message: 'Capital must be between $100 and $10,000,000.' });
    }
    if (message === 'invalid_risk_pct') {
      return res.status(400).json({ error: 'invalid_risk_pct', message: 'Risk percent must be between 0.25 and 20.' });
    }
    if (message === 'invalid_chase_pct') {
      return res.status(400).json({ error: 'invalid_chase_pct', message: 'Chase percent must be between 0 and 100.' });
    }
    if (message === 'invalid_sectors') {
      return res.status(400).json({ error: 'invalid_sectors', message: 'Choose at least one valid sector.' });
    }
    return res.status(400).json({ error: 'invalid_request', message: 'Could not create AI Auto Trader bot.' });
  }
});

router.get('/auto-trader/bot', requireSignedIn, (req, res) => {
  const payload = getAutoTraderStatus(req.user);
  return res.json(payload);
});

router.post('/auto-trader/run', requireSignedIn, (req, res) => {
  try {
    const cycle = runAutoTraderCycle(req.user, req.body || {});
    const bot = getAutoTraderStatus(req.user);
    return res.json({
      bot,
      cycle
    });
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'bot_not_configured') {
      return res.status(400).json({
        error: 'bot_not_configured',
        message: 'Configure the AI Auto Trader first.'
      });
    }
    if (code === 'bot_paused') {
      return res.status(400).json({
        error: 'bot_paused',
        message: 'AI Auto Trader is paused. Resume it first.'
      });
    }
    if (code === 'insufficient_cash') {
      return res.status(400).json({
        error: 'insufficient_cash',
        message: 'No available cash. Update capital and save configuration.'
      });
    }
    if (code === 'live_funding_required') {
      return res.status(400).json({
        error: 'live_funding_required',
        message: 'Live mode requires funding first. Open the funding page to add live capital.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not run AI Auto Trader cycle.'
    });
  }
});

router.post('/auto-trader/bot/pause', requireSignedIn, (req, res) => {
  try {
    const payload = setBotActive(req.user, false);
    return res.json(payload);
  } catch (error) {
    if (String(error.message || '') === 'bot_not_configured') {
      return res.status(400).json({
        error: 'bot_not_configured',
        message: 'Configure the AI Auto Trader first.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not pause AI Auto Trader.'
    });
  }
});

router.post('/auto-trader/bot/resume', requireSignedIn, (req, res) => {
  try {
    const payload = setBotActive(req.user, true);
    return res.json(payload);
  } catch (error) {
    if (String(error.message || '') === 'bot_not_configured') {
      return res.status(400).json({
        error: 'bot_not_configured',
        message: 'Configure the AI Auto Trader first.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not resume AI Auto Trader.'
    });
  }
});

router.post('/auto-trader/funding-mode', requireSignedIn, (req, res) => {
  try {
    const mode = String(req.body?.mode || '');
    if (mode.trim().toLowerCase() === 'live' && !isPro(req)) {
      return res.status(403).json({
        error: 'live_funding_purchase_required',
        message: 'Buy into Live Funding Mode first by upgrading to Pro.'
      });
    }
    const payload = setAutoTraderFundingMode(req.user, mode);
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_funding_mode') {
      return res.status(400).json({
        error: 'invalid_funding_mode',
        message: 'Funding mode must be either "paper" or "live".'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not update funding mode.'
    });
  }
});

router.post('/auto-trader/fund', requireSignedIn, requireLiveFundingAccess, (req, res) => {
  try {
    const amountUsd = Number(req.body?.amountUsd || 0);
    const details = {
      accountHolder: req.body?.accountHolder,
      broker: req.body?.broker,
      paymentRail: req.body?.paymentRail,
      targetReturnPct: req.body?.targetReturnPct,
      riskPerTradePct: req.body?.riskPerTradePct
    };
    const payload = fundAutoTrader(req.user, amountUsd, details);
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_funding_amount') {
      return res.status(400).json({
        error: 'invalid_funding_amount',
        message: 'Funding amount must be a positive dollar value.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not fund AI Auto Trader.'
    });
  }
});

router.get('/auto-trader/funding-profile', requireSignedIn, (req, res) => {
  const payload = getLiveFundingProfile(req.user);
  return res.json(payload);
});

router.get('/auto-trader/account-view', requireSignedIn, (req, res) => {
  try {
    const payload = getAutoTraderAccountView(req.user);
    return res.json(payload);
  } catch (error) {
    if (String(error.message || '') === 'missing_user') {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Login required.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not load auto trader account view.'
    });
  }
});

router.post('/auto-trader/funding-payment-session', requireSignedIn, requireLiveFundingAccess, async (req, res) => {
  try {
    const amountUsd = Number(req.body?.amountUsd || 0);
    const paymentReference = String(req.body?.paymentReference || '').trim();
    const successPath = String(req.body?.successPath || '/ai-bot-funding-payment.html');
    const cancelPath = String(req.body?.cancelPath || '/ai-bot-funding-payment.html');
    const session = await createFundingCheckoutSession(req.user, {
      amountUsd,
      paymentReference,
      customerEmail: req.user?.email,
      successPath,
      cancelPath
    });
    return res.json(session);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_funding_amount') {
      return res.status(400).json({
        error: 'invalid_funding_amount',
        message: 'Funding payment amount must be between $10 and $1,000,000.'
      });
    }
    if (code === 'invalid_payment_reference') {
      return res.status(400).json({
        error: 'invalid_payment_reference',
        message: 'Missing payment reference for funding checkout.'
      });
    }
    if (code === 'billing_not_configured' || code === 'stripe_not_configured') {
      return res.status(503).json({
        error: 'billing_not_configured',
        message: 'Billing is not configured. Add Stripe keys or hosted checkout fallback.'
      });
    }
    return res.status(500).json({
      error: 'checkout_failed',
      message: 'Could not create funding payment session.'
    });
  }
});

router.post('/auto-trader/live-profile', requireSignedIn, requireLiveFundingAccess, (req, res) => {
  try {
    const payload = saveAutoTraderLiveTradingProfile(req.user, req.body || {});
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_broker') {
      return res.status(400).json({
        error: 'invalid_broker',
        message: 'Broker name is invalid.'
      });
    }
    if (code === 'invalid_account_label') {
      return res.status(400).json({
        error: 'invalid_account_label',
        message: 'Account label is invalid.'
      });
    }
    if (code === 'invalid_risk_acknowledgement') {
      return res.status(400).json({
        error: 'invalid_risk_acknowledgement',
        message: 'You must acknowledge live-trading risk to continue.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not save live trading profile.'
    });
  }
});

router.get('/stock-outlook', stockOutlookHandler);
router.get('/stock-search', stockSearchHandler);
router.get('/stock/:ticker', stockByParamHandler);
router.get('/scan-x', scanHandler);
router.get('/scan/x', scanHandler);
router.get('/options', requirePro, optionsHandler);
router.get('/options/:ticker', requirePro, (req, res) => {
  req.query.ticker = req.query.ticker || req.params.ticker;
  return optionsHandler(req, res);
});

module.exports = router;
