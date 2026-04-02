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
  AAPL: 125_000_000,
  MSFT: 92_000_000,
  NVDA: 118_000_000,
  AMZN: 101_000_000,
  GOOGL: 76_000_000,
  META: 72_000_000,
  TSLA: 114_000_000,
  NFLX: 38_000_000,
  AMD: 109_000_000,
  JPM: 31_000_000,
  BAC: 44_000_000,
  UNH: 18_000_000,
  AVGO: 47_000_000,
  QCOM: 29_000_000,
  ORCL: 23_000_000,
  CRM: 19_000_000,
  PYPL: 26_000_000,
  DIS: 25_000_000,
  INTC: 55_000_000,
  PFE: 33_000_000,
  KO: 22_000_000,
  NKE: 20_000_000,
  WMT: 24_000_000,
  COST: 21_000_000
};

const TOMORROW_EARNINGS_CALLS = ['AAPL', 'NVDA', 'TSLA', 'AMD', 'AMZN', 'MSFT', 'META', 'GOOGL'];

const EARNINGS_CALENDAR_LOOKAHEAD_DAYS = 14;
const EARNINGS_CALENDAR_CACHE_MS = 30 * 60 * 1000;
const MARKET_TIME_ZONE = 'America/New_York';
const NASDAQ_EARNINGS_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'user-agent': 'Mozilla/5.0 (DumbDollars Earnings Bot)',
  origin: 'https://www.nasdaq.com',
  referer: 'https://www.nasdaq.com/'
};

let earningsCalendarCache = {
  fetchedAt: 0,
  items: []
};
let newsCache = new Map();
let quoteVolumeCache = new Map();
let tickerValidationCache = new Map();

const AI_DISCOVERY_PLATFORMS = [
  {
    id: 'x-com',
    label: 'X.com',
    type: 'social',
    description: 'Track trader narratives, breaking chatter, and ticker velocity on X.com.',
    searchTemplate: 'https://x.com/search?q={query}',
    freeAccess: true
  },
  {
    id: 'grok',
    label: 'Grok',
    type: 'social',
    description: 'Use Grok for fast social-market context and ticker chatter.',
    searchTemplate: 'https://grok.com/chat',
    freeAccess: true
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    type: 'ai',
    description: 'General AI research assistant for market context and summaries.',
    searchTemplate: 'https://chatgpt.com/',
    freeAccess: true
  },
  {
    id: 'claude-ai',
    label: 'Claude AI',
    type: 'ai',
    description: 'Long-form reasoning and synthesis for catalysts and setups.',
    searchTemplate: 'https://claude.ai/',
    freeAccess: true
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    type: 'ai',
    description: 'Anthropic platform and product docs for model capabilities and safety.',
    searchTemplate: 'https://www.anthropic.com/claude/',
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

const HIGH_IV_UNIVERSE = [
  'TSLA',
  'NVDA',
  'AMD',
  'SMCI',
  'COIN',
  'MSTR',
  'RIVN',
  'PLTR',
  'SPY',
  'QQQ',
  'IWM',
  'AAPL',
  'AMZN',
  'META',
  'NFLX',
  'SNOW'
];

const HIGH_IV_CATALYSTS = [
  'Earnings window and guidance uncertainty',
  'Heavy short-dated options positioning',
  'Macro data sensitivity this session',
  'Sector rotation and momentum crowding',
  'Whale-sized sweep activity',
  'Event headline risk in the next 48 hours',
  'Dealer gamma imbalance into close',
  'Elevated retail options participation'
];

const PREMIUM_SPIKE_LARGE_CAPS = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'GOOGL',
  'META',
  'TSLA',
  'AMD',
  'AVGO',
  'NFLX',
  'JPM',
  'BAC',
  'SPY',
  'QQQ'
];

const INSIDER_TRADE_SYMBOLS = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'GOOGL',
  'META',
  'TSLA',
  'AMD',
  'AVGO',
  'JPM',
  'BAC',
  'WMT',
  'COST',
  'NFLX'
];

const INSIDER_TRADE_ROLES = [
  'CEO',
  'CFO',
  'COO',
  'Director',
  'Chairman',
  'EVP',
  'President'
];

const INSIDER_TRADE_SOURCES = [
  'SEC Form 4 filings',
  'Unusual Whales style insider monitor',
  'AI cross-check (ChatGPT/Claude/Grok synthesis)'
];

const INSIDER_TRADE_SORT_OPTIONS = [
  'volume_desc',
  'volume_asc',
  'value_desc',
  'value_asc',
  'filed_desc',
  'filed_asc',
  'anomaly_desc',
  'anomaly_asc',
  'reaction_desc',
  'reaction_asc'
];

const POWER_PORTFOLIO_SORT_OPTIONS = [
  'score_desc',
  'ytd_desc',
  'aum_desc',
  'activity_desc'
];

const POWER_PORTFOLIO_BLUEPRINTS = [
  {
    id: 'berkshire',
    manager: 'Warren Buffett',
    firm: 'Berkshire Hathaway',
    style: 'Value + durable moats',
    baseAumUsd: 910_000_000_000,
    holdings: ['AAPL', 'BAC', 'AXP', 'KO', 'OXY']
  },
  {
    id: 'pershing',
    manager: 'Bill Ackman',
    firm: 'Pershing Square',
    style: 'Concentrated activist',
    baseAumUsd: 18_000_000_000,
    holdings: ['GOOGL', 'CMG', 'HLT', 'LOW', 'QSR']
  },
  {
    id: 'bridgewater',
    manager: 'Ray Dalio',
    firm: 'Bridgewater Associates',
    style: 'Macro + risk parity',
    baseAumUsd: 125_000_000_000,
    holdings: ['SPY', 'QQQ', 'JNJ', 'PG', 'XLP']
  },
  {
    id: 'soros',
    manager: 'George Soros',
    firm: 'Soros Fund Management',
    style: 'Macro event-driven',
    baseAumUsd: 28_000_000_000,
    holdings: ['NVDA', 'AMZN', 'META', 'MSFT', 'TSLA']
  },
  {
    id: 'paulson',
    manager: 'John Paulson',
    firm: 'Paulson & Co.',
    style: 'Event + merger arbitrage',
    baseAumUsd: 9_000_000_000,
    holdings: ['JPM', 'BAC', 'NKE', 'XOM', 'CVX']
  },
  {
    id: 'druckenmiller',
    manager: 'Stanley Druckenmiller',
    firm: 'Duquesne Family Office',
    style: 'Top-down tactical growth',
    baseAumUsd: 15_000_000_000,
    holdings: ['NVDA', 'AMZN', 'AAPL', 'MSFT', 'AVGO']
  },
  {
    id: 'cooperman',
    manager: 'Leon Cooperman',
    firm: 'Omega Family Office',
    style: 'Fundamental value',
    baseAumUsd: 3_800_000_000,
    holdings: ['C', 'BMY', 'MRK', 'WFC', 'CVX']
  },
  {
    id: 'cathie',
    manager: 'Cathie Wood',
    firm: 'ARK Invest',
    style: 'Disruptive innovation',
    baseAumUsd: 14_000_000_000,
    holdings: ['TSLA', 'COIN', 'ROKU', 'SQ', 'PLTR']
  },
  {
    id: 'loh',
    manager: 'Chase Coleman',
    firm: 'Tiger Global',
    style: 'Growth + internet platform focus',
    baseAumUsd: 42_000_000_000,
    holdings: ['META', 'AMZN', 'MSFT', 'GOOGL', 'NFLX']
  },
  {
    id: 'tepper',
    manager: 'David Tepper',
    firm: 'Appaloosa',
    style: 'Credit + opportunistic equity',
    baseAumUsd: 13_000_000_000,
    holdings: ['AAPL', 'META', 'AMD', 'MU', 'QQQ']
  }
];

const PORTFOLIO_TRADE_ACTIONS = ['buy', 'sell', 'add', 'trim'];
const PORTFOLIO_TRADE_THEMES = [
  'earnings momentum',
  'valuation reset',
  'AI capex cycle',
  'macro policy hedge',
  'sector rotation',
  'cash-flow durability',
  'risk rebalance',
  'event-driven catalyst'
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

const AI_TRADE_MODELS = ['Grok', 'ChatGPT', 'Claude AI', 'Anthropic'];
const AI_TRADE_TIMEFRAMES = new Set(['scalp', 'intraday', 'swing', 'position']);
const AI_ANALYZER_DIRECTIONS = new Set(['long', 'short']);

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

function isLikelyTradableTicker(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized || normalized.includes('.')) {
    return false;
  }
  if (normalized.length > 5) {
    return false;
  }
  if (normalized.endsWith('F') || normalized.endsWith('Y') || normalized.endsWith('Q')) {
    return false;
  }
  return true;
}

