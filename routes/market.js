const express = require('express');
const {
  normalizeTicker,
  buildOptionsSnapshot,
  buildEarningsGambling,
  buildSocialScan,
  buildUnusualMoves,
  getAiDiscovery,
  getTrendTrades,
  getHighIvTracker,
  getPremiumSpikes,
  getPowerPortfolios,
  getInsiderTrades,
  getRealizedPatterns,
  getWildTakes,
  analyzeAiTradePattern,
  analyzeAiTradeScreenshot,
  analyzeAiOrderSetupAssistant
} = require('../services/marketEngine');
const {
  normalizeTicker: normalizeMarketDataTicker,
  analyzeStockOutlook,
  MarketDataServiceError
} = require('../services/MarketDataService');
const {
  configureAutoTrader,
  getAutoTraderStatus,
  getLiveFundingProfile,
  getAutoTraderPaperTradingProfile,
  getAutoTraderAccountView,
  saveAutoTraderPaperTradingProfile,
  saveAutoTraderLiveTradingProfile,
  getAutoTraderBrokerConnectionGuide,
  connectAutoTraderBrokerBridge,
  testAutoTraderBrokerBridge,
  disconnectAutoTraderBrokerBridge,
  queueAiTradeForExecution,
  approvePendingTradeProposal,
  cancelPendingTradeProposal,
  updateAutoTraderPromptControl,
  executeAutoTraderBrokerOrders,
  runAutoTraderCycle,
  listAutoTraderSectors,
  setBotActive,
  setAutoTraderFundingMode,
  fundAutoTrader,
  runAutoTraderAutopilotTick,
  stopAutoTraderAutopilot
} = require('../services/autoTraderService');
const {
  createComplaintTicket,
  getComplaintTicket,
  listComplaintTicketsForReview,
  updateComplaintTicketStatus
} = require('../services/complaintStore');
const {
  getNotificationSettings,
  saveNotificationSettings,
  buildAndSendNotificationMessage,
  listNotificationMessages
} = require('../services/notificationBotService');
const { createFundingCheckoutSession } = require('../services/stripeService');
const { parseAuthToken } = require('../services/authService');
const { getUserById } = require('../services/userStore');

const router = express.Router();
const FREE_SCAN_METHODS = new Set(['llm-sentiment']);
const COMPLAINT_REVIEW_TOKEN = String(process.env.COMPLAINT_REVIEW_TOKEN || '').trim();

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

function hasComplaintReviewAccess(req) {
  const suppliedToken = String(req.header('x-complaint-review-token') || req.query?.reviewToken || '').trim();
  if (COMPLAINT_REVIEW_TOKEN) {
    return suppliedToken && suppliedToken === COMPLAINT_REVIEW_TOKEN;
  }
  return Boolean(req.user && req.user.plan === 'pro');
}

