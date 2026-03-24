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
  'UNH',
  'AVGO',
  'QCOM',
  'ORCL',
  'CRM',
  'PYPL',
  'DIS',
  'INTC',
  'PFE',
  'KO',
  'NKE',
  'WMT',
  'COST'
];

const EARNINGS_VOLUME_BASE = {
  AAPL: 95_000_000,
  MSFT: 42_000_000,
  NVDA: 68_000_000,
  AMZN: 56_000_000,
  GOOGL: 34_000_000,
  META: 31_000_000,
  TSLA: 77_000_000,
  NFLX: 19_000_000,
  AMD: 49_000_000,
  JPM: 16_000_000,
  BAC: 28_000_000,
  UNH: 7_000_000,
  AVGO: 22_000_000,
  QCOM: 15_000_000,
  ORCL: 11_000_000,
  CRM: 8_000_000,
  PYPL: 12_000_000,
  DIS: 10_000_000,
  INTC: 33_000_000,
  PFE: 18_000_000,
  KO: 14_000_000,
  NKE: 11_000_000,
  WMT: 9_000_000,
  COST: 8_000_000
};

const AI_DISCOVERY_PLATFORMS = [
  {
    id: 'x-com',
    label: 'X.com Pulse',
    type: 'social',
    description: 'Track trader narratives, breaking chatter, and ticker velocity.',
    searchTemplate: 'https://x.com/search?q={query}',
    freeAccess: true
  },
  {
    id: 'openai',
    label: 'OpenAI',
    type: 'ai',
    description: 'General AI research assistant for market context and summaries.',
    searchTemplate: 'https://chat.openai.com/',
    freeAccess: true
  },
  {
    id: 'claude',
    label: 'Claude',
    type: 'ai',
    description: 'Long-form reasoning and synthesis for catalysts and setups.',
    searchTemplate: 'https://claude.ai/',
    freeAccess: true
  },
  {
    id: 'gemini',
    label: 'Gemini',
    type: 'ai',
    description: 'Fast exploration of market themes and scenario planning.',
    searchTemplate: 'https://gemini.google.com/',
    freeAccess: true
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    type: 'research',
    description: 'Source-linked market research and headline validation.',
    searchTemplate: 'https://www.perplexity.ai/',
    freeAccess: true
  }
];

const TREND_TRADE_SOURCES = [
  'TikTok',
  'YouTube Shorts',
  'YouTube',
  'Snapchat Spotlight',
  'Instagram Reels',
  'Facebook',
  'X.com'
];

const TREND_TRADE_SYMBOLS = [
  'META',
  'GOOGL',
  'NFLX',
  'SNAP',
  'AMZN',
  'NVDA',
  'AAPL',
  'MSFT',
  'TSLA',
  'RBLX'
];

const REALIZED_PATTERN_LIBRARY = [
  { key: 'vol-fade', name: 'Volume Fade Continuation', type: 'volume_down', edge: 'Low-participation drift tends to continue intraday.' },
  { key: 'vol-compress', name: 'Volume Compression Breakout', type: 'volume_down', edge: 'Compression often resolves with directional expansion.' },
  { key: 'hammer-reclaim', name: 'Hammer + VWAP Reclaim', type: 'candlestick', edge: 'Reclaim after hammer can trigger short covering.' },
  { key: 'engulf-reversal', name: 'Bullish/Bearish Engulfing Flip', type: 'candlestick', edge: 'Engulfing around support/resistance can front-run trend change.' },
  { key: 'inside-break', name: 'Inside Bar Expansion', type: 'candlestick', edge: 'Inside bar break often starts momentum bursts.' },
  { key: 'quiet-gap-hold', name: 'Quiet Gap Hold', type: 'volume_down', edge: 'Thin volume gap holds can trend while liquidity is light.' }
];

const REALIZED_PATTERN_TYPES = ['all', 'volume_down', 'candlestick'];

const WILD_TAKE_THEMES = [
  'AI capex is underpriced for the next two quarters',
  'Rate-cut optimism is already fully priced in',
  'Semis are entering a second momentum leg',
  'Consumer names are setting up for a surprise squeeze',
  'Index leadership rotation is about to accelerate',
  'Large-cap defensives are being accumulated quietly'
];