function isoDateInTimeZone(date = new Date(), timeZone = MARKET_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

function todayIsoDate() {
  return isoDateInTimeZone(new Date(), MARKET_TIME_ZONE);
}

function addDaysToIsoDate(isoDate, days) {
  const parsed = new Date(`${String(isoDate || '').trim()}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return todayIsoDate();
  }
  parsed.setUTCDate(parsed.getUTCDate() + Math.trunc(days));
  return parsed.toISOString().slice(0, 10);
}

function resolveEarningsTargetDate(rawTargetDate) {
  const normalized = String(rawTargetDate || '').trim().toLowerCase();
  if (normalized === 'today') {
    return todayIsoDate();
  }
  if (normalized === 'tomorrow' || !normalized) {
    return addDaysToIsoDate(todayIsoDate(), 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  return addDaysToIsoDate(todayIsoDate(), 1);
}

function normalizeEarningsSessionFilter(rawSession) {
  const normalized = String(rawSession || '').trim().toLowerCase();
  if (normalized === 'pre-market' || normalized === 'premarket' || normalized === 'pre') {
    return 'pre-market';
  }
  if (normalized === 'after-hours' || normalized === 'afterhours' || normalized === 'after') {
    return 'after-hours';
  }
  return 'all';
}

function matchesEarningsSession(entry, sessionFilter) {
  if (sessionFilter === 'all') {
    return true;
  }
  const reportTime = String(entry?.reportTime || '').toLowerCase();
  if (sessionFilter === 'pre-market') {
    return reportTime.includes('pre-market') || reportTime.includes('before-market');
  }
  if (sessionFilter === 'after-hours') {
    return reportTime.includes('after-hours') || reportTime.includes('after-market');
  }
  return true;
}

function getEarningsSessionRank(reportTimeLabel) {
  const reportTime = String(reportTimeLabel || '').toLowerCase();
  if (reportTime.includes('pre-market') || reportTime.includes('before-market')) {
    return 0;
  }
  if (reportTime.includes('after-hours') || reportTime.includes('after-market')) {
    return 1;
  }
  if (reportTime.includes('session unconfirmed') || reportTime.includes('unknown')) {
    return 2;
  }
  return 3;
}

function humanizeEarningsScheduleLabel(targetDate, effectiveDate) {
  const target = String(targetDate || '').trim();
  const effective = String(effectiveDate || '').trim();
  if (target && effective === target) {
    return `Earnings board (${formatIsoDate(effective)} ET)`;
  }
  const today = todayIsoDate();
  const tomorrow = addDaysToIsoDate(today, 1);
  if (effective === today) {
    return `Today's earnings (${formatIsoDate(effective)} ET)`;
  }
  if (effective === tomorrow) {
    return `Tomorrow's earnings (${formatIsoDate(effective)} ET)`;
  }
  return `Next live earnings day (${formatIsoDate(effective)} ET)`;
}

function getEtNowClock() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return {
    isoDate: `${year}-${month}-${day}`,
    minutesIntoDay: hour * 60 + minute
  };
}

function earningsSessionCutoffMinutes(reportTimeLabel) {
  const label = String(reportTimeLabel || '').toLowerCase();
  if (label.includes('pre-market') || label.includes('before-market')) {
    return 9 * 60 + 30;
  }
  if (label.includes('after-hours') || label.includes('after-market')) {
    return 16 * 60 + 30;
  }
  return 16 * 60 + 30;
}

function filterCompletedEarnings(rows) {
  const nowEt = getEtNowClock();
  return rows.filter((entry) => {
    const eventDate = String(entry.earningsDate || '').trim();
    if (!eventDate) {
      return false;
    }
    if (eventDate > nowEt.isoDate) {
      return true;
    }
    if (eventDate < nowEt.isoDate) {
      return false;
    }
    return nowEt.minutesIntoDay < earningsSessionCutoffMinutes(entry.reportTime);
  });
}