function requireComplaintReviewAccess(req, res, next) {
  if (!hasComplaintReviewAccess(req)) {
    return res.status(403).json({
      error: 'review_access_denied',
      message: 'Complaint review access denied.'
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

function toUnavailable(value) {
  if (value === null || value === undefined || value === '') {
    return 'Unavailable';
  }
  return value;
}

function buildRealStockOutlookPayload(snapshot) {
  return {
    ticker: snapshot.ticker,
    companyName: snapshot.companyName || snapshot.ticker,
    stock: {
      currentPrice: toUnavailable(snapshot.stock?.currentPrice),
      dailyChange: toUnavailable(snapshot.stock?.dailyChange),
      dailyChangePercent: toUnavailable(snapshot.stock?.dailyChangePercent),
      volume: toUnavailable(snapshot.stock?.volume),
      previousClose: toUnavailable(snapshot.stock?.previousClose),
      latestTradingDay: toUnavailable(snapshot.stock?.latestTradingDay),
      marketCap: toUnavailable(snapshot.stock?.marketCap),
      fiftyTwoWeekHigh: toUnavailable(snapshot.stock?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: toUnavailable(snapshot.stock?.fiftyTwoWeekLow)
    },
    technicals: {
      movingAverage50Day: toUnavailable(snapshot.technicals?.movingAverage50Day),
      movingAverage200Day: toUnavailable(snapshot.technicals?.movingAverage200Day),
      rsi14: toUnavailable(snapshot.technicals?.rsi14),
      averageVolume20Day: toUnavailable(snapshot.technicals?.averageVolume20Day),
      volatilityDailyPercent: toUnavailable(snapshot.technicals?.volatilityDailyPercent),
      supportLevel: toUnavailable(snapshot.technicals?.supportLevel),
      resistanceLevel: toUnavailable(snapshot.technicals?.resistanceLevel)
    },
    fundamentals: {
      earningsDate: toUnavailable(snapshot.fundamentals?.earningsDate),
      analystRating: toUnavailable(snapshot.fundamentals?.analystRating),
      analystRatingMean: toUnavailable(snapshot.fundamentals?.analystRatingMean),
      analystCount: toUnavailable(snapshot.fundamentals?.analystCount),
      sector: toUnavailable(snapshot.fundamentals?.sector),
      industry: toUnavailable(snapshot.fundamentals?.industry)
    },
    news: Array.isArray(snapshot.news) ? snapshot.news : [],
    outlook: snapshot.outlook || {
      bias: 'Neutral',
      confidenceScore: 30,
      riskLevel: 'High',
      riskScore: 70,
      bullishScore: 0,
      bearishScore: 0,
      guidanceLabel: 'No Clear Setup',
      timeframe: 'Near-term swing (days to weeks)'
    },
    summary: snapshot.summary || {
      plainEnglish: 'Not enough real market confirmation is available yet.',
      strengths: [],
      risks: ['Data is currently incomplete for a reliable setup.'],
      keyLevelsToWatch: []
    },
    tradePlan: snapshot.tradePlan || {
      entryZone: null,
      stopLoss: null,
      target: null,
      invalidation: null,
      waitRecommendation: 'Wait until more confirmation is available.'
    },
    dataNature: 'live',
    sourceDisclosure: 'Real market outlook generated from live Alpha Vantage quote data.',
    dataSources: Array.isArray(snapshot.dataSources) ? snapshot.dataSources : [],
    dataProvider: snapshot.dataProvider || 'Alpha Vantage',
    lastUpdated: snapshot.lastUpdated || new Date().toISOString(),
    marketDataMayBeDelayed: Boolean(snapshot.marketDataMayBeDelayed)
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
        dataNature: snapshot.dataNature || 'simulated',
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
      dataNature: snapshot.dataNature || 'simulated',
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

async function stockOutlookHandler(req, res) {
  const rawTicker = String(req.query.ticker || req.query.q || '').trim();
  const ticker = normalizeMarketDataTicker(rawTicker);
  if (!ticker) {
    return res.status(400).json({ error: 'invalid_ticker', message: 'Enter a ticker symbol.' });
  }
  try {
    const snapshot = await analyzeStockOutlook(ticker);
    return res.json(buildRealStockOutlookPayload(snapshot));
  } catch (error) {
    if (error instanceof MarketDataServiceError) {
      return res.status(error.status || 500).json({
        error: error.code || 'market_data_error',
        message: error.message || 'Stock outlook analysis failed.',
        ticker
      });
    }
    return res.status(500).json({
      error: 'stock_outlook_failed',
      message: 'Stock outlook analysis failed unexpectedly.',
      ticker
    });
  }
}

async function stockByParamHandler(req, res) {
  const ticker = normalizeMarketDataTicker(req.params.ticker);
  if (!ticker) {
    return res.status(400).json({ error: 'invalid_ticker' });
  }
  try {
    const snapshot = await analyzeStockOutlook(ticker);
    return res.json(buildRealStockOutlookPayload(snapshot));
  } catch (error) {
    if (error instanceof MarketDataServiceError) {
      return res.status(error.status || 500).json({
        error: error.code || 'market_data_error',
        message: error.message || 'Stock outlook analysis failed.',
        ticker
      });
    }
    return res.status(500).json({
      error: 'stock_outlook_failed',
      message: 'Stock outlook analysis failed unexpectedly.',
      ticker
    });
  }
}

async function stockSearchHandler(req, res) {
  const ticker = normalizeMarketDataTicker(req.query.q || req.query.ticker);
  if (!ticker) {
    return res.status(400).json({ error: 'missing_query', message: 'Enter a ticker symbol.' });
  }
  try {
    const snapshot = await analyzeStockOutlook(ticker);
    return res.json(buildRealStockOutlookPayload(snapshot));
  } catch (error) {
    if (error instanceof MarketDataServiceError) {
      return res.status(error.status || 500).json({
        error: error.code || 'market_data_error',
        message: error.message || 'Stock outlook analysis failed.',
        ticker
      });
    }
    return res.status(500).json({
      error: 'stock_outlook_failed',
      message: 'Stock outlook analysis failed unexpectedly.',
      ticker
    });
  }
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
    dataNature: 'simulated',
    sourceDisclosure: 'Model-generated options and gamma estimates for research/testing.',
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
    dataNature: 'simulated',
    sourceDisclosure: 'Synthetic unusual-flow feed for beta testing.',
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
  const session = String(req.query.session || '').trim();
  const includeCompleted = String(req.query.includeCompleted || '').trim().toLowerCase() === 'true';
  const board = await buildEarningsGambling(boundedLimit, { targetDate, session, includeCompleted });
  const raw = board.items || [];
  const boardDate = board.scheduleDate || null;

  return res.json({
    source: board.source || 'simulated',
    dataNature: board.source === 'nasdaq' || board.source === 'alphavantage' ? 'mixed_live' : 'simulated',
    scheduleDate: boardDate,
    scheduleLabel: board.scheduleLabel || (boardDate ? `Upcoming earnings (${boardDate})` : 'Upcoming earnings'),
    requestedSession: board.requestedSession || 'all',
    appliedSession: board.appliedSession || 'all',
    items: raw.map((item) => ({
      ticker: item.symbol,
      reportTimeLabel: item.reportTime,
      eventDate: item.earningsDate,
      eventDateLabel: item.earningsDateLabel,
      direction: item.predictedDirection,
      volume: item.volume,
      volumeSource: item.volumeSource,
      verificationStatus: item.verificationStatus || item.verification?.status,
      verificationScore: Number(item.verificationScore ?? item.verification?.score ?? 0),
      verificationChecks: Array.isArray(item.verification?.checks) ? item.verification.checks : [],
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
    dataNature: 'system',
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
  const payload = getAiDiscovery(query);
  return res.json({
    ...payload,
    dataNature: 'external_links',
    sourceDisclosure: 'Links open external AI/social platforms. Results depend on those providers.'
  });
});

router.get('/trend-trades-sources', (_req, res) => {
  const options = getTrendTrades(1, 'all').availableSources || ['all'];
  return res.json({ options });
});

router.get('/trend-trades', requirePro, (req, res) => {
  const limit = Number(req.query.limit || 8);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 8;
  const source = String(req.query.source || 'all');
  const payload = getTrendTrades(boundedLimit, source);
  return res.json({
    ...payload,
    dataNature: 'simulated',
    sourceDisclosure: 'Synthetic social trend model for beta testing.'
  });
});

router.get('/high-iv', requirePro, (req, res) => {
  const limit = Number(req.query.limit || 8);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 8;
  const payload = getHighIvTracker(boundedLimit);
  return res.json({
    ...payload,
    dataNature: 'simulated',
    sourceDisclosure: 'Synthetic IV monitor for beta testing.'
  });
});

router.get('/premium-spikes', requirePro, async (req, res) => {
  const limit = Number(req.query.limit || 10);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(30, Math.trunc(limit))) : 10;
  const payload = await getPremiumSpikes(boundedLimit);
  return res.json({
    ...payload,
    dataNature: payload.dataNature || 'mixed_live',
    sourceDisclosure: payload.sourceDisclosure || 'Premium spikes computed from live Yahoo quote volumes and modeled day-over-day premium estimates.'
  });
});

router.get('/insider-trades', async (req, res) => {
  const limit = Number(req.query.limit || 10);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(30, Math.trunc(limit))) : 10;
  const side = String(req.query.side || 'all').trim().toLowerCase();
  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  const minValueUsd = Number(req.query.minValueUsd || 0);
  const sortBy = String(req.query.sortBy || 'value_desc').trim().toLowerCase();
  const unusualOnly = String(req.query.unusualOnly || '').trim().toLowerCase() === 'true';
  const payload = await getInsiderTrades(boundedLimit, {
    side,
    symbol,
    minValueUsd,
    sortBy,
    unusualOnly
  });
  return res.json({
    ...payload,
    dataNature: payload.dataNature || 'mixed_live',
    sourceDisclosure: payload.sourceDisclosure || 'Insider trades sourced from SEC Form 4 filings with live quote context.'
  });
});

router.get('/top-portfolios', (req, res) => {
  const limit = Number(req.query.limit || 8);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 8;
  const sortBy = String(req.query.sortBy || 'quality_desc').trim().toLowerCase();
  const manager = String(req.query.manager || '').trim();
  const payload = getPowerPortfolios(boundedLimit, { sortBy, manager });
  return res.json({
    ...payload,
    dataNature: 'simulated',
    sourceDisclosure: 'Synthetic portfolio tracker inspired by delayed public holdings and flow models for beta testing.'
  });
});

router.get('/realized-patterns', async (req, res) => {
  const limit = Number(req.query.limit || 8);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 8;
  const patternType = String(req.query.type || 'all');
  const payload = await getRealizedPatterns(boundedLimit, patternType);
  return res.json({
    ...payload,
    dataNature: payload.dataNature || 'live',
    sourceDisclosure: payload.sourceDisclosure || 'Realized patterns computed from live OHLCV data.'
  });
});

router.get('/wild-takes', async (req, res) => {
  const limit = Number(req.query.limit || 10);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(30, Math.trunc(limit))) : 10;
  const payload = await getWildTakes(boundedLimit);
  return res.json({
    ...payload,
    dataNature: payload.dataNature || 'mixed_live',
    sourceDisclosure: payload.sourceDisclosure || 'Wild takes extracted from recent Yahoo Finance headlines and labeled by deterministic rules.'
  });
});

router.get('/portfolio-tracker', (req, res) => {
  const limit = Number(req.query.limit || 8);
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(20, Math.trunc(limit))) : 8;
  const manager = String(req.query.manager || '').trim();
  const sortBy = String(req.query.sortBy || 'score_desc').trim().toLowerCase();
  const payload = getPowerPortfolios(boundedLimit, { manager, sortBy });
  return res.json({
    ...payload,
    dataNature: 'simulated',
    sourceDisclosure: 'Synthetic portfolio tracker inspired by delayed public holdings and flow models for beta testing.'
  });
});

router.post('/ai-trade/analyze', requireSignedIn, (req, res) => {
  try {
    const imageDataUrl = String(req.body?.imageDataUrl || '');
    const symbol = String(req.body?.symbol || '');
    const timeframe = String(req.body?.timeframe || '');
    const currentPrice = Number(req.body?.currentPrice || 0);
    const imageName = req.body?.imageName;
    const imageSize = req.body?.imageSize;
    const imageHash = req.body?.imageHash;
    const analysis = analyzeAiTradePattern({
      imageDataUrl,
      symbol,
      timeframe,
      currentPrice,
      imageName,
      imageSize,
      imageHash
    });
    return res.json({
      ...analysis,
      dataNature: 'simulated',
      sourceDisclosure: 'AI Trade output is model-generated guidance for research/testing.'
    });
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
    return res.json({
      ...analysis,
      dataNature: 'simulated',
      sourceDisclosure: 'AI Analyzer output is model-generated review for research/testing.'
    });
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

router.post('/ai-trade/order-setup', requireSignedIn, (req, res) => {
  try {
    const imageDataUrl = String(req.body?.imageDataUrl || '');
    const symbol = String(req.body?.symbol || '');
    const side = String(req.body?.side || '');
    const entryPrice = Number(req.body?.entryPrice || 0);
    const lossPct = Number(req.body?.lossPct || 0);
    const gainPct = Number(req.body?.gainPct || 0);
    const stopBufferPct = Number(req.body?.stopBufferPct || 0);
    const positionSize = Number(req.body?.positionSize || 0);
    const payload = analyzeAiOrderSetupAssistant({
      imageDataUrl,
      symbol,
      side,
      entryPrice,
      lossPct,
      gainPct,
      stopBufferPct,
      positionSize,
      imageName: req.body?.imageName,
      imageSize: req.body?.imageSize,
      imageHash: req.body?.imageHash
    });
    return res.json({
      ...payload,
      dataNature: 'simulated',
      sourceDisclosure: 'Order setup assistant outputs model-generated planning guidance for research/testing.'
    });
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'missing_image') {
      return res.status(400).json({
        error: 'missing_image',
        message: 'Please upload a screenshot to generate order setup levels.'
      });
    }
    if (code === 'invalid_image') {
      return res.status(400).json({
        error: 'invalid_image',
        message: 'Screenshot format is invalid. Use PNG/JPG/WEBP/GIF/BMP.'
      });
    }
    if (code === 'invalid_entry_price') {
      return res.status(400).json({
        error: 'invalid_entry_price',
        message: 'Entry price must be a positive number.'
      });
    }
    if (code === 'invalid_loss_pct') {
      return res.status(400).json({
        error: 'invalid_loss_pct',
        message: 'Loss percent must be between 0.01 and 60.'
      });
    }
    if (code === 'invalid_gain_pct') {
      return res.status(400).json({
        error: 'invalid_gain_pct',
        message: 'Gain percent must be between 0.01 and 300.'
      });
    }
    if (code === 'invalid_stop_buffer_pct') {
      return res.status(400).json({
        error: 'invalid_stop_buffer_pct',
        message: 'Stop buffer percent must be between 0 and 5.'
      });
    }
    if (code === 'invalid_position_size') {
      return res.status(400).json({
        error: 'invalid_position_size',
        message: 'Position size must be between 0 and 10000000 shares.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not build order setup guidance from this screenshot.'
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

router.post('/auto-trader/run', requireSignedIn, async (req, res) => {
  try {
    const cycle = runAutoTraderCycle(req.user, req.body || {});
    let autoExecution = null;
    const statusAfterCycle = getAutoTraderStatus(req.user);
    const autoExecuteLive = Boolean(
      statusAfterCycle?.config?.autoExecuteLive
      && String(statusAfterCycle?.tradingMode || 'paper').toLowerCase() === 'live'
    );
    if (autoExecuteLive) {
      if (!isPro(req)) {
        autoExecution = {
          attempted: false,
          status: 'skipped',
          reason: 'pro_required',
          message: 'Auto-execution requires Pro live funding access.'
        };
      } else {
        try {
          const pendingProposals = Array.isArray(statusAfterCycle?.execution?.pendingTradeProposals)
            ? statusAfterCycle.execution.pendingTradeProposals
            : [];
          const approvals = [];
          for (let index = 0; index < pendingProposals.length; index += 1) {
            const proposal = pendingProposals[index];
            const ticketId = String(proposal?.ticketId || '').trim();
            if (!ticketId) {
              // eslint-disable-next-line no-continue
              continue;
            }
            try {
              // eslint-disable-next-line no-await-in-loop
              const approved = await approvePendingTradeProposal(req.user, { ticketId, autoApproved: true });
              approvals.push({
                ticketId,
                approved: true,
                openedPositionId: approved?.openedPosition?.id || null
              });
            } catch (approvalError) {
              approvals.push({
                ticketId,
                approved: false,
                reason: String(approvalError?.message || 'approval_failed')
              });
            }
          }
          const executed = await executeAutoTraderBrokerOrders(req.user, {});
          autoExecution = {
            attempted: true,
            status: 'submitted',
            message: `Auto-execution submitted ${Number(executed.submittedCount || 0)} ticket(s).`,
            submittedCount: Number(executed.submittedCount || 0),
            rejectedCount: Number(executed.rejectedCount || 0),
            approvals
          };
        } catch (autoError) {
          const code = String(autoError.message || 'auto_execution_failed');
          const messageByCode = {
            live_mode_required: 'Switch to Live Funding mode before auto-execution.',
            live_funding_required: 'Fund your live account before enabling auto-execution.',
            broker_not_connected: 'Connect and test your broker bridge before enabling auto-execution.',
            trade_permission_missing: 'Broker trade permission is missing; update broker permissions.',
            missing_broker_api_credentials: 'Live broker credentials are missing. Reconnect broker API keys and run bridge test again.',
            validate_real_broker_order_failed: 'Live broker rejected one or more orders. Review broker rejection details and retry.',
            no_order_tickets: 'No order tickets generated in this cycle.',
            no_ready_tickets: 'Generated tickets are not broker-ready yet.',
            approval_required: 'Auto-execution requires proposal approval. Keep auto-approve enabled and ensure risk checks pass.'
          };
          autoExecution = {
            attempted: true,
            status: 'failed',
            reason: code,
            message: messageByCode[code] || 'Auto-execution failed. Review broker readiness and try again.'
          };
        }
      }
    }
    const bot = getAutoTraderStatus(req.user);
    return res.json({
      bot,
      cycle,
      autoExecution
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
    if (code === 'daily_loss_limit_reached') {
      return res.status(400).json({
        error: 'daily_loss_limit_reached',
        message: 'Daily loss limit reached. Trading is paused for safety.'
      });
    }
    if (code === 'max_trades_per_day_reached') {
      return res.status(400).json({
        error: 'max_trades_per_day_reached',
        message: 'Maximum trades per day reached. Trading is paused for safety.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not run AI Auto Trader cycle.'
    });
  }
});

router.post('/auto-trader/execute-orders', requireSignedIn, requireLiveFundingAccess, async (req, res) => {
  try {
    const payload = await executeAutoTraderBrokerOrders(req.user, req.body || {});
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'bot_not_configured') {
      return res.status(400).json({
        error: 'bot_not_configured',
        message: 'Configure the AI Auto Trader first.'
      });
    }
    if (code === 'live_mode_required') {
      return res.status(400).json({
        error: 'live_mode_required',
        message: 'Switch to Live Funding mode before sending broker orders.'
      });
    }
    if (code === 'live_funding_required') {
      return res.status(400).json({
        error: 'live_funding_required',
        message: 'Fund your live account before sending broker orders.'
      });
    }
    if (code === 'broker_not_connected') {
      return res.status(400).json({
        error: 'broker_not_connected',
        message: 'Connect and test your broker bridge before sending orders.'
      });
    }
    if (code === 'trade_permission_missing') {
      return res.status(400).json({
        error: 'trade_permission_missing',
        message: 'Broker connection is missing trade permission.'
      });
    }
    if (code === 'missing_broker_api_credentials') {
      return res.status(400).json({
        error: 'missing_broker_api_credentials',
        message: 'Live broker credentials are not available. Reconnect your broker API credentials and run test again.'
      });
    }
    if (code === 'validate_real_broker_order_failed') {
      return res.status(400).json({
        error: 'validate_real_broker_order_failed',
        message: error.details?.message || 'Live broker order submission failed. Verify broker API credentials, account permissions, and order constraints.'
      });
    }
    if (code === 'no_order_tickets') {
      return res.status(400).json({
        error: 'no_order_tickets',
        message: 'Run an AI cycle first so order tickets are available.'
      });
    }
    if (code === 'ticket_not_found') {
      return res.status(404).json({
        error: 'ticket_not_found',
        message: 'No matching order tickets were found for submission.'
      });
    }
    if (code === 'no_ready_tickets') {
      return res.status(400).json({
        error: 'no_ready_tickets',
        message: 'Selected tickets are not broker-ready yet.'
      });
    }
    if (code === 'approval_required') {
      return res.status(400).json({
        error: 'approval_required',
        message: 'Approve pending trade proposals before sending broker orders.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not submit broker orders from execution tickets.'
    });
  }
});

router.get('/auto-trader/autopilot/status', requireSignedIn, (req, res) => {
  try {
    const bot = getAutoTraderStatus(req.user);
    const execution = bot?.execution || {};
    const autopilot = execution?.autopilot || {
      enabled: false,
      active: false,
      intervalMs: null,
      startedAt: null,
      tickCount: 0,
      reason: 'not_configured'
    };
    return res.json({
      autopilot,
      tradingMode: bot?.tradingMode || 'paper',
      botActive: Boolean(bot?.isActive),
      brokerConnected: Boolean(execution?.brokerConnection?.isConnected),
      autoExecuteLive: Boolean(bot?.config?.autoExecuteLive)
    });
  } catch (error) {
    if (String(error.message || '') === 'missing_user') {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Login required.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not load autopilot status.'
    });
  }
});

router.post('/auto-trader/autopilot/start', requireSignedIn, requireLiveFundingAccess, async (req, res) => {
  try {
    const intervalMs = Number(req.body?.intervalMs);
    const payload = await runAutoTraderAutopilotTick(req.user, {
      intervalMs: Number.isFinite(intervalMs) ? intervalMs : undefined
    });
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'autopilot_requirements_not_met') {
      return res.status(400).json({
        error: 'autopilot_requirements_not_met',
        message: 'Autopilot requires live mode, funded account, connected broker, and hands-free live execution enabled.'
      });
    }
    if (code === 'invalid_autopilot_interval') {
      return res.status(400).json({
        error: 'invalid_autopilot_interval',
        message: 'Autopilot interval must be at least 15 seconds.'
      });
    }
    if (code === 'missing_user') {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Login required.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not start AI autopilot.'
    });
  }
});

router.post('/auto-trader/autopilot/stop', requireSignedIn, (req, res) => {
  try {
    const payload = stopAutoTraderAutopilot(req.user?.id);
    return res.json({
      stopped: Boolean(payload),
      autopilot: {
        enabled: false,
        active: false
      }
    });
  } catch (_error) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not stop AI autopilot.'
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
      executionMode: req.body?.executionMode,
      riskAcknowledged: req.body?.riskAcknowledged,
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

router.get('/auto-trader/paper-profile', requireSignedIn, (req, res) => {
  try {
    const payload = getAutoTraderPaperTradingProfile(req.user);
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
      message: 'Could not load paper-trading profile.'
    });
  }
});

router.post('/auto-trader/paper-profile', requireSignedIn, (req, res) => {
  try {
    const payload = saveAutoTraderPaperTradingProfile(req.user, req.body || {});
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_paper_provider') {
      return res.status(400).json({
        error: 'invalid_paper_provider',
        message: 'Paper-trading provider must be TradingView.'
      });
    }
    if (code === 'invalid_paper_email') {
      return res.status(400).json({
        error: 'invalid_paper_email',
        message: 'Enter a valid TradingView email.'
      });
    }
    if (code === 'invalid_paper_capital') {
      return res.status(400).json({
        error: 'invalid_paper_capital',
        message: 'Paper-trading amount must be between $100 and $10,000,000.'
      });
    }
    if (code === 'invalid_paper_ai_access') {
      return res.status(400).json({
        error: 'invalid_paper_ai_access',
        message: 'You must enable AI access for the connected paper-trading account.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not save paper-trading profile.'
    });
  }
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
        message: 'Billing is not configured. Add Stripe secret key configuration.'
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

router.get('/auto-trader/broker-connect/steps', requireSignedIn, (req, res) => {
  try {
    const broker = String(req.query?.broker || '').trim().toLowerCase();
    const payload = getAutoTraderBrokerConnectionGuide(req.user, { broker });
    return res.json(payload);
  } catch (error) {
    if (String(error.message || '') === 'invalid_broker') {
      return res.status(400).json({
        error: 'invalid_broker',
        message: 'Broker name is invalid.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not load broker connection steps.'
    });
  }
});

router.post('/auto-trader/broker-connect', requireSignedIn, async (req, res) => {
  try {
    const payload = await connectAutoTraderBrokerBridge(req.user, req.body || {});
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_broker' || code === 'invalid_broker_connection') {
      return res.status(400).json({
        error: 'invalid_broker',
        message: 'Select a supported broker before connecting.'
      });
    }
    if (code === 'invalid_account_id') {
      return res.status(400).json({
        error: 'invalid_account_id',
        message: 'Broker account ID is required.'
      });
    }
    if (code === 'invalid_api_credentials') {
      return res.status(400).json({
        error: 'invalid_api_credentials',
        message: 'API key/secret are required and must be valid length.'
      });
    }
    if (code === 'invalid_alpaca_api_credentials') {
      return res.status(400).json({
        error: 'invalid_alpaca_api_credentials',
        message: 'For Alpaca, API key and API secret are required.'
      });
    }
    if (code === 'invalid_existing_login') {
      return res.status(400).json({
        error: 'invalid_existing_login',
        message: 'Broker login email/username and password are required.'
      });
    }
    if (code === 'invalid_connection_method') {
      return res.status(400).json({
        error: 'invalid_connection_method',
        message: 'Select a valid connect method (api_keys or existing_account).'
      });
    }
    if (code === 'invalid_two_factor_mode') {
      return res.status(400).json({
        error: 'invalid_two_factor_mode',
        message: 'Select a valid two-factor mode (none, sms, or totp).'
      });
    }
    if (code === 'invalid_otp_code') {
      return res.status(400).json({
        error: 'invalid_otp_code',
        message: 'If provided, one-time code must be 4 to 12 characters.'
      });
    }
    if (code === 'invalid_broker_permissions') {
      return res.status(400).json({
        error: 'invalid_broker_permissions',
        message: 'Enable read/account/trade API permissions before connecting.'
      });
    }
    if (code === 'invalid_risk_acknowledgement') {
      return res.status(400).json({
        error: 'invalid_risk_acknowledgement',
        message: 'You must acknowledge live trading risk to connect the broker bridge.'
      });
    }
    if (code === 'validate_real_broker_connection_failed') {
      return res.status(400).json({
        error: 'validate_real_broker_connection_failed',
        message: error.details?.message || 'Live broker credential validation failed. Verify API credentials and try again.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not connect broker bridge.'
    });
  }
});

router.post('/auto-trader/broker-connect/test', requireSignedIn, async (req, res) => {
  try {
    const payload = await testAutoTraderBrokerBridge(req.user, req.body || {});
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_broker' || code === 'invalid_broker_connection') {
      return res.status(400).json({
        error: 'invalid_broker',
        message: 'Select a supported non-manual broker before running connection test.'
      });
    }
    if (code === 'validate_real_broker_connection_failed') {
      return res.status(400).json({
        error: 'validate_real_broker_connection_failed',
        message: error.details?.message || 'Live broker connection test failed for provided credentials.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not run broker bridge test.'
    });
  }
});

router.post('/auto-trader/broker-connect/disconnect', requireSignedIn, (req, res) => {
  try {
    const payload = disconnectAutoTraderBrokerBridge(req.user);
    return res.json(payload);
  } catch (_error) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not disconnect broker bridge.'
    });
  }
});

router.post('/auto-trader/queue-ai-trade', requireSignedIn, (req, res) => {
  try {
    const payload = queueAiTradeForExecution(req.user, req.body || {});
    return res.status(201).json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_symbol') {
      return res.status(400).json({
        error: 'invalid_symbol',
        message: 'Provide a valid ticker symbol to queue this AI trade.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not queue AI trade for execution.'
    });
  }
});

router.post('/auto-trader/trade-ideas/:ticketId/approve', requireSignedIn, (req, res) => {
  try {
    const payload = approvePendingTradeProposal(req.user, {
      ticketId: req.params.ticketId
    });
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'ticket_not_found') {
      return res.status(404).json({
        error: 'ticket_not_found',
        message: 'Trade idea ticket was not found.'
      });
    }
    if (code === 'proposal_not_pending') {
      return res.status(400).json({
        error: 'proposal_not_pending',
        message: 'This trade idea is no longer pending approval.'
      });
    }
    if (code === 'risk_check_failed') {
      return res.status(400).json({
        error: 'risk_check_failed',
        message: 'Trade blocked by risk manager. Review max loss, balance, and daily limits.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not approve this trade idea.'
    });
  }
});

router.post('/auto-trader/trade-ideas/:ticketId/cancel', requireSignedIn, (req, res) => {
  try {
    const payload = cancelPendingTradeProposal(req.user, {
      ticketId: req.params.ticketId
    });
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'ticket_not_found') {
      return res.status(404).json({
        error: 'ticket_not_found',
        message: 'Trade idea ticket was not found.'
      });
    }
    if (code === 'proposal_not_pending') {
      return res.status(400).json({
        error: 'proposal_not_pending',
        message: 'This trade idea is no longer pending approval.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not cancel this trade idea.'
    });
  }
});

router.post('/auto-trader/proposals/:ticketId/approve', requireSignedIn, (req, res) => {
  try {
    const payload = approvePendingTradeProposal(req.user, {
      ticketId: req.params.ticketId
    });
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'ticket_not_found') {
      return res.status(404).json({
        error: 'ticket_not_found',
        message: 'Trade idea ticket was not found.'
      });
    }
    if (code === 'proposal_not_pending') {
      return res.status(400).json({
        error: 'proposal_not_pending',
        message: 'This trade idea has already been handled.'
      });
    }
    if (code === 'risk_check_failed') {
      return res.status(400).json({
        error: 'risk_check_failed',
        message: 'Trade blocked by risk manager. Review risk settings and account limits.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not approve this trade idea.'
    });
  }
});

router.post('/auto-trader/proposals/:ticketId/cancel', requireSignedIn, (req, res) => {
  try {
    const payload = cancelPendingTradeProposal(req.user, {
      ticketId: req.params.ticketId
    });
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'ticket_not_found') {
      return res.status(404).json({
        error: 'ticket_not_found',
        message: 'Trade idea ticket was not found.'
      });
    }
    if (code === 'proposal_not_pending') {
      return res.status(400).json({
        error: 'proposal_not_pending',
        message: 'This trade idea has already been handled.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not cancel this trade idea.'
    });
  }
});

router.post('/auto-trader/prompt-control', requireSignedIn, (req, res) => {
  try {
    const payload = updateAutoTraderPromptControl(req.user, req.body || {});
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'bot_not_configured') {
      return res.status(400).json({
        error: 'bot_not_configured',
        message: 'Configure the AI Auto Trader first.'
      });
    }
    if (code === 'invalid_prompt') {
      return res.status(400).json({
        error: 'invalid_prompt',
        message: 'Prompt cannot be empty and must be 500 chars or less.'
      });
    }
    if (code === 'invalid_prompt_mode') {
      return res.status(400).json({
        error: 'invalid_prompt_mode',
        message: 'Prompt mode must be strict, balanced, or exploratory.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not update AI prompt control.'
    });
  }
});

router.post('/copilot/complaints', (req, res) => {
  try {
    const payload = createComplaintTicket(req.body || {}, {
      user: req.user || null,
      userAgent: req.get('user-agent') || '',
      pagePath: req.body?.pagePath || req.get('referer') || '/'
    });
    return res.status(201).json({
      complaint: payload,
      message: `Complaint received. Ticket ID: ${payload.ticketId}`
    });
  } catch (error) {
    if (String(error.message || '') === 'invalid_complaint_message') {
      return res.status(400).json({
        error: 'invalid_complaint_message',
        message: 'Please describe the issue with at least 8 characters.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not submit complaint ticket.'
    });
  }
});

router.get('/copilot/complaints/:ticketId', (req, res) => {
  const ticket = getComplaintTicket(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({
      error: 'complaint_not_found',
      message: 'Complaint ticket not found.'
    });
  }
  return res.json({ complaint: ticket });
});

router.get('/copilot/complaints-review', requireComplaintReviewAccess, (req, res) => {
  const status = String(req.query?.status || '').trim().toLowerCase();
  const limit = Number(req.query?.limit || 50);
  const payload = listComplaintTicketsForReview({ status, limit });
  return res.json(payload);
});

router.patch('/copilot/complaints/:ticketId/status', requireComplaintReviewAccess, (req, res) => {
  try {
    const payload = updateComplaintTicketStatus(req.params.ticketId, req.body || {});
    return res.json({ complaint: payload });
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'complaint_not_found') {
      return res.status(404).json({
        error: 'complaint_not_found',
        message: 'Complaint ticket not found.'
      });
    }
    if (code === 'invalid_complaint_status') {
      return res.status(400).json({
        error: 'invalid_complaint_status',
        message: 'Status must be open, investigating, fixed, or closed.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not update complaint ticket.'
    });
  }
});

router.get('/copilot/notifications/settings', requireSignedIn, (req, res) => {
  const payload = getNotificationSettings(req.user);
  return res.json(payload);
});

router.post('/copilot/notifications/settings', requireSignedIn, (req, res) => {
  try {
    const payload = saveNotificationSettings(req.user, req.body || {});
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_contact_name') {
      return res.status(400).json({
        error: 'invalid_contact_name',
        message: 'Please enter your full name for notification receiver setup.'
      });
    }
    if (code === 'invalid_notification_email') {
      return res.status(400).json({
        error: 'invalid_notification_email',
        message: 'Please provide a valid contact email.'
      });
    }
    if (code === 'invalid_phone_number') {
      return res.status(400).json({
        error: 'invalid_phone_number',
        message: 'Please provide a valid phone number (8-20 digits, plus optional leading +).'
      });
    }
    if (code === 'invalid_notification_topics') {
      return res.status(400).json({
        error: 'invalid_notification_topics',
        message: 'Choose at least one valid topic for notifications.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not save notification contact settings.'
    });
  }
});

router.get('/copilot/notifications/messages', requireSignedIn, (req, res) => {
  const limit = Number(req.query?.limit || 20);
  const payload = listNotificationMessages(req.user, { limit });
  return res.json(payload);
});

router.post('/copilot/notifications/send', requireSignedIn, async (req, res) => {
  try {
    const payload = await buildAndSendNotificationMessage(req.user, req.body || {});
    return res.status(201).json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'notification_settings_required') {
      return res.status(400).json({
        error: 'notification_settings_required',
        message: 'Save your contact info first before sending notifications.'
      });
    }
    if (code === 'invalid_notification_topic') {
      return res.status(400).json({
        error: 'invalid_notification_topic',
        message: 'Pick a valid notification topic.'
      });
    }
    if (code === 'topic_not_enabled_for_contact') {
      return res.status(400).json({
        error: 'topic_not_enabled_for_contact',
        message: 'This topic is not enabled in your contact settings. Update topics first.'
      });
    }
    if (code === 'invalid_notification_symbol') {
      return res.status(400).json({
        error: 'invalid_notification_symbol',
        message: 'Use a valid ticker symbol for this notification.'
      });
    }
    if (code === 'notification_delivery_failed') {
      return res.status(502).json({
        error: 'notification_delivery_failed',
        message: 'Notification could not be delivered by any real provider. Check SMTP/Twilio configuration.',
        attempts: Array.isArray(error.deliveryAttempts) ? error.deliveryAttempts : []
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not send notification message.'
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
