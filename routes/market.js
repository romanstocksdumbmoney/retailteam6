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
  getRealizedPatterns,
  getWildTakes
} = require('../services/marketEngine');
const { parseAuthToken } = require('../services/authService');
const { getUserById } = require('../services/userStore');

const router = express.Router();
const FREE_SCAN_METHODS = new Set(['llm-sentiment']);

function parsePlan(req) {
  if (req.user) {
    return req.user.plan === 'pro' ? 'pro' : 'free';
  }
  const raw = String(
    req.header('x-user-plan') || req.header('x-plan') || req.header('x-access-tier') || req.query.plan || 'free'
  ).toLowerCase();
  return raw === 'pro' ? 'pro' : 'free';
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
  const board = await buildEarningsGambling(boundedLimit);
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
      'unusual moves feed'
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