function buildEarningsVerification(entry, context = {}) {
  const source = String(context.source || 'simulated').toLowerCase();
  const volumeSource = String(entry.volumeSource || 'model_estimate').toLowerCase();
  const symbol = normalizeSymbol(entry.symbol || '');
  const hasRecentNews = Number(context.recentNewsCount || 0) > 0;
  const hasLiveVolume = volumeSource.includes('yahoo') || volumeSource.includes('stooq');
  const hasCalendarProvider = source === 'nasdaq' || source === 'alphavantage';
  const symbolLooksTradable = isLikelyTradableTicker(symbol);

  const checks = [
    { name: 'calendar_provider', passed: hasCalendarProvider },
    { name: 'live_volume', passed: hasLiveVolume },
    { name: 'tradable_symbol_format', passed: symbolLooksTradable },
    { name: 'recent_news', passed: hasRecentNews }
  ];

  const passedCount = checks.filter((check) => check.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  let status = 'estimated';
  if (passedCount >= 3 && hasLiveVolume && hasCalendarProvider) {
    status = 'verified_high';
  } else if (passedCount >= 2 && hasCalendarProvider) {
    status = 'verified_medium';
  }

  return {
    status,
    score,
    checks
  };
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

function formatIsoDate(isoDate) {
  if (!isoDate) {
    return 'TBD';
  }
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function parseMarketCapUsd(rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) {
    return 0;
  }
  const cleaned = text.replace(/[$,]/g, '');
  const unit = cleaned.slice(-1).toUpperCase();
  const hasUnit = ['T', 'B', 'M', 'K'].includes(unit);
  const numericPortion = hasUnit ? cleaned.slice(0, -1) : cleaned;
  const numeric = Number.parseFloat(numericPortion);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (!hasUnit) {
    return Math.round(numeric);
  }
  const multiplier = {
    T: 1_000_000_000_000,
    B: 1_000_000_000,
    M: 1_000_000,
    K: 1_000
  }[unit];
  return Math.round(numeric * multiplier);
}

function parseNasdaqDate(rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) {
    return null;
  }
  const compactDateMatch = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDateMatch) {
    const year = compactDateMatch[1];
    const month = compactDateMatch[2];
    const day = compactDateMatch[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function sessionFromNasdaqTimeClass(timeClass) {
  const normalized = String(timeClass || '').toLowerCase();
  if (normalized.includes('pre-market') || normalized.includes('before-market')) {
    return 'Pre-Market';
  }
  if (normalized.includes('after-hours') || normalized.includes('after-market')) {
    return 'After-Hours';
  }
  return 'Unknown';
}

async function safeFetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 2500;
  const requestOptions = { ...options };
  delete requestOptions.timeoutMs;
  try {
    const response = await fetch(url, {
      ...requestOptions,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (_error) {
    return null;
  }
}

async function safeFetchText(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 2500;
  const requestOptions = { ...options };
  delete requestOptions.timeoutMs;
  try {
    const response = await fetch(url, {
      ...requestOptions,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch (_error) {
    return null;
  }
}

function normalizeYahooTicker(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/\./g, '-');
}

async function validateTickerViaYahooQuote(symbol) {
  const yahooSymbol = normalizeYahooTicker(symbol);
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbol)}`;
  const payload = await safeFetchJson(url, { timeoutMs: 5000 });
  if (!payload) {
    return {
      valid: false,
      definitiveInvalid: false
    };
  }
  const rows = payload?.quoteResponse?.result;
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      valid: false,
      definitiveInvalid: true
    };
  }
  const match = rows.find((row) => String(row?.symbol || '').toUpperCase() === yahooSymbol) || rows[0];
  if (!match) {
    return {
      valid: false,
      definitiveInvalid: true
    };
  }
  const quoteType = String(match.quoteType || '').toUpperCase();
  const hasName = Boolean(String(match.shortName || '').trim() || String(match.longName || '').trim());
  const hasPrice = Number.isFinite(Number(match.regularMarketPrice));
  const isTradableType = ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'].includes(quoteType);
  if ((isTradableType && hasName) || hasPrice) {
    return {
      valid: true,
      definitiveInvalid: false
    };
  }
  return {
    valid: false,
    definitiveInvalid: true
  };
}

async function validateTickerViaYahooChart(symbol) {
  const yahooSymbol = normalizeYahooTicker(symbol);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`;
  const payload = await safeFetchJson(url, { timeoutMs: 5000 });
  if (!payload) {
    return {
      valid: false,
      definitiveInvalid: false
    };
  }
  const chartErrorCode = String(payload?.chart?.error?.code || '').toLowerCase();
  if (chartErrorCode.includes('not found')) {
    return {
      valid: false,
      definitiveInvalid: true
    };
  }
  const hasResult = Array.isArray(payload?.chart?.result) && payload.chart.result.length > 0;
  return {
    valid: hasResult,
    definitiveInvalid: !hasResult
  };
}

async function validateTickerViaStooq(symbol) {
  const lower = String(symbol || '').trim().toLowerCase();
  const stooqUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(`${lower}.us`)}&i=d`;
  const text = await safeFetchText(stooqUrl, { timeoutMs: 5000 });
  if (!text) {
    return {
      valid: false,
      definitiveInvalid: false
    };
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dataLine = lines.find((line) => line && !line.toLowerCase().startsWith('symbol,'));
  if (!dataLine) {
    return {
      valid: false,
      definitiveInvalid: true
    };
  }
  const parts = dataLine.split(',');
  const symbolPart = String(parts[0] || '').trim().toLowerCase();
  const closePart = String(parts[6] || '').trim().toUpperCase();
  const hasExpectedSymbol = symbolPart === `${lower}.us`;
  if (!hasExpectedSymbol || closePart === 'N/D') {
    return {
      valid: false,
      definitiveInvalid: true
    };
  }
  return {
    valid: true,
    definitiveInvalid: false
  };
}

async function validateTickerSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    return {
      valid: false,
      reason: 'invalid_ticker_format',
      source: 'input_validation'
    };
  }

  const cacheKey = normalized;
  const cached = tickerValidationCache.get(cacheKey);
  const now = Date.now();
  const cacheTtlMs = 10 * 60 * 1000;
  if (cached && now - cached.fetchedAt < cacheTtlMs) {
    return cached.result;
  }

  const quoteCheck = await validateTickerViaYahooQuote(normalized);
  if (quoteCheck.valid) {
    const result = {
      valid: true,
      reason: 'verified',
      source: 'yahoo_quote',
      symbol: normalized
    };
    tickerValidationCache.set(cacheKey, { fetchedAt: now, result });
    return result;
  }
  if (quoteCheck.definitiveInvalid) {
    const result = {
      valid: false,
      reason: 'ticker_not_found',
      source: 'yahoo_quote',
      symbol: normalized
    };
    tickerValidationCache.set(cacheKey, { fetchedAt: now, result });
    return result;
  }

  const chartCheck = await validateTickerViaYahooChart(normalized);
  if (chartCheck.valid) {
    const result = {
      valid: true,
      reason: 'verified',
      source: 'yahoo_chart',
      symbol: normalized
    };
    tickerValidationCache.set(cacheKey, { fetchedAt: now, result });
    return result;
  }
  if (chartCheck.definitiveInvalid) {
    const result = {
      valid: false,
      reason: 'ticker_not_found',
      source: 'yahoo_chart',
      symbol: normalized
    };
    tickerValidationCache.set(cacheKey, { fetchedAt: now, result });
    return result;
  }

  const stooqCheck = await validateTickerViaStooq(normalized);
  if (stooqCheck.valid) {
    const result = {
      valid: true,
      reason: 'verified',
      source: 'stooq',
      symbol: normalized
    };
    tickerValidationCache.set(cacheKey, { fetchedAt: now, result });
    return result;
  }
  if (stooqCheck.definitiveInvalid) {
    const result = {
      valid: false,
      reason: 'ticker_not_found',
      source: 'stooq',
      symbol: normalized
    };
    tickerValidationCache.set(cacheKey, { fetchedAt: now, result });
    return result;
  }

  return {
    valid: false,
    reason: 'verification_unavailable',
    source: 'network',
    symbol: normalized
  };
}

function normalizeNasdaqRows(rows, fallbackIsoDate) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => {
      const symbol = normalizeSymbol(row.symbol || row.ticker || row.Symbol || '');
      if (!symbol) {
        return null;
      }
      // Use the requested calendar date as the source of truth.
      // Some rows expose historical report fields that can be misleading.
      const earningsDate = fallbackIsoDate;
      const reportTime = sessionFromNasdaqTimeClass(row.time);
      return {
        symbol,
        earningsDate,
        reportTime,
        marketCapUsd: parseMarketCapUsd(row.marketCap)
      };
    })
    .filter((row) => row && row.symbol && row.earningsDate);
}

async function fetchNasdaqEarningsCalendar() {
  const now = Date.now();
  if (now - earningsCalendarCache.fetchedAt < EARNINGS_CALENDAR_CACHE_MS && earningsCalendarCache.items.length > 0) {
    return earningsCalendarCache.items;
  }

  const seen = new Set();
  const items = [];
  for (let offset = 0; offset < EARNINGS_CALENDAR_LOOKAHEAD_DAYS; offset += 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    const isoDate = date.toISOString().slice(0, 10);
    const url = `https://api.nasdaq.com/api/calendar/earnings?date=${isoDate}`;
    const payload = await safeFetchJson(url, { headers: NASDAQ_EARNINGS_HEADERS });
    const rows = payload?.data?.rows || [];
    const normalizedRows = normalizeNasdaqRows(rows, isoDate);
    normalizedRows.forEach((entry) => {
      const dedupe = `${entry.symbol}:${entry.earningsDate}:${entry.reportTime}`;
      if (seen.has(dedupe)) {
        return;
      }
      seen.add(dedupe);
      items.push(entry);
    });
  }

  earningsCalendarCache = {
    fetchedAt: now,
    items
  };
  return items;
}

function extractRssItems(xmlText) {
  if (!xmlText) {
    return [];
  }
  const items = [];
  const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  itemMatches.forEach((itemXml) => {
    const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || itemXml.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const title = titleMatch ? String(titleMatch[1]).trim() : '';
    const link = linkMatch ? String(linkMatch[1]).trim() : '';
    const publishedAt = pubDateMatch ? String(pubDateMatch[1]).trim() : '';
    if (!title || !link) {
      return;
    }
    items.push({
      title,
      url: link,
      publishedAt
    });
  });
  return items;
}

async function fetchTickerNews(symbol, limit = 3) {
  const cacheKey = `${symbol}:${Math.max(1, Math.trunc(limit))}`;
  const now = Date.now();
  const cached = newsCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < 15 * 60 * 1000) {
    return cached.items;
  }

  const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
  const xml = await safeFetchText(rssUrl);
  const parsed = extractRssItems(xml).slice(0, Math.max(1, Math.trunc(limit)));
  newsCache.set(cacheKey, {
    fetchedAt: now,
    items: parsed
  });
  return parsed;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => String(value || '').trim());
}

function sessionFromAlphaVantageTimeOfDay(timeOfTheDay) {
  const normalized = String(timeOfTheDay || '').trim().toLowerCase();
  if (normalized.includes('pre')) {
    return 'Pre-Market';
  }
  if (normalized.includes('post') || normalized.includes('after')) {
    return 'After-Hours';
  }
  return 'Unknown';
}

function isLikelyUsCommonTicker(symbol) {
  const value = normalizeSymbol(symbol);
  return /^[A-Z]{1,5}$/.test(value);
}

async function fetchAlphaVantageEarningsByDate(isoDate) {
  const apiKey = String(process.env.ALPHAVANTAGE_API_KEY || 'demo').trim() || 'demo';
  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${encodeURIComponent(apiKey)}`;
  const csvText = await safeFetchText(url, { timeoutMs: 12000 });
  if (!csvText) {
    return [];
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return [];
  }

  const rows = [];
  const dedupe = new Set();
  for (let i = 1; i < lines.length; i += 1) {
    const columns = parseCsvLine(lines[i]);
    const symbol = normalizeSymbol(columns[0] || '');
    const reportDate = String(columns[2] || '');
    if (!symbol || !isLikelyUsCommonTicker(symbol) || reportDate !== isoDate || dedupe.has(symbol)) {
      continue;
    }
    dedupe.add(symbol);
    rows.push({
      symbol,
      earningsDate: reportDate,
      reportTime: sessionFromAlphaVantageTimeOfDay(columns[6]),
      marketCapUsd: 0
    });
  }

  return rows;
}

async function fetchLatestVolumeForSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) {
    return {
      volume: 0,
      source: 'missing'
    };
  }

  const lower = normalized.toLowerCase();
  const chartUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}?range=5d&interval=1d`;
  const chartPayload = await safeFetchJson(chartUrl, { timeoutMs: 8000 });
  const volumeSeries = chartPayload?.chart?.result?.[0]?.indicators?.quote?.[0]?.volume;
  if (Array.isArray(volumeSeries)) {
    for (let i = volumeSeries.length - 1; i >= 0; i -= 1) {
      const candidate = Number(volumeSeries[i] || 0);
      if (Number.isFinite(candidate) && candidate > 0) {
        return {
          volume: Math.round(candidate),
          source: 'yahoo_chart_volume'
        };
      }
    }
  }

  const stooqUrl = `https://stooq.com/q/l/?s=${encodeURIComponent(`${lower}.us`)}&i=d`;
  const stooqText = await safeFetchText(stooqUrl, { timeoutMs: 8000 });
  if (stooqText) {
    const line = stooqText.trim().split(/\r?\n/).find((row) => row && !row.startsWith('Symbol'));
    if (line) {
      const parts = line.split(',');
      const volume = Number(parts[7] || 0);
      if (Number.isFinite(volume) && volume > 0) {
        return {
          volume: Math.round(volume),
          source: 'stooq_daily_volume'
        };
      }
    }
  }

  return {
    volume: 0,
    source: 'missing'
  };
}

async function fetchYahooQuoteVolumeMap(symbols) {
  const uniqueSymbols = [...new Set((Array.isArray(symbols) ? symbols : []).map((symbol) => normalizeSymbol(symbol)).filter(Boolean))];
  if (uniqueSymbols.length === 0) {
    return {};
  }

  const now = Date.now();
  const staleMs = 10 * 60 * 1000;
  const volumes = {};
  const missingSymbols = [];

  uniqueSymbols.forEach((symbol) => {
    const cached = quoteVolumeCache.get(symbol);
    if (cached && now - cached.fetchedAt < staleMs) {
      volumes[symbol] = {
        volume: cached.volume,
        source: cached.source
      };
    } else {
      missingSymbols.push(symbol);
    }
  });

  if (missingSymbols.length === 0) {
    return volumes;
  }

  await Promise.all(missingSymbols.map(async (symbol) => {
    const latest = await fetchLatestVolumeForSymbol(symbol);
    quoteVolumeCache.set(symbol, {
      fetchedAt: now,
      volume: latest.volume,
      source: latest.source
    });

    volumes[symbol] = {
      volume: latest.volume,
      source: latest.source
    };
  }));

  uniqueSymbols.forEach((symbol) => {
    if (!volumes[symbol]) {
      const cached = quoteVolumeCache.get(symbol);
      quoteVolumeCache.set(symbol, {
        fetchedAt: now,
        volume: Number(cached?.volume || 0),
        source: String(cached?.source || 'missing')
      });
      volumes[symbol] = {
        volume: Number(cached?.volume || 0),
        source: String(cached?.source || 'missing')
      };
    }
  });

  return volumes;
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

function estimateEarningsDayVolume(symbol, dateKey = tomorrowSeed()) {
  const base = EARNINGS_VOLUME_BASE[symbol] || 12_000_000;
  const seed = hashString(`earnings-volume:${symbol}:${dateKey}`);
  const multiplier = 0.85 + pseudoRandom(seed) * 1.1;
  const catalystBoost = Math.round(pseudoRandom(seed + 91) * 28_000_000);
  return Math.max(1_500_000, Math.round(base * multiplier + catalystBoost));
}

function buildEarningsIntel(symbol, volume, up, down, seedOffset, earningsDateLabel) {
  const seed = hashString(`earnings-intel:${symbol}:${earningsDateLabel}:${seedOffset}`);
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
    `${symbol}: sell-side note volume elevated ahead of the ${earningsDateLabel} print.`
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

async function getEarningsGamblingBoard(limit = 5, options = {}) {
  const seed = hashString(`earnings:${daySeed()}`);
  const boundedLimit = Math.max(1, Math.min(8, Math.trunc(limit)));
  const requestedDate = resolveEarningsTargetDate(options.targetDate);
  const requestedSession = normalizeEarningsSessionFilter(options.session);
  const calendarRows = await fetchNasdaqEarningsCalendar();

  let source = 'nasdaq';
  let scheduleDate = requestedDate;
  let scheduleLabel = humanizeEarningsScheduleLabel(requestedDate, requestedDate);
  let appliedSession = requestedSession;

  let selectedRows = calendarRows.filter((entry) => entry.earningsDate === requestedDate);
  if (selectedRows.length === 0) {
    const alphaRows = await fetchAlphaVantageEarningsByDate(requestedDate);
    if (alphaRows.length > 0) {
      selectedRows = alphaRows;
      source = 'alphavantage';
    }
  }

  const includeCompleted = Boolean(options.includeCompleted);
  if (!includeCompleted) {
    selectedRows = filterCompletedEarnings(selectedRows);
  }
  if (requestedSession !== 'all') {
    const filteredBySession = selectedRows.filter((entry) => matchesEarningsSession(entry, requestedSession));
    if (filteredBySession.length > 0) {
      selectedRows = filteredBySession;
    } else {
      appliedSession = 'all';
    }
  }

  if (selectedRows.length === 0 && calendarRows.length > 0) {
    const availableDates = [...new Set(calendarRows.map((entry) => entry.earningsDate).filter(Boolean))].sort();
    const nowEtDate = todayIsoDate();
    const selectDateBySession = (dateFilter) => availableDates.find((isoDate) => {
      if (!dateFilter(isoDate)) {
        return false;
      }
      let rows = calendarRows.filter((entry) => entry.earningsDate === isoDate);
      if (!includeCompleted) {
        rows = filterCompletedEarnings(rows);
      }
      if (requestedSession !== 'all') {
        rows = rows.filter((entry) => matchesEarningsSession(entry, requestedSession));
      }
      return rows.length > 0;
    });
    const selectedDate = selectDateBySession((isoDate) => isoDate > nowEtDate)
      || selectDateBySession((isoDate) => isoDate >= requestedDate)
      || availableDates.find((isoDate) => isoDate > nowEtDate)
      || availableDates.find((isoDate) => isoDate >= requestedDate)
      || availableDates[0]
      || requestedDate;
    selectedRows = calendarRows.filter((entry) => entry.earningsDate === selectedDate);
    if (!includeCompleted) {
      selectedRows = filterCompletedEarnings(selectedRows);
    }
    if (requestedSession !== 'all') {
      const filteredBySession = selectedRows.filter((entry) => matchesEarningsSession(entry, requestedSession));
      if (filteredBySession.length > 0) {
        selectedRows = filteredBySession;
        appliedSession = requestedSession;
      } else {
        appliedSession = 'all';
      }
    }
    scheduleDate = selectedDate;
    scheduleLabel = humanizeEarningsScheduleLabel(requestedDate, selectedDate);
    source = 'nasdaq';
  }

  const symbolsForSelectedDate = selectedRows.map((entry) => entry.symbol);
  const yahooVolumes = await fetchYahooQuoteVolumeMap(symbolsForSelectedDate);

  let rankedByVolume = selectedRows
    .map((entry) => {
      const estimatedVolume = estimateEarningsDayVolume(entry.symbol, entry.earningsDate);
      const yahooVolume = Number(yahooVolumes[entry.symbol]?.volume || 0);
      const hasYahooVolume = Number.isFinite(yahooVolume) && yahooVolume > 0;
      const marketCapWeight = entry.marketCapUsd > 0 ? Math.round(Math.sqrt(entry.marketCapUsd)) : 0;
      const verification = buildEarningsVerification({
        ...entry,
        volumeSource: hasYahooVolume ? (yahooVolumes[entry.symbol]?.source || 'yahoo') : 'model_estimate'
      }, { source });
      return {
        ...entry,
        estimatedVolume: hasYahooVolume ? yahooVolume : estimatedVolume + marketCapWeight,
        volumeSource: hasYahooVolume ? (yahooVolumes[entry.symbol]?.source || 'yahoo') : 'model_estimate',
        verification
      };
    })
    .filter((entry) => source !== 'alphavantage' || isLikelyTradableTicker(entry.symbol));

  if (rankedByVolume.length === 0) {
    const fallbackDate = requestedDate;
    const fallbackSessionLabel = requestedSession === 'after-hours' ? 'After-Hours' : 'Pre-Market';
    rankedByVolume = TOMORROW_EARNINGS_CALLS.map((symbol) => ({
      symbol,
      earningsDate: fallbackDate,
      reportTime: fallbackSessionLabel,
      estimatedVolume: estimateEarningsDayVolume(symbol, fallbackDate),
      volumeSource: 'model_estimate',
      verification: buildEarningsVerification(
        {
          symbol,
          volumeSource: 'model_estimate'
        },
        { source: 'simulated' }
      )
    }))
      .sort((a, b) => b.estimatedVolume - a.estimatedVolume);
    source = 'simulated';
    scheduleDate = fallbackDate;
    scheduleLabel = `Estimated earnings board (${formatIsoDate(fallbackDate)} ET)`;
    appliedSession = requestedSession === 'all' ? 'pre-market' : requestedSession;
  }

  rankedByVolume = rankedByVolume
    .sort((a, b) => {
      const bySession = getEarningsSessionRank(a.reportTime) - getEarningsSessionRank(b.reportTime);
      if (bySession !== 0) {
        return bySession;
      }
      return b.estimatedVolume - a.estimatedVolume;
    })
    .slice(0, boundedLimit);

  if (!scheduleDate) {
    scheduleDate = rankedByVolume[0]?.earningsDate || null;
  }
  const items = await Promise.all(rankedByVolume.map(async (entry, index) => {
    const symbol = entry.symbol;
    const up = clamp(Math.round(45 + pseudoRandom(seed + index + 120) * 25), 40, 70);
    const down = 100 - up;
    const predictedDirection = up >= down ? 'up' : 'down';
    const earningsDateLabel = formatIsoDate(entry.earningsDate);
    const intel = buildEarningsIntel(symbol, entry.estimatedVolume, up, down, index, earningsDateLabel);
    const recentNews = await fetchTickerNews(symbol, 3);
    const verification = buildEarningsVerification(entry, {
      source,
      recentNewsCount: recentNews.length
    });

    return {
      symbol,
      volume: entry.estimatedVolume,
      volumeSource: entry.volumeSource || 'model_estimate',
      verification,
      earningsDate: entry.earningsDate,
      earningsDateLabel,
      // Keep session labeling truthful: do not synthesize pre/after labels when provider time is unknown.
      reportTime: entry.reportTime === 'Unknown' ? 'Session Unconfirmed' : entry.reportTime,
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
      analystPushes: intel.analystPushes,
      recentNews
    };
  }));

  return {
    source,
    scheduleDate,
    scheduleLabel,
    requestedSession,
    appliedSession,
    items
  };
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

function getHighIvTracker(limit = 8) {
  const seed = hashString(`high-iv:${minuteBucketSeed()}`);
  const total = Math.max(1, Math.min(20, Math.trunc(limit)));
  const used = new Set();
  const items = [];

  for (let i = 0; i < total * 5 && items.length < total; i += 1) {
    const symbol = HIGH_IV_UNIVERSE[Math.floor(pseudoRandom(seed + i * 5) * HIGH_IV_UNIVERSE.length)];
    if (used.has(symbol)) {
      continue;
    }
    used.add(symbol);

    const impliedVolatility = Number((0.42 + pseudoRandom(seed + i * 7 + 1) * 0.95).toFixed(3));
    const ivRank = clamp(Math.round(65 + pseudoRandom(seed + i * 11 + 2) * 34), 60, 99);
    const ivPercentile = clamp(Math.round(70 + pseudoRandom(seed + i * 13 + 3) * 30), 70, 100);
    const expectedMovePct = Number((3.2 + pseudoRandom(seed + i * 17 + 4) * 14.8).toFixed(1));
    const premiumBias = pseudoRandom(seed + i * 19 + 5) > 0.5 ? 'Calls richer than puts' : 'Puts richer than calls';
    const sessionFocus = i % 2 === 0 ? 'Pre-Market focus' : 'After-Hours focus';
    const catalystA = HIGH_IV_CATALYSTS[Math.floor(pseudoRandom(seed + i * 23 + 6) * HIGH_IV_CATALYSTS.length)];
    const catalystB = HIGH_IV_CATALYSTS[Math.floor(pseudoRandom(seed + i * 29 + 7) * HIGH_IV_CATALYSTS.length)];
    const catalysts = catalystA === catalystB ? [catalystA] : [catalystA, catalystB];

    items.push({
      symbol,
      impliedVolatility,
      ivRank,
      ivPercentile,
      expectedMovePct,
      premiumBias,
      sessionFocus,
      catalysts
    });
  }

  items.sort((a, b) => b.ivRank - a.ivRank || b.impliedVolatility - a.impliedVolatility);

  return {
    generatedAt: new Date().toISOString(),
    baselineIv: 0.35,
    items
  };
}

function getPremiumSpikes(limit = 10) {
  const seed = hashString(`premium-spikes:${minuteBucketSeed()}`);
  const total = Math.max(1, Math.min(30, Math.trunc(limit)));
  const used = new Set();
  const items = [];

  for (let i = 0; i < total * 6 && items.length < total; i += 1) {
    const symbol = PREMIUM_SPIKE_LARGE_CAPS[Math.floor(pseudoRandom(seed + i * 5) * PREMIUM_SPIKE_LARGE_CAPS.length)];
    if (used.has(symbol)) {
      continue;
    }
    used.add(symbol);

    const isCallSpike = pseudoRandom(seed + i * 7 + 1) > 0.45;
    const side = isCallSpike ? 'call' : 'put';
    const oppositeSide = isCallSpike ? 'put' : 'call';

    const baselinePremiumUsd = Math.round((12 + pseudoRandom(seed + i * 11 + 2) * 95) * 1_000_000);
    const spikeMultiple = Number((2 + pseudoRandom(seed + i * 13 + 3) * 5.5).toFixed(2));
    const spikeAmountUsd = Math.round(baselinePremiumUsd * spikeMultiple);
    const oppositePremiumUsd = Math.round((8 + pseudoRandom(seed + i * 17 + 4) * 55) * 1_000_000);
    const totalPremiumUsd = spikeAmountUsd + oppositePremiumUsd;
    const putCallRatio = isCallSpike
      ? Number((oppositePremiumUsd / Math.max(spikeAmountUsd, 1)).toFixed(2))
      : Number((spikeAmountUsd / Math.max(oppositePremiumUsd, 1)).toFixed(2));

    const minutesAgo = 3 + Math.floor(pseudoRandom(seed + i * 19 + 5) * 120);
    const happenedAt = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
    const reactionPctRaw = (pseudoRandom(seed + i * 23 + 6) - 0.5) * 4.8;
    const reactionPct = Number(reactionPctRaw.toFixed(2));

    const hasReacted = Math.abs(reactionPct) >= 0.45;
    const expectedDirection = isCallSpike ? 'up' : 'down';
    const reactedDirection = reactionPct > 0 ? 'up' : reactionPct < 0 ? 'down' : 'flat';
    const reactionMatched = hasReacted && reactedDirection === expectedDirection;

    const reactionStatus = hasReacted
      ? (reactionMatched ? 'reacted_as_expected' : 'reacted_opposite')
      : 'no_clear_reaction_yet';
    const reactionLabel = reactionStatus === 'reacted_as_expected'
      ? 'Reacted (as expected)'
      : reactionStatus === 'reacted_opposite'
        ? 'Reacted (opposite)'
        : 'No clear reaction yet';

    items.push({
      symbol,
      premiumType: side,
      spikeAmountUsd,
      baselinePremiumUsd,
      spikeMultiple,
      callPremiumUsd: isCallSpike ? spikeAmountUsd : oppositePremiumUsd,
      putPremiumUsd: isCallSpike ? oppositePremiumUsd : spikeAmountUsd,
      totalPremiumUsd,
      putCallRatio,
      happenedAt,
      expectedDirection,
      reaction: {
        hasReacted,
        matchedExpectedDirection: reactionMatched,
        status: reactionStatus,
        label: reactionLabel,
        movePct: reactionPct
      }
    });
  }

  items.sort((a, b) => b.spikeAmountUsd - a.spikeAmountUsd);

  return {
    generatedAt: new Date().toISOString(),
    universe: 'high_volume_large_caps',
    source: 'Unusual Whales style premium monitor (simulated feed)',
    items
  };
}

function normalizeInsiderTradeSide(side) {
  const normalized = String(side || 'all').trim().toLowerCase();
  return normalized === 'buy' || normalized === 'sell' ? normalized : 'all';
}

function normalizeInsiderTradeSort(sortBy) {
  const normalized = String(sortBy || 'anomaly_desc').trim().toLowerCase();
  if (INSIDER_TRADE_SORT_OPTIONS.includes(normalized)) {
    return normalized;
  }
  return 'anomaly_desc';
}

function sanitizeInsiderSymbolFilter(symbol) {
  return String(symbol || '').toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 10);
}

function toRatioScore(value, min, max) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const bounded = clamp(Number(value), min, max);
  return Math.round(((bounded - min) / Math.max(max - min, 0.0001)) * 100);
}

function buildInsiderDirectionalBias(side, stockReactionPct, anomalyScore) {
  const normalizedSide = String(side || '').toLowerCase() === 'buy' ? 'buy' : 'sell';
  const reaction = Number.isFinite(Number(stockReactionPct)) ? Number(stockReactionPct) : 0;
  const anomaly = Number.isFinite(Number(anomalyScore)) ? Number(anomalyScore) : 50;
  const sidePush = normalizedSide === 'buy' ? 24 : -24;
  const reactionPush = reaction * 9;
  const anomalyPush = ((anomaly - 50) / 50) * 12;
  const score = clamp(Math.round(sidePush + reactionPush + anomalyPush), -100, 100);
  const absScore = Math.abs(score);
  const label = absScore < 10 ? 'neutral' : score > 0 ? 'bullish' : 'bearish';
  const confidencePct = label === 'neutral'
    ? clamp(52 + Math.round(absScore * 0.9), 52, 70)
    : clamp(58 + Math.round(absScore * 0.38), 58, 95);

  const baseBullish = normalizedSide === 'buy' ? 62 : 38;
  const reactionAdjustment = clamp(Math.round(reaction * 6), -24, 24);
  const scoreAdjustment = clamp(Math.round(score * 0.18), -18, 18);
  const directionalBullish = clamp(baseBullish + reactionAdjustment + scoreAdjustment, 5, 95);

  let neutralPct = 0;
  if (label === 'neutral') {
    neutralPct = clamp(45 + Math.round((10 - absScore) * 2.5), 45, 70);
  } else {
    neutralPct = clamp(10 + Math.round((100 - absScore) * 0.12), 5, 24);
  }
  const directionalBudget = 100 - neutralPct;
  const bullishPct = clamp(Math.round((directionalBullish / 100) * directionalBudget), 3, 97);
  const bearishPct = clamp(directionalBudget - bullishPct, 3, 97);
  neutralPct = 100 - bullishPct - bearishPct;

  const reason = label === 'bullish'
    ? 'Buy pressure and post-filing reaction support an upside tilt.'
    : label === 'bearish'
      ? 'Sell pressure and post-filing reaction support a downside tilt.'
      : 'Signals are mixed between filing side and post-filing reaction.';
  return {
    label,
    confidencePct,
    score,
    reason,
    bullishPct,
    bearishPct,
    neutralPct
  };
}

function normalizePortfolioSort(sortBy) {
  const normalized = String(sortBy || 'score_desc').trim().toLowerCase();
  if (POWER_PORTFOLIO_SORT_OPTIONS.includes(normalized)) {
    return normalized;
  }
  return 'score_desc';
}

function normalizePortfolioManagerQuery(rawManager) {
  return String(rawManager || '').trim().toLowerCase();
}

function buildPortfolioHoldings(blueprint, seed, portfolioAumUsd) {
  const baseWeights = [0.24, 0.2, 0.17, 0.14, 0.11];
  return blueprint.holdings.map((symbol, idx) => {
    const jitter = (pseudoRandom(seed + idx * 13 + 1) - 0.5) * 0.05;
    const weightPct = Number((Math.max(0.04, baseWeights[idx] + jitter) * 100).toFixed(2));
    const positionValueUsd = Math.round((weightPct / 100) * portfolioAumUsd);
    const dayMovePct = Number((((pseudoRandom(seed + idx * 17 + 2) - 0.5) * 6.8)).toFixed(2));
    const dayMoveSign = dayMovePct > 0 ? '+' : '';
    const conviction = weightPct >= 19 ? 'core' : weightPct >= 13 ? 'high' : 'support';
    return {
      symbol,
      weightPct,
      positionValueUsd,
      dayMovePct,
      dayMoveLabel: `${dayMoveSign}${dayMovePct.toFixed(2)}%`,
      conviction
    };
  });
}

function buildPortfolioRecentTrades(blueprint, seed) {
  const trades = [];
  const used = new Set();
  const total = 3 + Math.floor(pseudoRandom(seed + 41) * 4);
  for (let i = 0; i < total; i += 1) {
    const symbol = blueprint.holdings[Math.floor(pseudoRandom(seed + i * 7 + 3) * blueprint.holdings.length)];
    const action = PORTFOLIO_TRADE_ACTIONS[Math.floor(pseudoRandom(seed + i * 11 + 5) * PORTFOLIO_TRADE_ACTIONS.length)];
    const dedupeKey = `${symbol}:${action}`;
    if (used.has(dedupeKey)) {
      continue;
    }
    used.add(dedupeKey);
    const notionalUsd = Math.round((5 + pseudoRandom(seed + i * 13 + 7) * 220) * 1_000_000);
    const theme = PORTFOLIO_TRADE_THEMES[Math.floor(pseudoRandom(seed + i * 17 + 9) * PORTFOLIO_TRADE_THEMES.length)];
    const hoursAgo = 1 + Math.floor(pseudoRandom(seed + i * 19 + 11) * 72);
    trades.push({
      symbol,
      action,
      notionalUsd,
      theme,
      executedAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()
    });
  }
  trades.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  return trades;
}

function getPowerPortfolios(limit = 8, options = {}) {
  const total = Math.max(1, Math.min(20, Math.trunc(limit)));
  const sortBy = normalizePortfolioSort(options.sortBy);
  const managerQuery = normalizePortfolioManagerQuery(options.manager);
  const seedBase = hashString(`power-portfolios:${minuteBucketSeed()}`);

  let rows = POWER_PORTFOLIO_BLUEPRINTS.map((blueprint, idx) => {
    const seed = seedBase + idx * 101;
    const aumMultiplier = 0.9 + pseudoRandom(seed + 1) * 0.22;
    const aumUsd = Math.round(blueprint.baseAumUsd * aumMultiplier);
    const ytdReturnPct = Number((3 + pseudoRandom(seed + 3) * 28).toFixed(2));
    const oneYearReturnPct = Number((7 + pseudoRandom(seed + 5) * 44).toFixed(2));
    const sharpeRatio = Number((0.85 + pseudoRandom(seed + 7) * 1.75).toFixed(2));
    const maxDrawdownPct = Number((-(4 + pseudoRandom(seed + 9) * 19)).toFixed(2));
    const activity24h = 1 + Math.floor(pseudoRandom(seed + 11) * 8);
    const holdings = buildPortfolioHoldings(blueprint, seed, aumUsd);
    const recentTrades = buildPortfolioRecentTrades(blueprint, seed);
    const qualityScore = clamp(
      Math.round(
        toRatioScore(ytdReturnPct, 0, 35) * 0.42
        + toRatioScore(sharpeRatio, 0.7, 2.8) * 0.36
        + toRatioScore(activity24h, 0, 9) * 0.22
      ),
      1,
      99
    );
    return {
      id: blueprint.id,
      manager: blueprint.manager,
      firm: blueprint.firm,
      style: blueprint.style,
      aumUsd,
      performance: {
        ytdPct: ytdReturnPct,
        oneYearPct: oneYearReturnPct,
        sharpeRatio,
        maxDrawdownPct
      },
      activity: {
        trades24h: activity24h,
        latestTradeAt: recentTrades[0]?.executedAt || new Date().toISOString()
      },
      qualityScore,
      topHoldings: holdings,
      recentTrades
    };
  });

  if (managerQuery) {
    rows = rows.filter((row) => {
      const manager = String(row.manager || '').toLowerCase();
      const firm = String(row.firm || '').toLowerCase();
      return manager.includes(managerQuery) || firm.includes(managerQuery);
    });
  }

  if (sortBy === 'ytd_desc') {
    rows.sort((a, b) => b.performance.ytdPct - a.performance.ytdPct);
  } else if (sortBy === 'aum_desc') {
    rows.sort((a, b) => b.aumUsd - a.aumUsd);
  } else if (sortBy === 'activity_desc') {
    rows.sort((a, b) => b.activity.trades24h - a.activity.trades24h || b.qualityScore - a.qualityScore);
  } else {
    rows.sort((a, b) => b.qualityScore - a.qualityScore || b.performance.ytdPct - a.performance.ytdPct);
  }

  const trimmed = rows.slice(0, total);
  const topSignals = trimmed
    .flatMap((portfolio) => (portfolio.recentTrades || []).map((trade) => ({
      manager: portfolio.manager,
      firm: portfolio.firm,
      symbol: trade.symbol,
      action: trade.action,
      notionalUsd: trade.notionalUsd,
      executedAt: trade.executedAt
    })))
    .sort((a, b) => b.notionalUsd - a.notionalUsd)
    .slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    refreshCadenceSeconds: 60,
    source: 'Public 13F-style holdings + delayed trade-intent model (simulated feed)',
    filters: {
      manager: managerQuery,
      sortBy
    },
    availableSorts: POWER_PORTFOLIO_SORT_OPTIONS,
    totalMatches: rows.length,
    topSignals,
    items: trimmed
  };
}

function getInsiderTrades(limit = 10, options = {}) {
  const seed = hashString(`insider-trades:${minuteBucketSeed()}`);
  const total = Math.max(1, Math.min(30, Math.trunc(limit)));
  const sideFilter = normalizeInsiderTradeSide(options.side);
  const symbolFilter = sanitizeInsiderSymbolFilter(options.symbol);
  const sortBy = normalizeInsiderTradeSort(options.sortBy);
  const unusualOnly = String(options.unusualOnly || '').trim().toLowerCase() === 'true';
  const rawMinValue = Number(options.minValueUsd || 0);
  const minValueUsd = Number.isFinite(rawMinValue) && rawMinValue > 0
    ? Math.round(rawMinValue)
    : 0;
  const used = new Set();
  const items = [];

  for (let i = 0; i < total * 6 && items.length < total; i += 1) {
    const symbol = INSIDER_TRADE_SYMBOLS[Math.floor(pseudoRandom(seed + i * 5) * INSIDER_TRADE_SYMBOLS.length)];
    const role = INSIDER_TRADE_ROLES[Math.floor(pseudoRandom(seed + i * 7 + 1) * INSIDER_TRADE_ROLES.length)];
    const personTag = Math.floor(100 + pseudoRandom(seed + i * 11 + 2) * 900);
    const insiderName = `${role} #${personTag}`;
    const dedupeKey = `${symbol}:${insiderName}`;
    if (used.has(dedupeKey)) {
      continue;
    }
    used.add(dedupeKey);

    const side = pseudoRandom(seed + i * 13 + 3) > 0.45 ? 'buy' : 'sell';
    const shares = Math.round(25_000 + pseudoRandom(seed + i * 17 + 4) * 1_250_000);
    const avgPrice = Number((40 + pseudoRandom(seed + i * 19 + 5) * 520).toFixed(2));
    const valueUsd = Math.round(shares * avgPrice);
    const minutesAgo = 8 + Math.floor(pseudoRandom(seed + i * 23 + 6) * 720);
    const filedAt = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
    const stockReactionPct = Number((((pseudoRandom(seed + i * 29 + 7) - 0.5) * 7.2)).toFixed(2));
    const source = INSIDER_TRADE_SOURCES[Math.floor(pseudoRandom(seed + i * 31 + 8) * INSIDER_TRADE_SOURCES.length)];
    const conviction = valueUsd >= 100_000_000 ? 'very_high' : valueUsd >= 40_000_000 ? 'high' : 'medium';
    const unusualVolumeMultiple = Number((1.25 + pseudoRandom(seed + i * 37 + 9) * 6.35).toFixed(2));
    const baselineValueUsd = Math.max(1_000_000, Math.round(valueUsd / Math.max(unusualVolumeMultiple, 1)));
    const valueScore = toRatioScore(Math.log10(Math.max(valueUsd, 1)), 6.6, 8.4);
    const volumeScore = toRatioScore(unusualVolumeMultiple, 1, 7.6);
    const reactionScore = toRatioScore(Math.abs(stockReactionPct), 0, 7.2);
    const anomalyScore = clamp(
      Math.round(valueScore * 0.45 + volumeScore * 0.38 + reactionScore * 0.17),
      1,
      99
    );
    const directionalBias = buildInsiderDirectionalBias(side, stockReactionPct, anomalyScore);
    const unusualSignals = [];
    if (valueUsd >= 80_000_000) {
      unusualSignals.push('Block-size insider notional');
    }
    if (unusualVolumeMultiple >= 3.5) {
      unusualSignals.push(`Abnormal filing size (${unusualVolumeMultiple}x baseline)`);
    }
    if (Math.abs(stockReactionPct) >= 2.2) {
      unusualSignals.push(`Fast post-filing reaction (${stockReactionPct > 0 ? '+' : ''}${stockReactionPct}%)`);
    }
    if (!unusualSignals.length) {
      unusualSignals.push('Above-average insider print');
    }
    const isUnusual = anomalyScore >= 66 || unusualVolumeMultiple >= 3.5 || valueUsd >= 80_000_000;
    const signalSummary = isUnusual
      ? 'Unusual insider flow detected'
      : 'Standard insider flow signal';

    items.push({
      symbol,
      insiderName,
      role,
      side,
      shares,
      averagePriceUsd: avgPrice,
      valueUsd,
      baselineValueUsd,
      filedAt,
      stockReactionPct,
      unusualVolumeMultiple,
      flowVsAverageRatio: unusualVolumeMultiple,
      anomalyScore,
      directionalBias: {
        label: directionalBias.label,
        confidencePct: directionalBias.confidencePct,
        score: directionalBias.score,
        reason: directionalBias.reason,
        bullishPct: directionalBias.bullishPct,
        bearishPct: directionalBias.bearishPct,
        neutralPct: directionalBias.neutralPct
      },
      directionalBiasLabel: directionalBias.label,
      directionalBiasConfidencePct: directionalBias.confidencePct,
      directionalBiasScore: directionalBias.score,
      directionalBiasReason: directionalBias.reason,
      unusualSignals,
      signalSummary,
      isUnusual,
      screeningTag: isUnusual ? 'unusual_insider_activity' : 'standard_insider_activity',
      conviction,
      source,
      details: side === 'buy'
        ? `${role} accumulated shares; indicates potential internal confidence.`
        : `${role} sold shares; could be diversification, liquidity, or risk reduction.`
    });
  }

  let filtered = items.filter((item) => {
    if (sideFilter !== 'all' && item.side !== sideFilter) {
      return false;
    }
    if (symbolFilter && !item.symbol.includes(symbolFilter)) {
      return false;
    }
    if (minValueUsd > 0 && Number(item.valueUsd || 0) < minValueUsd) {
      return false;
    }
    if (unusualOnly && !item.isUnusual) {
      return false;
    }
    return true;
  });

  if (sortBy === 'value_asc') {
    filtered.sort((a, b) => a.valueUsd - b.valueUsd);
  } else if (sortBy === 'volume_desc') {
    filtered.sort((a, b) => b.flowVsAverageRatio - a.flowVsAverageRatio || b.valueUsd - a.valueUsd);
  } else if (sortBy === 'volume_asc') {
    filtered.sort((a, b) => a.flowVsAverageRatio - b.flowVsAverageRatio || a.valueUsd - b.valueUsd);
  } else if (sortBy === 'filed_desc') {
    filtered.sort((a, b) => new Date(b.filedAt).getTime() - new Date(a.filedAt).getTime());
  } else if (sortBy === 'filed_asc') {
    filtered.sort((a, b) => new Date(a.filedAt).getTime() - new Date(b.filedAt).getTime());
  } else if (sortBy === 'anomaly_desc') {
    filtered.sort((a, b) => b.anomalyScore - a.anomalyScore || b.valueUsd - a.valueUsd);
  } else if (sortBy === 'anomaly_asc') {
    filtered.sort((a, b) => a.anomalyScore - b.anomalyScore || a.valueUsd - b.valueUsd);
  } else if (sortBy === 'reaction_desc') {
    filtered.sort((a, b) => Math.abs(b.stockReactionPct) - Math.abs(a.stockReactionPct));
  } else if (sortBy === 'reaction_asc') {
    filtered.sort((a, b) => Math.abs(a.stockReactionPct) - Math.abs(b.stockReactionPct));
  } else {
    filtered.sort((a, b) => b.valueUsd - a.valueUsd);
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceDisclosure: 'Synthetic insider-activity monitor modeled from SEC Form 4 style events and AI synthesis.',
    filters: {
      side: sideFilter,
      symbol: symbolFilter,
      minValueUsd,
      sortBy,
      unusualOnly
    },
    availableSorts: INSIDER_TRADE_SORT_OPTIONS,
    unusualCount: filtered.filter((item) => item.isUnusual).length,
    totalMatches: filtered.length,
    items: filtered.slice(0, total)
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

function roundPrice(value) {
  return Number(Number(value || 0).toFixed(2));
}

function estimateBase64Bytes(base64Payload) {
  const text = String(base64Payload || '').replace(/\s+/g, '');
  if (!text) {
    return 0;
  }
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((text.length * 3) / 4) - padding);
}

function parseImageDataUrlMeta(imageDataUrl) {
  const text = String(imageDataUrl || '').trim();
  if (!text) {
    return null;
  }
  const match = text.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1].toLowerCase(),
    base64Payload: match[2]
  };
}

