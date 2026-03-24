const SCANNER_METHODS = ['multi', 'llm-sentiment', 'event-cluster', 'flow-extractor'];

const AI_ENGINES = ['gpt', 'claude', 'gemini', 'llama'];

const WORLD_EVENTS = [
  { event: 'Fed policy comments', impact: -6 },
  { event: 'Cooling inflation print', impact: 5 },
  { event: 'Geopolitical headline risk', impact: -4 },
  { event: 'Mega-cap guidance optimism', impact: 6 },
  { event: 'Consumer demand surprise', impact: 4 },
  { event: 'Bond yield spike', impact: -5 },
  { event: 'AI infrastructure spending cycle', impact: 7 },
  { event: 'Regulatory uncertainty in tech', impact: -3 }
];

const EARNINGS_WATCHLIST = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'GOOGL',
  'META',
  'TSLA',
  'NFLX',
  'AMD',
  'JPM',
  'BAC',
  'UNH'
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pseudoRandom(seed) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function normalizeSymbol(symbol) {
  return (symbol || '').toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 10) || 'AAPL';
}

function daySeed() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
}

function pickWorldEvents(symbol) {
  const seed = hashString(`${symbol}:${daySeed()}`);
  const picked = [];
  for (let i = 0; i < 3; i += 1) {
    const idx = Math.floor(pseudoRandom(seed + i * 17) * WORLD_EVENTS.length);
    picked.push(WORLD_EVENTS[idx]);
  }
  return picked;
}

function getCoverageMetrics(symbol) {
  const seed = hashString(`${symbol}:coverage:${daySeed()}`);
  const analystMillions = 1.4 + pseudoRandom(seed) * 3.2;
  const articleMillions = 2.2 + pseudoRandom(seed + 11) * 6.1;
  const socialMentions = 15000 + Math.floor(pseudoRandom(seed + 23) * 65000);
  return {
    analystsTracked: Math.round(analystMillions * 1_000_000),
    articlesAnalyzed: Math.round(articleMillions * 1_000_000),
    socialMentions24h: socialMentions
  };
}

function getAnalystSignal(symbol) {
  const seed = hashString(`${symbol}:analyst:${daySeed()}`);
  const bullish = 45 + Math.floor(pseudoRandom(seed + 2) * 35);
  const bearish = 15 + Math.floor(pseudoRandom(seed + 3) * 25);
  const neutral = 10 + Math.floor(pseudoRandom(seed + 4) * 20);
  const total = bullish + bearish + neutral;
  const score = (bullish - bearish) / total;
  return { bullish, bearish, neutral, total, score };
}

function getProbabilitySet(symbol) {
  const normalized = normalizeSymbol(symbol);
  const eventImpacts = pickWorldEvents(normalized).reduce((sum, item) => sum + item.impact, 0);
  const analyst = getAnalystSignal(normalized);
  const coverage = getCoverageMetrics(normalized);
  const seed = hashString(`${normalized}:probability:${daySeed()}`);

  const base = 50 + analyst.score * 18 + eventImpacts * 0.5;
  const noise = {
    day: (pseudoRandom(seed + 1) - 0.5) * 14,
    week: (pseudoRandom(seed + 2) - 0.5) * 10,
    month: (pseudoRandom(seed + 3) - 0.5) * 8,
    year: (pseudoRandom(seed + 4) - 0.5) * 6
  };

  const dayUp = clamp(Math.round(base + noise.day), 10, 90);
  const weekUp = clamp(Math.round(base + noise.week), 10, 90);
  const monthUp = clamp(Math.round(base + noise.month), 10, 90);
  const yearUp = clamp(Math.round(base + noise.year), 10, 90);

  const events = pickWorldEvents(normalized).map((item) => ({
    name: item.event,
    impact: item.impact
  }));

  return {
    symbol: normalized,
    generatedAt: new Date().toISOString(),
    probabilities: {
      day: { up: dayUp, down: 100 - dayUp },
      week: { up: weekUp, down: 100 - weekUp },
      month: { up: monthUp, down: 100 - monthUp },
      year: { up: yearUp, down: 100 - yearUp }
    },
    analystRatings: analyst,
    coverage,
    events
  };
}