const WILD_TAKE_AUTHORS = ['TapeRider', 'GammaNomad', 'FlowOracle', 'MacroMaverick', 'RiskOnRex', 'DeltaDiva'];

const WILD_TAKE_SOURCES = ['X.com', 'TikTok', 'YouTube', 'Discord', 'Reddit', 'Telegram'];
const WILD_TAKE_SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'AMD', 'META', 'AMZN', 'MSFT', 'SPY', 'QQQ'];
const WILD_TAKE_HOOKS = [
  'claims this ticker is setting up for a violent squeeze.',
  'says the trend is overheated and due for a sharp fade.',
  'calls this one the most crowded breakout watch of the day.',
  'thinks options flow is signaling a stealth move soon.',
  'is betting on a momentum continuation into the close.'
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

function tomorrowSeed() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
}

function tomorrowIsoDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function minuteBucketSeed() {
  const now = new Date();
  const minuteBucket = Math.floor(now.getUTCMinutes() / 10);
  return `${daySeed()}:${now.getUTCHours()}:${minuteBucket}`;
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

function estimateEarningsDayVolume(symbol) {
  const base = EARNINGS_VOLUME_BASE[symbol] || 12_000_000;
  const seed = hashString(`earnings-volume:${symbol}:${tomorrowSeed()}`);
  const multiplier = 0.85 + pseudoRandom(seed) * 1.1;
  const catalystBoost = Math.round(pseudoRandom(seed + 91) * 28_000_000);
  return Math.max(1_500_000, Math.round(base * multiplier + catalystBoost));
}

function buildEarningsIntel(symbol, volume, up, down, seedOffset) {
  const seed = hashString(`earnings-intel:${symbol}:${tomorrowSeed()}:${seedOffset}`);
  const directionalBias = up >= down ? 'bullish' : 'bearish';
  const altDirection = directionalBias === 'bullish' ? 'bearish' : 'bullish';
  const unusualCount = 2 + Math.floor(pseudoRandom(seed + 1) * 3);
  const unusualPlays = [];

  for (let i = 0; i < unusualCount; i += 1) {
    const callSide = pseudoRandom(seed + 11 + i) > 0.5;
    unusualPlays.push({
      side: callSide ? 'CALLS' : 'PUTS',
      premiumUsd: Math.round((2 + pseudoRandom(seed + 21 + i) * 22) * 1_000_000),
      strikeHint: Math.round((70 + pseudoRandom(seed + 31 + i) * 240) * 10) / 10,
      expiry: 7 + Math.floor(pseudoRandom(seed + 41 + i) * 60)
    });
  }

  const commentary = [
    `${symbol} unusual flow leans ${directionalBias} heading into earnings with concentrated premium sweeps.`,
    `Crowd discussion around ${symbol} ${directionalBias === 'bullish' ? 'highlights revenue acceleration' : 'questions near-term margin pressure'}.`,
    `Future growth narrative is ${directionalBias === 'bullish' ? 'supported by forward guidance optimism' : 'mixed with valuation and execution concerns'}.`,
    `Volume profile (${volume.toLocaleString()}) suggests elevated participation and faster post-earnings repricing risk.`
  ];

  const futureGrowthSignals = [
    `${symbol} guidance watch: management tone on next-quarter demand will likely drive post-print momentum.`,
    `${symbol} margin path looks ${directionalBias === 'bullish' ? 'constructive if operating leverage holds' : 'fragile if costs remain sticky'}.`,
    `${symbol} long-range growth outlook remains ${directionalBias === 'bullish' ? 'intact with stronger product pipeline chatter' : 'debated given valuation and competitive pressure'}.`
  ];

  const analystPushes = [
    `${symbol}: ${2 + Math.floor(pseudoRandom(seed + 61) * 4)} desk pushes leaning ${directionalBias}.`,
    `${symbol}: median price-target revision ${directionalBias === 'bullish' ? '+' : '-'}${Math.round(
      3 + pseudoRandom(seed + 71) * 11
    )}%.`,
    `${symbol}: sell-side note volume elevated ahead of tomorrow's print.`
  ];

  return {
    headline: `${symbol} ${directionalBias} setup from unusual activity`,
    sentiment: directionalBias,
    opposingSentiment: altDirection,
    unusualPlays,
    notes: commentary,
    futureGrowthSignals,
    analystPushes
  };
}

function getEarningsGamblingBoard(limit = 5) {
  const seed = hashString(`earnings:${tomorrowSeed()}`);
  const boundedLimit = Math.max(1, Math.min(8, Math.trunc(limit)));
  const scheduleDate = tomorrowIsoDate();
  const rankedByVolume = EARNINGS_WATCHLIST.map((symbol) => ({
    symbol,
    estimatedVolume: estimateEarningsDayVolume(symbol)
  }))
    .sort((a, b) => b.estimatedVolume - a.estimatedVolume)
    .slice(0, boundedLimit);

  return rankedByVolume.map((entry, index) => {
    const symbol = entry.symbol;
    const up = clamp(Math.round(45 + pseudoRandom(seed + index + 120) * 25), 40, 70);
    const down = 100 - up;
    const predictedDirection = up >= down ? 'up' : 'down';
    const intel = buildEarningsIntel(symbol, entry.estimatedVolume, up, down, index);

    return {
      symbol,
      volume: entry.estimatedVolume,
      earningsDate: scheduleDate,
      reportTime: index % 2 === 0 ? 'Pre-Market' : 'After-Hours',
      predictedDirection,
      probabilityUp: up,
      probabilityDown: down,
      intel,
      unusualWhales: {
        plays: intel.unusualPlays,
        commentary: intel.notes,
        futureGrowthOutlook: [intel.headline]
      },
      futureGrowthSignals: intel.futureGrowthSignals,
      analystPushes: intel.analystPushes
    };
  });
}

function getAiDiscovery(query = '') {
  const cleanedQuery = String(query || '').trim();
  const queryToken = cleanedQuery ? encodeURIComponent(cleanedQuery) : '';

  return {
    query: cleanedQuery,
    platforms: AI_DISCOVERY_PLATFORMS.map((platform) => ({
      ...platform,
      searchUrl: platform.searchTemplate.replace('{query}', queryToken)
    }))
  };
}

function getTrendTrades(limit = 8, sourceFilter = 'all') {
  const seed = hashString(`trend-trades:${daySeed()}`);
  const total = Math.max(1, Math.min(20, Math.trunc(limit)));
  const rows = [];
  const normalizedFilter = String(sourceFilter || 'all').trim().toLowerCase();

  for (let i = 0; i < total; i += 1) {
    const source = TREND_TRADE_SOURCES[Math.floor(pseudoRandom(seed + i * 3) * TREND_TRADE_SOURCES.length)];
    const symbol = TREND_TRADE_SYMBOLS[Math.floor(pseudoRandom(seed + i * 5 + 1) * TREND_TRADE_SYMBOLS.length)];
    const trendScore = clamp(Math.round(60 + pseudoRandom(seed + i * 7 + 2) * 40), 50, 100);
    const views = Math.round((0.5 + pseudoRandom(seed + i * 11 + 3) * 8.5) * 1_000_000);
    const momentum = pseudoRandom(seed + i * 13 + 4) > 0.5 ? 'up' : 'down';
    const confidenceUp = clamp(Math.round(45 + pseudoRandom(seed + i * 17 + 5) * 30), 35, 75);
    const confidenceDown = 100 - confidenceUp;

    rows.push({
      source,
      symbol,
      trendScore,
      views,
      momentum,
      confidence: {
        up: confidenceUp,
        down: confidenceDown
      },
      visibility: trendScore > 78 ? 'public' : 'emerging'
    });
  }

  const sourceOptions = ['all', ...TREND_TRADE_SOURCES];
  const selectedFilter = sourceOptions.some((source) => source.toLowerCase() === normalizedFilter)
    ? normalizedFilter
    : 'all';

  const filtered = selectedFilter === 'all'
    ? rows
    : rows.filter((row) => row.source.toLowerCase() === selectedFilter);

  filtered.sort((a, b) => b.trendScore - a.trendScore);

  return {
    generatedAt: new Date().toISOString(),
    sourceFilter: selectedFilter,
    availableSources: sourceOptions,
    items: filtered
  };
}

function getRealizedPatterns(limit = 8, patternType = 'all') {
  const seed = hashString(`realized-patterns:${minuteBucketSeed()}`);
  const normalizedType = String(patternType || 'all').trim().toLowerCase();
  const selectedType = REALIZED_PATTERN_TYPES.includes(normalizedType) ? normalizedType : 'all';
  const total = Math.max(1, Math.min(20, Math.trunc(limit)));
  const items = [];
  const uniqueKey = new Set();

  for (let i = 0; i < total * 4; i += 1) {
    const pattern = REALIZED_PATTERN_LIBRARY[Math.floor(pseudoRandom(seed + i * 3) * REALIZED_PATTERN_LIBRARY.length)];
    if (selectedType !== 'all' && pattern.type !== selectedType) {
      continue;
    }

    const ticker = EARNINGS_WATCHLIST[Math.floor(pseudoRandom(seed + i * 5 + 1) * EARNINGS_WATCHLIST.length)];
    const dedupe = `${ticker}:${pattern.key}`;
    if (uniqueKey.has(dedupe)) {
      continue;
    }
    uniqueKey.add(dedupe);

    // Once a pattern "hits", it drops off this board.
    const hasTriggered = pseudoRandom(seed + i * 7 + 2) > 0.74;
    if (hasTriggered) {
      continue;
    }

    const volume = Math.max(1_000_000, Math.round(estimateEarningsDayVolume(ticker) * (0.4 + pseudoRandom(seed + i * 11 + 3) * 0.8)));
    const triggerMinute = Math.floor(pseudoRandom(seed + i * 13 + 4) * 59);
    const session = i % 2 === 0 ? 'pre-market' : 'after-hours';
    const triggerAt = session === 'pre-market' ? `09:${String(triggerMinute).padStart(2, '0')} ET` : `16:${String(triggerMinute).padStart(2, '0')} ET`;

    items.push({
      id: `${dedupe}:${i}`,
      ticker,
      patternName: pattern.name,
      patternType: pattern.type,
      patternTypeLabel: pattern.type === 'volume_down' ? 'Volume Down' : 'Candlestick',
      session,
      sessionLabel: session === 'pre-market' ? 'Pre-Market' : 'After-Hours',
      triggerAt,
      volume,
      note: pattern.edge
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    availableFilters: REALIZED_PATTERN_TYPES,
    selectedFilter: selectedType,
    items: items.slice(0, total)
  };
}

function getWildTakes(limit = 8) {
  const seed = hashString(`wild-takes:${minuteBucketSeed()}`);
  const total = Math.max(1, Math.min(20, Math.trunc(limit)));
  const items = [];
  for (let i = 0; i < total; i += 1) {
    const symbol = WILD_TAKE_SYMBOLS[Math.floor(pseudoRandom(seed + i * 5) * WILD_TAKE_SYMBOLS.length)];
    const source = WILD_TAKE_SOURCES[Math.floor(pseudoRandom(seed + i * 7 + 1) * WILD_TAKE_SOURCES.length)];
    const hook = WILD_TAKE_HOOKS[Math.floor(pseudoRandom(seed + i * 11 + 2) * WILD_TAKE_HOOKS.length)];
    const theme = WILD_TAKE_THEMES[Math.floor(pseudoRandom(seed + i * 13 + 3) * WILD_TAKE_THEMES.length)];
    const author = WILD_TAKE_AUTHORS[Math.floor(pseudoRandom(seed + i * 17 + 4) * WILD_TAKE_AUTHORS.length)];
    const sentiment = pseudoRandom(seed + i * 19 + 5) > 0.5 ? 'bullish' : 'bearish';
    const minutesAgo = Math.floor(pseudoRandom(seed + i * 23 + 6) * 55) + 1;

    items.push({
      id: `${source}:${symbol}:${i}`,
      title: `${symbol} • ${sentiment.toUpperCase()} wild take`,
      summary: `${author} on ${source}: ${theme} — ${symbol} ${hook}`,
      source,
      sentiment,
      createdAtLabel: `${minutesAgo}m ago`
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    items
  };
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
  buildEarningsGambling: getEarningsGamblingBoard,
  getAiDiscovery,
  getTrendTrades,
  getRealizedPatterns,
  getWildTakes
};