function getImageFileExtension(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp'
  };
  return map[normalized] || 'png';
}

function buildImageFingerprint(imageDataUrl) {
  const text = String(imageDataUrl || '');
  if (!text) {
    return '';
  }
  const signature = `${text.slice(0, 80)}:${text.slice(-80)}:${text.length}`;
  return hashString(signature).toString(16);
}

function getAiTradeBasePrice(symbol, currentPrice, seed) {
  const parsedCurrent = Number(currentPrice);
  if (Number.isFinite(parsedCurrent) && parsedCurrent > 0) {
    return roundPrice(parsedCurrent);
  }
  const symbolBias = 35 + (hashString(symbol) % 320);
  const synthetic = symbolBias + pseudoRandom(seed + 301) * 65;
  return roundPrice(synthetic);
}

function normalizeAiTradeTimeframe(rawTimeframe) {
  const timeframe = String(rawTimeframe || 'intraday').trim().toLowerCase();
  if (AI_TRADE_TIMEFRAMES.has(timeframe)) {
    return timeframe;
  }
  return 'intraday';
}

function getAiTradeRationale(consensusTrend, symbol, timeframe) {
  if (consensusTrend === 'bullish') {
    return [
      `${symbol} chart structure suggests higher lows on the ${timeframe} setup.`,
      'Momentum and volume profile favor continuation over mean reversion.',
      'Risk is defined below the invalidation zone to protect downside.'
    ];
  }
  return [
    `${symbol} structure is printing lower highs on the ${timeframe} setup.`,
    'Momentum deceleration and supply pressure favor downside continuation.',
    'Risk is defined above invalidation to avoid holding failed breakdowns.'
  ];
}