function getScanResult({ symbol, method, aiEngine, mode }) {
  const normalized = normalizeSymbol(symbol);
  const selectedMethod = SCANNER_METHODS.includes(method) ? method : SCANNER_METHODS[0];
  const selectedEngine = AI_ENGINES.includes(aiEngine) ? aiEngine : AI_ENGINES[0];
  const selectedMode = mode || 'market-flow';

  const seed = hashString(`${normalized}:${selectedMethod}:${selectedEngine}:${selectedMode}:${daySeed()}`);
  const marketFlow = clamp(Math.round(40 + pseudoRandom(seed + 1) * 60), 1, 100);
  const gammaExposure = Math.round((pseudoRandom(seed + 2) * 2 - 1) * 380_000_000);
  const callPremium = Math.round((25 + pseudoRandom(seed + 3) * 160) * 1_000_000);
  const putPremium = Math.round((20 + pseudoRandom(seed + 4) * 150) * 1_000_000);
  const sentiment = clamp(Math.round((pseudoRandom(seed + 5) * 2 - 1) * 100), -100, 100);
  const confidence = clamp(Math.round(55 + pseudoRandom(seed + 6) * 40), 50, 95);

  return {
    symbol: normalized,
    scannerMethod: selectedMethod,
    aiEngine: selectedEngine,
    mode: selectedMode,
    generatedAt: new Date().toISOString(),
    metrics: {
      marketFlowScore: marketFlow,
      gammaExposureUsd: gammaExposure,
      callPremiumUsd: callPremium,
      putPremiumUsd: putPremium,
      putCallRatio: Number((putPremium / Math.max(callPremium, 1)).toFixed(2)),
      sentimentScore: sentiment,
      confidence
    },
    notes: [
      'x.com scanning uses synthetic demo data in this MVP.',
      'Connect paid data providers for live production signals.'
    ],
    options: {
      methods: SCANNER_METHODS,
      aiEngines: AI_ENGINES
    }
  };
}

function normalPdf(value) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * value * value);
}

function normalCdf(value) {
  const t = 1 / (1 + 0.2316419 * Math.abs(value));
  const d = 0.3989423 * Math.exp((-value * value) / 2);
  let probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (value > 0) {
    probability = 1 - probability;
  }
  return probability;
}

function calculateOptions({
  spotPrice,
  strikePrice,
  daysToExpiry,
  impliedVolatility,
  riskFreeRate = 0.04,
  callOpenInterest = 10000,
  putOpenInterest = 10000
}) {
  const S = Number(spotPrice);
  const K = Number(strikePrice);
  const T = Math.max(Number(daysToExpiry), 1) / 365;
  const sigma = Math.max(Number(impliedVolatility), 0.01);
  const r = Number(riskFreeRate);

  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const call = S * normalCdf(d1) - K * Math.exp(-r * T) * normalCdf(d2);
  const put = K * Math.exp(-r * T) * normalCdf(-d2) - S * normalCdf(-d1);
  const gamma = normalPdf(d1) / (S * sigma * Math.sqrt(T));
  const callGex = gamma * Number(callOpenInterest) * 100 * S * S * 0.01;
  const putGex = -gamma * Number(putOpenInterest) * 100 * S * S * 0.01;

  return {
    callPremium: Number(call.toFixed(2)),
    putPremium: Number(put.toFixed(2)),
    gamma: Number(gamma.toFixed(6)),
    callGammaExposureUsd: Math.round(callGex),
    putGammaExposureUsd: Math.round(putGex),
    netGammaExposureUsd: Math.round(callGex + putGex)
  };
}

function getUnusualMoves() {
  const symbols = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL', 'META', 'AMZN'];
  const seed = hashString(`unusual:${daySeed()}`);
  const moves = [];

  for (let i = 0; i < 5; i += 1) {
    const symbol = symbols[Math.floor(pseudoRandom(seed + i) * symbols.length)];
    const notional = Math.round((1 + pseudoRandom(seed + i + 20) * 55) * 1_000_000);
    const callBias = pseudoRandom(seed + i + 50) > 0.5;
    const sentiment = callBias ? 'bullish' : 'bearish';
    const side = callBias ? 'calls' : 'puts';
    moves.push({
      symbol,
      side,
      sentiment,
      notionalUsd: notional,
      detectedAt: new Date(Date.now() - i * 12 * 60 * 1000).toISOString()
    });
  }

  return moves;
}

function getEarningsGamblingBoard(limit = 5) {
  const seed = hashString(`earnings:${daySeed()}`);
  const selected = [];
  const seen = new Set();
  let cursor = 0;

  while (selected.length < limit && cursor < 100) {
    const idx = Math.floor(pseudoRandom(seed + cursor * 5) * EARNINGS_WATCHLIST.length);
    const symbol = EARNINGS_WATCHLIST[idx];
    if (!seen.has(symbol)) {
      selected.push(symbol);
      seen.add(symbol);
    }
    cursor += 1;
  }

  return selected.map((symbol, index) => {
    const moveUp = pseudoRandom(seed + index + 99) > 0.5;
    const up = clamp(Math.round(45 + pseudoRandom(seed + index + 120) * 25), 40, 70);
    const down = 100 - up;
    return {
      symbol,
      reportTime: index % 2 === 0 ? 'Before Open' : 'After Close',
      predictedDirection: moveUp ? 'up' : 'down',
      probabilityUp: up,
      probabilityDown: down
    };
  });
}

module.exports = {
  SCANNER_METHODS,
  AI_ENGINES,
  normalizeSymbol,
  normalizeTicker: normalizeSymbol,
  getProbabilitySet,
  buildStockOutlook: getProbabilitySet,
  getScanResult,
  buildSocialScan: getScanResult,
  calculateOptions,
  buildOptionsSnapshot: calculateOptions,
  getUnusualMoves,
  buildUnusualMoves: getUnusualMoves,
  getEarningsGamblingBoard,
  buildEarningsGambling: getEarningsGamblingBoard
};