function normalizeAiAnalyzerDirection(rawDirection) {
  const direction = String(rawDirection || 'long').trim().toLowerCase();
  if (AI_ANALYZER_DIRECTIONS.has(direction)) {
    return direction;
  }
  return 'long';
}

function analyzeAiTradePattern({
  symbol = 'SPY',
  timeframe = 'intraday',
  currentPrice = 0,
  imageDataUrl = '',
  imageName = '',
  imageSize = 0,
  imageHash = ''
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeAiTradeTimeframe(timeframe);
  const normalizedImageDataUrl = String(imageDataUrl || '').trim();
  const normalizedImageName = String(imageName || '').trim();
  let normalizedImageHash = String(imageHash || '').trim();
  let normalizedImageSize = Number.isFinite(Number(imageSize)) ? Math.max(0, Math.trunc(Number(imageSize))) : 0;

  if (!normalizedImageDataUrl && !normalizedImageHash) {
    throw new Error('missing_image');
  }

  let imageMeta = null;
  if (normalizedImageDataUrl) {
    imageMeta = parseImageDataUrlMeta(normalizedImageDataUrl);
    if (!imageMeta) {
      throw new Error('invalid_image');
    }
    if (!normalizedImageSize) {
      normalizedImageSize = estimateBase64Bytes(imageMeta.base64Payload);
    }
    if (!normalizedImageHash) {
      normalizedImageHash = buildImageFingerprint(normalizedImageDataUrl);
    }
  }

  const resolvedImageName = normalizedImageName
    || `uploaded-pattern.${getImageFileExtension(imageMeta?.mimeType)}`;

  const seed = hashString(
    `ai-trade:${normalizedSymbol}:${normalizedTimeframe}:${daySeed()}:${normalizedImageHash}:${normalizedImageSize}:${resolvedImageName}`
  );
  const entryPrice = getAiTradeBasePrice(normalizedSymbol, currentPrice, seed);
  const bullishScore = clamp(
    Math.round(46 + pseudoRandom(seed + 11) * 34 + (pseudoRandom(seed + 13) - 0.5) * 10),
    20,
    86
  );
  const bearishScore = 100 - bullishScore;
  const consensusTrend = bullishScore >= bearishScore ? 'bullish' : 'bearish';
  const confidencePct = consensusTrend === 'bullish' ? bullishScore : bearishScore;

  const stopRiskPct = 0.012 + pseudoRandom(seed + 17) * 0.02;
  const rewardPct = stopRiskPct * (1.7 + pseudoRandom(seed + 19) * 1.8);

  const stopLoss = consensusTrend === 'bullish'
    ? roundPrice(entryPrice * (1 - stopRiskPct))
    : roundPrice(entryPrice * (1 + stopRiskPct));
  const takeProfit = consensusTrend === 'bullish'
    ? roundPrice(entryPrice * (1 + rewardPct))
    : roundPrice(entryPrice * (1 - rewardPct));
  const riskRewardRatio = roundPrice(
    Math.abs((takeProfit - entryPrice) / Math.max(Math.abs(entryPrice - stopLoss), 0.0001))
  );

  const modelVotes = AI_TRADE_MODELS.map((model, index) => {
    const tilt = (pseudoRandom(seed + 31 + index * 23) - 0.5) * 22;
    const modelBullish = clamp(Math.round(bullishScore + tilt), 18, 88);
    const modelBearish = 100 - modelBullish;
    const modelTrend = modelBullish >= modelBearish ? 'bullish' : 'bearish';
    const confidence = modelTrend === 'bullish' ? modelBullish : modelBearish;
    return {
      model,
      trend: modelTrend,
      confidencePct: confidence,
      signal: modelTrend === 'bullish'
        ? `${model} sees breakout continuation with controlled pullback risk.`
        : `${model} sees breakdown continuation with weak rebound quality.`
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    ticker: normalizedSymbol,
    timeframe: normalizedTimeframe,
    image: {
      name: resolvedImageName,
      sizeBytes: normalizedImageSize,
      fingerprint: normalizedImageHash ? `${normalizedImageHash.slice(0, 16)}...` : 'not_provided'
    },
    consensus: {
      trend: consensusTrend,
      confidencePct,
      entryPrice,
      stopLoss,
      takeProfit,
      riskRewardRatio,
      rationale: getAiTradeRationale(consensusTrend, normalizedSymbol, normalizedTimeframe)
    },
    modelVotes,
    riskControls: [
      'Risk no more than 1-2% of account equity per trade.',
      'Do not widen stop loss after entry.',
      'Take partial profits into strength/weakness as target approaches.'
    ]
  };
}

function buildAiAnalyzerReview(model, score, direction, timeframe, symbol) {
  const isPositive = score >= 60;
  if (isPositive) {
    return `${model}: setup quality looks solid for a ${direction} ${timeframe} ${symbol} trade with acceptable risk control.`;
  }
  return `${model}: setup quality is weak for a ${direction} ${timeframe} ${symbol} trade; tighter confirmation is needed.`;
}

function getAiAnalyzerPatternCatalog(direction) {
  const isLong = direction === 'long';
  return [
    {
      name: 'Bull Flag',
      type: 'continuation',
      bias: 'bullish',
      isDirectionalMatch: isLong
    },
    {
      name: 'Bear Flag',
      type: 'continuation',
      bias: 'bearish',
      isDirectionalMatch: !isLong
    },
    {
      name: 'Ascending Triangle',
      type: 'breakout',
      bias: 'bullish',
      isDirectionalMatch: isLong
    },
    {
      name: 'Descending Triangle',
      type: 'breakdown',
      bias: 'bearish',
      isDirectionalMatch: !isLong
    },
    {
      name: 'Cup and Handle',
      type: 'reversal',
      bias: 'bullish',
      isDirectionalMatch: isLong
    },
    {
      name: 'Head and Shoulders',
      type: 'reversal',
      bias: 'bearish',
      isDirectionalMatch: !isLong
    },
    {
      name: 'Double Bottom',
      type: 'reversal',
      bias: 'bullish',
      isDirectionalMatch: isLong
    },
    {
      name: 'Double Top',
      type: 'reversal',
      bias: 'bearish',
      isDirectionalMatch: !isLong
    }
  ];
}

function getPossibleActivePatterns({ seed, direction, timeframe, symbol }) {
  const catalog = getAiAnalyzerPatternCatalog(direction);
  const scored = catalog.map((pattern, index) => {
    const confidence = clamp(
      Math.round(42 + pseudoRandom(seed + 101 + index * 29) * 52 + (pattern.isDirectionalMatch ? 7 : -5)),
      28,
      96
    );
    const status = confidence >= 72 ? 'active' : confidence >= 58 ? 'forming' : 'watch';
    const rationale = pattern.isDirectionalMatch
      ? `${pattern.name} aligns with the ${direction} ${timeframe} flow seen in ${symbol}.`
      : `${pattern.name} is a secondary path if price rejects current ${direction} pressure.`;
    return {
      pattern: pattern.name,
      type: pattern.type,
      bias: pattern.bias,
      confidencePct: confidence,
      status,
      rationale
    };
  });
  scored.sort((a, b) => b.confidencePct - a.confidencePct);
  return scored.slice(0, 4);
}

function analyzeAiTradeScreenshot({
  symbol = 'SPY',
  timeframe = 'intraday',
  direction = 'long',
  entryPrice = 0,
  exitPrice = 0,
  imageDataUrl = '',
  imageName = '',
  imageSize = 0,
  imageHash = ''
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeAiTradeTimeframe(timeframe);
  const normalizedDirection = normalizeAiAnalyzerDirection(direction);
  const normalizedImageDataUrl = String(imageDataUrl || '').trim();
  const normalizedImageName = String(imageName || '').trim();
  let normalizedImageHash = String(imageHash || '').trim();
  let normalizedImageSize = Number.isFinite(Number(imageSize)) ? Math.max(0, Math.trunc(Number(imageSize))) : 0;

  if (!normalizedImageDataUrl && !normalizedImageHash) {
    throw new Error('missing_image');
  }

  let imageMeta = null;
  if (normalizedImageDataUrl) {
    imageMeta = parseImageDataUrlMeta(normalizedImageDataUrl);
    if (!imageMeta) {
      throw new Error('invalid_image');
    }
    if (!normalizedImageSize) {
      normalizedImageSize = estimateBase64Bytes(imageMeta.base64Payload);
    }
    if (!normalizedImageHash) {
      normalizedImageHash = buildImageFingerprint(normalizedImageDataUrl);
    }
  }

  const resolvedImageName = normalizedImageName
    || `uploaded-screenshot.${getImageFileExtension(imageMeta?.mimeType)}`;
  const seed = hashString(
    `ai-analyzer:${normalizedSymbol}:${normalizedTimeframe}:${normalizedDirection}:${daySeed()}:${normalizedImageHash}:${normalizedImageSize}:${resolvedImageName}`
  );

  const entry = Number.isFinite(Number(entryPrice)) && Number(entryPrice) > 0
    ? roundPrice(Number(entryPrice))
    : getAiTradeBasePrice(normalizedSymbol, 0, seed + 37);
  const exit = Number.isFinite(Number(exitPrice)) && Number(exitPrice) > 0
    ? roundPrice(Number(exitPrice))
    : 0;

  const structureScore = clamp(Math.round(45 + pseudoRandom(seed + 5) * 45), 18, 92);
  const riskScore = clamp(Math.round(42 + pseudoRandom(seed + 7) * 48), 15, 95);
  const timingScore = clamp(Math.round(40 + pseudoRandom(seed + 11) * 50), 12, 95);
  const hasExit = exit > 0;
  const directionMultiplier = normalizedDirection === 'long' ? 1 : -1;
  const realizedPct = hasExit
    ? ((exit - entry) / Math.max(entry, 0.0001)) * 100 * directionMultiplier
    : 0;
  const realizedScore = hasExit
    ? clamp(Math.round(50 + realizedPct * 3), 5, 97)
    : clamp(Math.round(46 + pseudoRandom(seed + 13) * 24), 30, 78);
  const qualityScore = clamp(
    Math.round((structureScore * 0.35) + (riskScore * 0.3) + (timingScore * 0.2) + (realizedScore * 0.15)),
    8,
    98
  );

  const verdict = qualityScore >= 68 ? 'good_trade' : qualityScore >= 52 ? 'mixed_trade' : 'weak_trade';
  const verdictLabel = verdict === 'good_trade'
    ? 'Good trade setup'
    : verdict === 'mixed_trade'
      ? 'Mixed setup'
      : 'Not a good trade setup';

  const modelReviews = AI_TRADE_MODELS.map((model, index) => {
    const tilt = (pseudoRandom(seed + 19 + index * 31) - 0.5) * 18;
    const score = clamp(Math.round(qualityScore + tilt), 5, 97);
    return {
      model,
      score,
      verdict: score >= 60 ? 'good' : 'risky',
      review: buildAiAnalyzerReview(model, score, normalizedDirection, normalizedTimeframe, normalizedSymbol)
    };
  });

  const strengths = [
    `Structure score: ${structureScore}/100 from screenshot pattern quality.`,
    `Risk score: ${riskScore}/100 based on likely invalidation placement.`,
    `Timing score: ${timingScore}/100 for entry quality on ${normalizedTimeframe}.`
  ];
  const risks = [
    'Do not chase after large candles away from your planned entry.',
    'Invalidation should be respected instead of widened after entry.',
    'Keep total risk per trade capped to a small account percentage.'
  ];
  const improvements = [
    'Wait for a cleaner confirmation candle before entry.',
    'Define a take-profit and stop-loss before sending the order.',
    'Use smaller size when volatility expands quickly.'
  ];
  const possiblePatterns = getPossibleActivePatterns({
    seed,
    direction: normalizedDirection,
    timeframe: normalizedTimeframe,
    symbol: normalizedSymbol
  });

  return {
    generatedAt: new Date().toISOString(),
    ticker: normalizedSymbol,
    timeframe: normalizedTimeframe,
    direction: normalizedDirection,
    entryPrice: entry,
    exitPrice: hasExit ? exit : null,
    realizedMovePct: hasExit ? Number(realizedPct.toFixed(2)) : null,
    qualityScore,
    verdict,
    verdictLabel,
    image: {
      name: resolvedImageName,
      sizeBytes: normalizedImageSize,
      fingerprint: normalizedImageHash ? `${normalizedImageHash.slice(0, 16)}...` : 'not_provided'
    },
    subscores: {
      structure: structureScore,
      risk: riskScore,
      timing: timingScore,
      realized: realizedScore
    },
    modelReviews,
    possiblePatterns,
    strengths,
    risks,
    improvements
  };
}

module.exports = {
  SCANNER_METHODS,
  AI_ENGINES,
  normalizeSymbol,
  normalizeTicker: normalizeSymbol,
  validateRealTicker: validateTickerSymbol,
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
  getHighIvTracker,
  getPremiumSpikes,
  getInsiderTrades,
  getPowerPortfolios,
  getRealizedPatterns,
  getWildTakes,
  validateTickerSymbol,
  analyzeAiTradePattern,
  analyzeAiTradeScreenshot
};
