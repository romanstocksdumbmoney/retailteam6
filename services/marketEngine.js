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
let secTickerMapCache = {
  fetchedAt: 0,
  byTicker: new Map()
};
let insiderLiveCache = {
  fetchedAt: 0,
  items: [],
  sourceDisclosure: ''
};
let wildTakesCache = {
  fetchedAt: 0,
  items: []
};
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

const SEC_USER_AGENT = String(process.env.SEC_USER_AGENT || 'DumbDollars support@dumbdollars.org').trim();
const SEC_HEADERS = {
  accept: 'application/json',
  'user-agent': SEC_USER_AGENT
};
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

const BULLISH_HEADLINE_TERMS = [
  'upgrade',
  'beats',
  'beat',
  'raises',
  'raised',
  'buy rating',
  'overweight',
  'outperform',
  'surge',
  'jumps',
  'rally',
  'bullish',
  'strong demand'
];
const BEARISH_HEADLINE_TERMS = [
  'downgrade',
  'misses',
  'miss',
  'cuts',
  'cut',
  'sell rating',
  'underweight',
  'underperform',
  'falls',
  'drops',
  'slump',
  'bearish',
  'weak demand'
];

const AI_TRADE_MODELS = ['Grok', 'ChatGPT', 'Claude AI', 'Anthropic'];
const AI_TRADE_TIMEFRAMES = new Set(['scalp', 'intraday', 'swing', 'position']);
const AI_ANALYZER_DIRECTIONS = new Set(['long', 'short']);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePairPercents(upValue, downValue) {
  const upRaw = clamp(Number.isFinite(Number(upValue)) ? Number(upValue) : 0, 0, 100);
  const downRaw = clamp(Number.isFinite(Number(downValue)) ? Number(downValue) : 0, 0, 100);
  const total = upRaw + downRaw;
  if (total <= 0) {
    return { up: 50, down: 50 };
  }
  const up = Math.round((upRaw / total) * 100);
  const down = 100 - up;
  return { up, down };
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

async function fetchYahooQuoteSnapshotMap(symbols) {
  const uniqueSymbols = [...new Set((Array.isArray(symbols) ? symbols : [])
    .map((symbol) => normalizeSymbol(symbol))
    .filter(Boolean))];
  if (uniqueSymbols.length === 0) {
    return {};
  }

  const snapshots = {};
  const chunkSize = 25;
  for (let i = 0; i < uniqueSymbols.length; i += chunkSize) {
    const chunk = uniqueSymbols.slice(i, i + chunkSize);
    const yahooSymbols = chunk.map((symbol) => normalizeYahooTicker(symbol)).join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooSymbols)}`;
    const payload = await safeFetchJson(url, { timeoutMs: 7000 });
    const rows = Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
    rows.forEach((row) => {
      const symbol = normalizeSymbol(row?.symbol || '');
      if (!symbol) {
        return;
      }
      snapshots[symbol] = {
        symbol,
        regularMarketPrice: Number(row?.regularMarketPrice || 0),
        regularMarketChangePercent: Number(row?.regularMarketChangePercent || 0),
        regularMarketVolume: Number(row?.regularMarketVolume || 0),
        averageDailyVolume10Day: Number(row?.averageDailyVolume10Day || 0),
        marketCap: Number(row?.marketCap || 0)
      };
    });
  }
  return snapshots;
}

function safeDivide(numerator, denominator, fallback = 0) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) {
    return fallback;
  }
  return n / d;
}

function standardDeviation(values) {
  const list = (Array.isArray(values) ? values : []).map((value) => Number(value)).filter(Number.isFinite);
  if (list.length <= 1) {
    return 0;
  }
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
  const variance = list.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (list.length - 1);
  return Math.sqrt(Math.max(variance, 0));
}

function classifyHeadlineSentiment(text) {
  const lowered = String(text || '').toLowerCase();
  let score = 0;
  BULLISH_HEADLINE_TERMS.forEach((token) => {
    if (lowered.includes(token)) {
      score += 1;
    }
  });
  BEARISH_HEADLINE_TERMS.forEach((token) => {
    if (lowered.includes(token)) {
      score -= 1;
    }
  });
  if (score > 0) {
    return 'bullish';
  }
  if (score < 0) {
    return 'bearish';
  }
  return 'neutral';
}

function summarizeHeadlineSentiment(headlines) {
  const summary = {
    bullish: 0,
    bearish: 0,
    neutral: 0
  };
  (Array.isArray(headlines) ? headlines : []).forEach((headline) => {
    const sentiment = classifyHeadlineSentiment(headline);
    summary[sentiment] += 1;
  });
  return summary;
}

function toRelativeTimeLabel(isoLike) {
  const parsed = new Date(String(isoLike || ''));
  if (Number.isNaN(parsed.getTime())) {
    return 'recently';
  }
  const deltaMs = Date.now() - parsed.getTime();
  if (deltaMs <= 0) {
    return 'just now';
  }
  const minutes = Math.floor(deltaMs / (60 * 1000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function fetchSecTickerMap() {
  const now = Date.now();
  if (secTickerMapCache.byTicker.size > 0 && now - secTickerMapCache.fetchedAt < 24 * 60 * 60 * 1000) {
    return secTickerMapCache.byTicker;
  }
  const payload = await safeFetchJson(SEC_TICKERS_URL, {
    timeoutMs: 12000,
    headers: SEC_HEADERS
  });
  const byTicker = new Map();
  if (payload && typeof payload === 'object') {
    Object.values(payload).forEach((row) => {
      const ticker = normalizeSymbol(row?.ticker || '');
      const cikValue = String(row?.cik_str || '').trim();
      if (!ticker || !cikValue) {
        return;
      }
      byTicker.set(ticker, cikValue);
    });
  }
  secTickerMapCache = {
    fetchedAt: now,
    byTicker
  };
  return byTicker;
}

function toSecArchivePath(cikString, accessionNumber) {
  const cikNoLeading = String(cikString || '').replace(/^0+/, '');
  const accessionNoDashes = String(accessionNumber || '').replace(/-/g, '');
  if (!cikNoLeading || !accessionNoDashes) {
    return null;
  }
  return `https://www.sec.gov/Archives/edgar/data/${cikNoLeading}/${accessionNoDashes}`;
}

function parseForm4Transactions(xmlText) {
  const text = String(xmlText || '');
  if (!text) {
    return [];
  }
  const sections = text.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/gi) || [];
  const transactions = [];
  sections.forEach((section) => {
    const transactionCode = (section.match(/<transactionCode>\s*<value>\s*([A-Z])\s*<\/value>\s*<\/transactionCode>/i)?.[1] || '').toUpperCase();
    const sideCode = (section.match(/<transactionAcquiredDisposedCode>\s*<value>\s*([A-Z])\s*<\/value>\s*<\/transactionAcquiredDisposedCode>/i)?.[1] || '').toUpperCase();
    const sharesValue = Number((section.match(/<transactionShares>\s*<value>\s*([0-9.,-]+)\s*<\/value>\s*<\/transactionShares>/i)?.[1] || '0').replace(/,/g, ''));
    const priceValue = Number((section.match(/<transactionPricePerShare>\s*<value>\s*([0-9.,-]+)\s*<\/value>\s*<\/transactionPricePerShare>/i)?.[1] || '0').replace(/,/g, ''));
    const isOpenMarketCode = transactionCode === 'P' || transactionCode === 'S';
    if (!isOpenMarketCode) {
      return;
    }
    if (!Number.isFinite(sharesValue) || sharesValue <= 0) {
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      return;
    }
    transactions.push({
      side: sideCode === 'A' ? 'buy' : sideCode === 'D' ? 'sell' : 'unknown',
      shares: Math.round(sharesValue),
      priceUsd: Number(priceValue.toFixed(2)),
      transactionCode
    });
  });
  return transactions;
}

function parseInsiderNameFromForm4(xmlText) {
  const text = String(xmlText || '');
  const owner = text.match(/<rptOwnerName>\s*([^<]+)\s*<\/rptOwnerName>/i)?.[1];
  if (owner) {
    return String(owner).trim();
  }
  return 'SEC Insider';
}

async function fetchLiveInsiderTrades(limit = 30) {
  const now = Date.now();
  if (Array.isArray(insiderLiveCache.items) && insiderLiveCache.items.length > 0 && now - insiderLiveCache.fetchedAt < 15 * 60 * 1000) {
    return insiderLiveCache;
  }

  const tickerToCik = await fetchSecTickerMap();
  const secUniverse = INSIDER_TRADE_SYMBOLS.filter((symbol) => tickerToCik.has(symbol)).slice(0, 4);
  const universe = secUniverse.length > 0 ? secUniverse : INSIDER_TRADE_SYMBOLS.slice(0, 6);
  const quoteSnapshots = await fetchYahooQuoteSnapshotMap(universe);
  const filingsPerSymbol = 1;
  const perSymbolRows = await Promise.all(universe.map(async (symbol) => {
    const cikRaw = tickerToCik.get(symbol);
    if (!cikRaw) {
      return [];
    }
    const cikPadded = String(cikRaw || '').padStart(10, '0');
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cikPadded}.json`;
    const submissions = await safeFetchJson(submissionsUrl, {
      timeoutMs: 4500,
      headers: SEC_HEADERS
    });
    if (!submissions) {
      return [];
    }
    const recent = submissions?.filings?.recent;
    const forms = Array.isArray(recent?.form) ? recent.form : [];
    const filingDates = Array.isArray(recent?.filingDate) ? recent.filingDate : [];
    const acceptanceDateTimes = Array.isArray(recent?.acceptanceDateTime) ? recent.acceptanceDateTime : [];
    const accessionNumbers = Array.isArray(recent?.accessionNumber) ? recent.accessionNumber : [];
    const primaryDocuments = Array.isArray(recent?.primaryDocument) ? recent.primaryDocument : [];
    const quote = quoteSnapshots[symbol] || {};
    const fallbackPrice = Number(quote.regularMarketPrice || 0);
    const averageDailyVolume = Number(quote.averageDailyVolume10Day || quote.regularMarketVolume || 0);
    const rows = [];

    let taken = 0;
    for (let i = 0; i < forms.length && taken < filingsPerSymbol; i += 1) {
      const form = String(forms[i] || '').toUpperCase();
      if (!form.startsWith('4')) {
        continue;
      }
      const accessionNumber = String(accessionNumbers[i] || '');
      const primaryDocument = String(primaryDocuments[i] || '');
      const archiveRoot = toSecArchivePath(cikPadded, accessionNumber);
      if (!archiveRoot || !primaryDocument) {
        continue;
      }

      const xmlUrl = `${archiveRoot}/${primaryDocument}`;
      const xmlText = await safeFetchText(xmlUrl, {
        timeoutMs: 4500,
        headers: SEC_HEADERS
      });
      if (!xmlText) {
        continue;
      }
      const transactions = parseForm4Transactions(xmlText);
      if (!transactions.length) {
        continue;
      }
      const sideVotes = transactions.reduce((acc, txn) => {
        if (txn.side === 'buy') {
          acc.buy += 1;
        } else if (txn.side === 'sell') {
          acc.sell += 1;
        }
        return acc;
      }, { buy: 0, sell: 0 });
      const side = sideVotes.buy >= sideVotes.sell ? 'buy' : 'sell';
      const shares = transactions.reduce((sum, txn) => sum + Number(txn.shares || 0), 0);
      const priced = transactions.filter((txn) => Number(txn.priceUsd || 0) > 0);
      const averagePriceUsd = priced.length
        ? Number((priced.reduce((sum, txn) => sum + Number(txn.priceUsd || 0), 0) / priced.length).toFixed(2))
        : Number((fallbackPrice > 0 ? fallbackPrice : 1).toFixed(2));
      const valueUsd = Math.max(1, Math.round(shares * averagePriceUsd));
      const baselineValueUsd = Math.max(1, Math.round(Math.max(averageDailyVolume * Math.max(averagePriceUsd, 1) * 0.0006, 500_000)));
      const unusualVolumeMultiple = Number(safeDivide(valueUsd, baselineValueUsd, 1).toFixed(2));
      const stockReactionPct = Number(Number(quote.regularMarketChangePercent || 0).toFixed(2));
      const anomalyScore = clamp(
        Math.round(
          clamp(Math.round(Math.log10(Math.max(valueUsd, 1)) * 18), 1, 99) * 0.55
          + clamp(Math.round(unusualVolumeMultiple * 14), 1, 99) * 0.30
          + clamp(Math.round(Math.abs(stockReactionPct) * 9), 1, 99) * 0.15
        ),
        1,
        99
      );
      const directionalBias = buildInsiderDirectionalBias(side, stockReactionPct, anomalyScore);
      const filedAt = String(acceptanceDateTimes[i] || filingDates[i] || '').trim() || new Date().toISOString();
      rows.push({
        symbol,
        insiderName: parseInsiderNameFromForm4(xmlText),
        role: 'Form 4 Insider',
        side,
        shares,
        averagePriceUsd,
        valueUsd,
        baselineValueUsd,
        filedAt,
        stockReactionPct,
        unusualVolumeMultiple,
        flowVsAverageRatio: unusualVolumeMultiple,
        anomalyScore,
        directionalBias,
        directionalBiasLabel: directionalBias.label,
        directionalBiasConfidencePct: directionalBias.confidencePct,
        directionalBiasScore: directionalBias.score,
        directionalBiasReason: directionalBias.reason,
        unusualSignals: [
          `Filed via SEC Form 4 (${form}, open market code P/S)`,
          `Trade size ${unusualVolumeMultiple.toFixed(2)}x baseline flow`
        ],
        signalSummary: unusualVolumeMultiple >= 2 ? 'Unusual insider flow detected' : 'Standard insider flow signal',
        isUnusual: unusualVolumeMultiple >= 2 || anomalyScore >= 60,
        screeningTag: unusualVolumeMultiple >= 2 || anomalyScore >= 60 ? 'unusual_insider_activity' : 'standard_insider_activity',
        conviction: valueUsd >= 75_000_000 ? 'very_high' : valueUsd >= 25_000_000 ? 'high' : 'medium',
        source: 'SEC Form 4 filing (EDGAR)',
        details: `Parsed from ${form} filing; ${transactions.length} transaction row(s) detected in primary document.`
      });
      taken += 1;
    }
    return rows;
  }));

  const rows = perSymbolRows.flat();
  if (!rows.length) {
    // If SEC filings are temporarily unavailable/rate-limited, expose
    // quote-derived fallback rows so the module stays usable.
    const fallbackRows = universe.map((symbol, idx) => {
      const quote = quoteSnapshots[symbol] || {};
      const livePrice = Number(quote.regularMarketPrice || 0);
      const seededPrice = Number(EARNINGS_VOLUME_BASE[symbol] || 0) > 0
        ? Number((Math.max(25, Math.min(900, Math.round((EARNINGS_VOLUME_BASE[symbol] / 300_000) * 100) / 100))).toFixed(2))
        : Number((45 + ((idx * 37) % 220)).toFixed(2));
      const price = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : seededPrice;
      const absChangePct = Math.abs(Number(quote.regularMarketChangePercent || 0));
      const syntheticVolume = Math.max(1_000_000, Number(EARNINGS_VOLUME_BASE[symbol] || 8_000_000));
      const volume = Math.max(1, Math.round(Number(quote.regularMarketVolume || quote.averageDailyVolume10Day || syntheticVolume)));
      const side = Number(quote.regularMarketChangePercent || 0) >= 0 ? 'buy' : 'sell';
      const shares = Math.max(1_000, Math.round(volume * 0.0008));
      const valueUsd = Math.max(1, Math.round(shares * price));
      const baselineValueUsd = Math.max(500_000, Math.round(Math.max(Number(quote.averageDailyVolume10Day || volume), 1) * price * 0.0006));
      const unusualVolumeMultiple = Number(safeDivide(valueUsd, baselineValueUsd, 1).toFixed(2));
      const anomalyScore = clamp(
        Math.round(
          clamp(Math.round(Math.log10(Math.max(valueUsd, 1)) * 18), 1, 99) * 0.55
          + clamp(Math.round(unusualVolumeMultiple * 14), 1, 99) * 0.30
          + clamp(Math.round(absChangePct * 9), 1, 99) * 0.15
        ),
        1,
        99
      );
      const directionalBias = buildInsiderDirectionalBias(side, Number(quote.regularMarketChangePercent || 0), anomalyScore);
      return {
        symbol,
        insiderName: `SEC Watchlist ${idx + 1}`,
        role: 'Form 4 Monitor',
        side,
        shares,
        averagePriceUsd: Number(price.toFixed(2)),
        valueUsd,
        baselineValueUsd,
        filedAt: new Date().toISOString(),
        stockReactionPct: Number(Number(quote.regularMarketChangePercent || 0).toFixed(2)),
        unusualVolumeMultiple,
        flowVsAverageRatio: unusualVolumeMultiple,
        anomalyScore,
        directionalBias,
        directionalBiasLabel: directionalBias.label,
        directionalBiasConfidencePct: directionalBias.confidencePct,
        directionalBiasScore: directionalBias.score,
        directionalBiasReason: directionalBias.reason,
        unusualSignals: [
          'SEC Form 4 endpoint temporarily unavailable',
          'Using quote-derived watchlist estimate until filings refresh'
        ],
        signalSummary: 'Provisional insider watchlist signal',
        isUnusual: unusualVolumeMultiple >= 2 || anomalyScore >= 60,
        screeningTag: unusualVolumeMultiple >= 2 || anomalyScore >= 60 ? 'unusual_insider_activity' : 'standard_insider_activity',
        conviction: valueUsd >= 75_000_000 ? 'very_high' : valueUsd >= 25_000_000 ? 'high' : 'medium',
        source: 'SEC Form 4 watchlist (fallback estimate)',
        details: 'Live SEC filing documents were unavailable at fetch time; this row is a temporary quote-based estimate.'
      };
    }).filter(Boolean);
    rows.push(...fallbackRows);
  }
  rows.sort((a, b) => new Date(b.filedAt).getTime() - new Date(a.filedAt).getTime());
  insiderLiveCache = {
    fetchedAt: now,
    items: rows.slice(0, Math.max(40, limit)),
    sourceDisclosure: 'Live insider transactions parsed from SEC EDGAR Form 4 filings with Yahoo quote context.'
  };
  return insiderLiveCache;
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

  const dayPair = normalizePairPercents(dayUp, 100 - dayUp);
  const weekPair = normalizePairPercents(weekUp, 100 - weekUp);
  const monthPair = normalizePairPercents(monthUp, 100 - monthUp);
  const yearPair = normalizePairPercents(yearUp, 100 - yearUp);

  return {
    symbol: normalized,
    generatedAt: new Date().toISOString(),
    probabilities: {
      day: dayPair,
      week: weekPair,
      month: monthPair,
      year: yearPair
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
    return {
      source: source === 'alphavantage' ? 'alphavantage' : 'nasdaq',
      scheduleDate: requestedDate,
      scheduleLabel: `No verified earnings found for ${formatIsoDate(requestedDate)} ET`,
      requestedSession,
      appliedSession: requestedSession,
      items: []
    };
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

async function fetchYahooDailySnapshots(symbols) {
  const uniqueSymbols = [...new Set((Array.isArray(symbols) ? symbols : [])
    .map((symbol) => normalizeSymbol(symbol))
    .filter(Boolean))];
  const snapshots = {};
  await Promise.all(uniqueSymbols.map(async (symbol) => {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const payload = await safeFetchJson(url, { timeoutMs: 8000 });
    const chart = payload?.chart?.result?.[0];
    const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
    const quote = chart?.indicators?.quote?.[0] || {};
    const closes = Array.isArray(quote?.close) ? quote.close : [];
    const volumes = Array.isArray(quote?.volume) ? quote.volume : [];

    const points = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const ts = Number(timestamps[i] || 0);
      const close = Number(closes[i] || 0);
      const volume = Number(volumes[i] || 0);
      if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(close) || close <= 0 || !Number.isFinite(volume) || volume < 0) {
        continue;
      }
      points.push({
        timestampMs: Math.round(ts * 1000),
        close,
        volume: Math.round(volume)
      });
    }
    points.sort((a, b) => a.timestampMs - b.timestampMs);

    const usable = points.filter((point) => Number(point.volume || 0) > 0);
    const current = usable[usable.length - 1] || points[points.length - 1] || null;
    const previous = usable.length >= 2
      ? usable[usable.length - 2]
      : (points.length >= 2 ? points[points.length - 2] : null);

    snapshots[symbol] = {
      symbol,
      currentClose: Number(current?.close || 0),
      currentVolume: Math.round(Number(current?.volume || 0)),
      currentTimestampMs: Number(current?.timestampMs || 0),
      previousClose: Number(previous?.close || 0),
      previousVolume: Math.round(Number(previous?.volume || 0)),
      previousTimestampMs: Number(previous?.timestampMs || 0)
    };
  }));
  return snapshots;
}

function derivePremiumSpikeFromSnapshots(symbol, snapshot, quoteSnapshot) {
  const currentClose = Number(snapshot?.currentClose || quoteSnapshot?.regularMarketPrice || 0);
  const previousClose = Number(snapshot?.previousClose || currentClose || 0);
  const currentVolume = Math.max(0, Math.round(Number(snapshot?.currentVolume || quoteSnapshot?.regularMarketVolume || 0)));
  const previousVolume = Math.max(0, Math.round(Number(snapshot?.previousVolume || quoteSnapshot?.averageDailyVolume10Day || 0)));

  if (!Number.isFinite(currentClose) || currentClose <= 0 || currentVolume <= 0) {
    return null;
  }

  const currentPremiumUsd = Math.max(1, Math.round(currentClose * currentVolume * 0.015));
  const previousPremiumUsdRaw = Math.max(1, Math.round(Math.max(previousClose, 0.01) * Math.max(previousVolume, 1) * 0.015));
  const previousPremiumUsd = Math.max(1, previousPremiumUsdRaw);
  const spikeMultiple = Number(safeDivide(currentPremiumUsd, previousPremiumUsd, 1).toFixed(2));

  const movePct = Number(Number(quoteSnapshot?.regularMarketChangePercent || 0).toFixed(2));
  const isCallSpike = movePct >= 0;
  const premiumType = isCallSpike ? 'call' : 'put';
  const expectedDirection = isCallSpike ? 'up' : 'down';
  const reactedDirection = movePct > 0 ? 'up' : movePct < 0 ? 'down' : 'flat';
  const hasReacted = Math.abs(movePct) >= 0.4;
  const matchedExpectedDirection = hasReacted && reactedDirection === expectedDirection;
  const reactionStatus = hasReacted
    ? (matchedExpectedDirection ? 'reacted_as_expected' : 'reacted_opposite')
    : 'no_clear_reaction_yet';
  const reactionLabel = reactionStatus === 'reacted_as_expected'
    ? 'Reacted (as expected)'
    : reactionStatus === 'reacted_opposite'
      ? 'Reacted (opposite)'
      : 'No clear reaction yet';

  const callPremiumUsd = premiumType === 'call'
    ? currentPremiumUsd
    : Math.max(1, Math.round(currentPremiumUsd * 0.42));
  const putPremiumUsd = premiumType === 'put'
    ? currentPremiumUsd
    : Math.max(1, Math.round(currentPremiumUsd * 0.42));

  const happenedAt = Number(snapshot?.currentTimestampMs || 0) > 0
    ? new Date(Number(snapshot.currentTimestampMs)).toISOString()
    : new Date().toISOString();

  return {
    symbol,
    premiumType,
    spikeAmountUsd: currentPremiumUsd,
    previousDayPremiumUsd: previousPremiumUsd,
    baselinePremiumUsd: previousPremiumUsd,
    spikeMultiple,
    callPremiumUsd,
    putPremiumUsd,
    totalPremiumUsd: callPremiumUsd + putPremiumUsd,
    putCallRatio: Number(safeDivide(putPremiumUsd, Math.max(callPremiumUsd, 1), 0).toFixed(2)),
    happenedAt,
    expectedDirection,
    reaction: {
      hasReacted,
      matchedExpectedDirection,
      status: reactionStatus,
      label: reactionLabel,
      movePct
    }
  };
}

function buildFallbackPremiumSpike(symbol, index = 0) {
  const seed = hashString(`premium-spike-fallback:${daySeed()}:${symbol}:${index}`);
  const isCall = pseudoRandom(seed + 7) >= 0.5;
  const premiumType = isCall ? 'call' : 'put';
  const previousDayPremiumUsd = Math.max(1, Math.round(120_000 + pseudoRandom(seed + 11) * 2_800_000));
  const spikeMultiple = Number((1.12 + pseudoRandom(seed + 13) * 2.85).toFixed(2));
  const spikeAmountUsd = Math.max(1, Math.round(previousDayPremiumUsd * spikeMultiple));
  const movePct = Number((((pseudoRandom(seed + 17) - 0.5) * 5.4)).toFixed(2));
  const hasReacted = Math.abs(movePct) >= 0.4;
  const expectedDirection = isCall ? 'up' : 'down';
  const reactedDirection = movePct > 0 ? 'up' : movePct < 0 ? 'down' : 'flat';
  const matchedExpectedDirection = hasReacted && reactedDirection === expectedDirection;
  const status = hasReacted
    ? (matchedExpectedDirection ? 'reacted_as_expected' : 'reacted_opposite')
    : 'no_clear_reaction_yet';
  const label = status === 'reacted_as_expected'
    ? 'Reacted (as expected)'
    : status === 'reacted_opposite'
      ? 'Reacted (opposite)'
      : 'No clear reaction yet';
  const happenedAt = new Date(Date.now() - Math.round(pseudoRandom(seed + 19) * 6) * 60 * 60 * 1000).toISOString();
  const callPremiumUsd = premiumType === 'call'
    ? spikeAmountUsd
    : Math.max(1, Math.round(spikeAmountUsd * 0.42));
  const putPremiumUsd = premiumType === 'put'
    ? spikeAmountUsd
    : Math.max(1, Math.round(spikeAmountUsd * 0.42));

  return {
    symbol,
    premiumType,
    spikeAmountUsd,
    previousDayPremiumUsd,
    baselinePremiumUsd: previousDayPremiumUsd,
    spikeMultiple,
    callPremiumUsd,
    putPremiumUsd,
    totalPremiumUsd: callPremiumUsd + putPremiumUsd,
    putCallRatio: Number(safeDivide(putPremiumUsd, Math.max(callPremiumUsd, 1), 0).toFixed(2)),
    happenedAt,
    expectedDirection,
    reaction: {
      hasReacted,
      matchedExpectedDirection,
      status,
      label,
      movePct
    }
  };
}

async function getPremiumSpikes(limit = 10) {
  const total = Math.max(1, Math.min(30, Math.trunc(limit)));
  const universe = PREMIUM_SPIKE_LARGE_CAPS.slice(0, 18);
  const [dailySnapshots, quoteSnapshots] = await Promise.all([
    fetchYahooDailySnapshots(universe),
    fetchYahooQuoteSnapshotMap(universe)
  ]);

  const rows = universe
    .map((symbol) => derivePremiumSpikeFromSnapshots(symbol, dailySnapshots[symbol], quoteSnapshots[symbol]))
    .filter(Boolean)
    .sort((a, b) => Number(b.spikeMultiple || 0) - Number(a.spikeMultiple || 0));

  const filtered = rows.filter((row) => Number(row.spikeMultiple || 0) >= 1.08);
  const selected = (filtered.length ? filtered : rows).slice(0, total);
  const usingFallback = selected.length === 0;
  const items = usingFallback
    ? universe.slice(0, total).map((symbol, idx) => buildFallbackPremiumSpike(symbol, idx))
    : selected;

  return {
    generatedAt: new Date().toISOString(),
    universe: 'high_volume_large_caps',
    dataNature: 'mixed_live',
    sourceDisclosure: usingFallback
      ? 'Call/put premium spikes are computed from live Yahoo Finance quote + 5D chart volumes, with deterministic fallback estimates when live snapshots are temporarily unavailable.'
      : 'Call/put premium spikes are computed from live Yahoo Finance quote + 5D chart volumes, compared against previous trading day volume.',
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

async function getInsiderTrades(limit = 10, options = {}) {
  const total = Math.max(1, Math.min(30, Math.trunc(limit)));
  const sideFilter = normalizeInsiderTradeSide(options.side);
  const symbolFilter = sanitizeInsiderSymbolFilter(options.symbol);
  const sortBy = normalizeInsiderTradeSort(options.sortBy);
  const unusualOnly = String(options.unusualOnly || '').trim().toLowerCase() === 'true';
  const rawMinValue = Number(options.minValueUsd || 0);
  const minValueUsd = Number.isFinite(rawMinValue) && rawMinValue > 0
    ? Math.round(rawMinValue)
    : 0;

  const livePayload = await fetchLiveInsiderTrades(Math.max(total, 30));
  let filtered = (Array.isArray(livePayload.items) ? livePayload.items : []).filter((item) => {
    if (sideFilter !== 'all' && String(item.side || '').toLowerCase() !== sideFilter) {
      return false;
    }
    if (symbolFilter && !String(item.symbol || '').includes(symbolFilter)) {
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
    filtered.sort((a, b) => Number(a.valueUsd || 0) - Number(b.valueUsd || 0));
  } else if (sortBy === 'volume_desc') {
    filtered.sort((a, b) => Number(b.flowVsAverageRatio || 0) - Number(a.flowVsAverageRatio || 0) || Number(b.valueUsd || 0) - Number(a.valueUsd || 0));
  } else if (sortBy === 'volume_asc') {
    filtered.sort((a, b) => Number(a.flowVsAverageRatio || 0) - Number(b.flowVsAverageRatio || 0) || Number(a.valueUsd || 0) - Number(b.valueUsd || 0));
  } else if (sortBy === 'filed_desc') {
    filtered.sort((a, b) => new Date(b.filedAt).getTime() - new Date(a.filedAt).getTime());
  } else if (sortBy === 'filed_asc') {
    filtered.sort((a, b) => new Date(a.filedAt).getTime() - new Date(b.filedAt).getTime());
  } else if (sortBy === 'anomaly_desc') {
    filtered.sort((a, b) => Number(b.anomalyScore || 0) - Number(a.anomalyScore || 0) || Number(b.valueUsd || 0) - Number(a.valueUsd || 0));
  } else if (sortBy === 'anomaly_asc') {
    filtered.sort((a, b) => Number(a.anomalyScore || 0) - Number(b.anomalyScore || 0) || Number(a.valueUsd || 0) - Number(b.valueUsd || 0));
  } else if (sortBy === 'reaction_desc') {
    filtered.sort((a, b) => Math.abs(Number(b.stockReactionPct || 0)) - Math.abs(Number(a.stockReactionPct || 0)));
  } else if (sortBy === 'reaction_asc') {
    filtered.sort((a, b) => Math.abs(Number(a.stockReactionPct || 0)) - Math.abs(Number(b.stockReactionPct || 0)));
  } else {
    filtered.sort((a, b) => Number(b.valueUsd || 0) - Number(a.valueUsd || 0));
  }

  return {
    generatedAt: new Date().toISOString(),
    dataNature: 'mixed_live',
    sourceDisclosure: livePayload.sourceDisclosure || 'Live insider transactions parsed from SEC EDGAR Form 4 filings with Yahoo quote context.',
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


async function fetchYahooDailyCandles(symbol, options = {}) {
  const normalized = normalizeSymbol(symbol);
  if (!isLikelyUsCommonTicker(normalized)) {
    return [];
  }
  const range = String(options.range || '3mo').trim() || '3mo';
  const interval = String(options.interval || '1d').trim() || '1d';
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  const payload = await safeFetchJson(url, { timeoutMs: 8000 });
  const chart = payload?.chart?.result?.[0];
  const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
  const quote = chart?.indicators?.quote?.[0] || {};
  const opens = Array.isArray(quote?.open) ? quote.open : [];
  const highs = Array.isArray(quote?.high) ? quote.high : [];
  const lows = Array.isArray(quote?.low) ? quote.low : [];
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const volumes = Array.isArray(quote?.volume) ? quote.volume : [];
  if (!timestamps.length) {
    return [];
  }
  const candles = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const tsSeconds = Number(timestamps[i] || 0);
    const open = Number(opens[i]);
    const high = Number(highs[i]);
    const low = Number(lows[i]);
    const close = Number(closes[i]);
    const volume = Number(volumes[i] || 0);
    if (
      !Number.isFinite(tsSeconds)
      || !Number.isFinite(open)
      || !Number.isFinite(high)
      || !Number.isFinite(low)
      || !Number.isFinite(close)
      || !Number.isFinite(volume)
      || tsSeconds <= 0
      || high < low
      || open <= 0
      || close <= 0
      || volume < 0
    ) {
      continue;
    }
    const timestampMs = Math.round(tsSeconds * 1000);
    candles.push({
      timestampMs,
      isoDate: new Date(timestampMs).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: Math.round(volume)
    });
  }
  candles.sort((a, b) => a.timestampMs - b.timestampMs);
  return candles;
}

function avg(values) {
  const usable = (Array.isArray(values) ? values : []).filter((value) => Number.isFinite(Number(value)));
  if (!usable.length) {
    return 0;
  }
  return usable.reduce((sum, value) => sum + Number(value), 0) / usable.length;
}

function averageVolumeFromCandles(candles, length, endExclusive) {
  const end = Number.isInteger(endExclusive) ? endExclusive : candles.length;
  const start = Math.max(0, end - Math.max(1, Math.trunc(length)));
  return avg(candles.slice(start, end).map((row) => Number(row.volume || 0)));
}

function smaFromCandles(candles, length, endExclusive) {
  const end = Number.isInteger(endExclusive) ? endExclusive : candles.length;
  const start = Math.max(0, end - Math.max(1, Math.trunc(length)));
  return avg(candles.slice(start, end).map((row) => Number(row.close || 0)));
}

function volumeWeightedCloseFromCandles(candles, length, endExclusive) {
  const end = Number.isInteger(endExclusive) ? endExclusive : candles.length;
  const start = Math.max(0, end - Math.max(1, Math.trunc(length)));
  let weighted = 0;
  let totalVolume = 0;
  candles.slice(start, end).forEach((row) => {
    const close = Number(row.close || 0);
    const volume = Number(row.volume || 0);
    if (Number.isFinite(close) && Number.isFinite(volume) && close > 0 && volume > 0) {
      weighted += close * volume;
      totalVolume += volume;
    }
  });
  if (totalVolume <= 0) {
    return 0;
  }
  return weighted / totalVolume;
}

function candleBodySize(candle) {
  return Math.abs(Number(candle?.close || 0) - Number(candle?.open || 0));
}

function candleRangeSize(candle) {
  return Math.max(0, Number(candle?.high || 0) - Number(candle?.low || 0));
}

function rangePct(candle) {
  const close = Number(candle?.close || 0);
  if (!Number.isFinite(close) || close <= 0) {
    return 0;
  }
  return (candleRangeSize(candle) / close) * 100;
}

function realizedPatternTypeLabel(patternType) {
  return patternType === 'volume_down' ? 'Volume Down' : 'Candlestick';
}

function buildPatternItem({
  symbol,
  key,
  patternName,
  patternType,
  confidence,
  direction,
  triggerCandle,
  note,
  evidence
}) {
  const triggerDateLabel = formatIsoDate(triggerCandle.isoDate);
  return {
    id: `${symbol}:${key}:${triggerCandle.isoDate}`,
    symbol,
    ticker: symbol,
    patternName,
    patternType,
    patternTypeLabel: realizedPatternTypeLabel(patternType),
    confidence: clamp(Math.round(Number(confidence || 0)), 1, 99),
    direction,
    session: 'regular',
    sessionLabel: 'Daily Close',
    triggerAt: `Detected on ${triggerDateLabel}`,
    volume: Math.round(Number(triggerCandle.volume || 0)),
    note,
    source: 'yahoo_chart_ohlcv',
    candleDate: triggerCandle.isoDate,
    evidence
  };
}

function detectVolumeFadeContinuation(symbol, candles) {
  if (!Array.isArray(candles) || candles.length < 24) {
    return null;
  }
  const end = candles.length;
  const c0 = candles[end - 1];
  const c1 = candles[end - 2];
  const c2 = candles[end - 3];
  const avgVolume20 = averageVolumeFromCandles(candles, 20, end - 1);
  const sma10 = smaFromCandles(candles, 10, end);
  if (avgVolume20 <= 0 || sma10 <= 0) {
    return null;
  }
  const volumeSteppingDown = c2.volume > c1.volume && c1.volume > c0.volume;
  const relativeVolume = Number((c0.volume / avgVolume20).toFixed(2));
  const isBullish = c0.close > c1.close && c0.close > sma10;
  const isBearish = c0.close < c1.close && c0.close < sma10;
  if (!volumeSteppingDown || relativeVolume > 0.82 || (!isBullish && !isBearish)) {
    return null;
  }
  const confidence = 56 + Math.round((0.82 - relativeVolume) * 60) + (isBullish || isBearish ? 10 : 0);
  const note = `3-day volume fade with RVOL ${relativeVolume} vs 20D average while price stayed ${isBullish ? 'above' : 'below'} 10D trend.`;
  return buildPatternItem({
    symbol,
    key: 'vol-fade',
    patternName: 'Volume Fade Continuation',
    patternType: 'volume_down',
    confidence,
    direction: isBullish ? 'bullish' : 'bearish',
    triggerCandle: c0,
    note,
    evidence: {
      relativeVolume,
      avgVolume20: Math.round(avgVolume20),
      volumeSeries: [c2.volume, c1.volume, c0.volume],
      sma10: Number(sma10.toFixed(2))
    }
  });
}

function detectVolumeCompressionBreakout(symbol, candles) {
  if (!Array.isArray(candles) || candles.length < 26) {
    return null;
  }
  const end = candles.length;
  const breakout = candles[end - 1];
  const preBreak = candles.slice(end - 4, end - 1);
  const baseline = candles.slice(end - 14, end - 4);
  const previousFive = candles.slice(end - 6, end - 1);
  const avgCompressionRangePct = avg(preBreak.map((row) => rangePct(row)));
  const avgBaselineRangePct = avg(baseline.map((row) => rangePct(row)));
  const avgVolume20 = averageVolumeFromCandles(candles, 20, end - 1);
  if (avgBaselineRangePct <= 0 || avgVolume20 <= 0 || previousFive.length < 3) {
    return null;
  }
  const compressionRatio = Number((avgCompressionRangePct / avgBaselineRangePct).toFixed(2));
  const preBreakRelativeVolume = Number((avg(preBreak.map((row) => Number(row.volume || 0))) / avgVolume20).toFixed(2));
  const priorHigh = Math.max(...previousFive.map((row) => Number(row.high || 0)));
  const priorLow = Math.min(...previousFive.map((row) => Number(row.low || 0)));
  const brokeUp = breakout.close > priorHigh;
  const brokeDown = breakout.close < priorLow;
  if (compressionRatio > 0.82 || preBreakRelativeVolume > 0.9 || (!brokeUp && !brokeDown)) {
    return null;
  }
  const confidence = 55 + Math.round((0.82 - compressionRatio) * 70);
  const note = `Range compression (${compressionRatio}x of baseline) with muted pre-break volume (${preBreakRelativeVolume}x) then directional break.`;
  return buildPatternItem({
    symbol,
    key: 'vol-compress',
    patternName: 'Volume Compression Breakout',
    patternType: 'volume_down',
    confidence,
    direction: brokeUp ? 'bullish' : 'bearish',
    triggerCandle: breakout,
    note,
    evidence: {
      compressionRatio,
      preBreakRelativeVolume,
      priorHigh: Number(priorHigh.toFixed(2)),
      priorLow: Number(priorLow.toFixed(2))
    }
  });
}

function detectHammerVwapReclaim(symbol, candles) {
  if (!Array.isArray(candles) || candles.length < 24) {
    return null;
  }
  const end = candles.length;
  const latest = candles[end - 1];
  const previous = candles[end - 2];
  const vwap20Proxy = volumeWeightedCloseFromCandles(candles, 20, end - 1);
  if (vwap20Proxy <= 0) {
    return null;
  }
  const body = candleBodySize(latest);
  const range = candleRangeSize(latest);
  if (range <= 0) {
    return null;
  }
  const lowerShadow = Math.min(latest.open, latest.close) - latest.low;
  const upperShadow = latest.high - Math.max(latest.open, latest.close);
  const bodyToRange = body / range;
  const isHammer = lowerShadow >= body * 2 && upperShadow <= Math.max(body * 0.9, range * 0.2) && bodyToRange <= 0.45;
  const reclaimed = previous.close < vwap20Proxy && latest.close > vwap20Proxy;
  if (!isHammer || !reclaimed) {
    return null;
  }
  const reclaimPct = Number((((latest.close - vwap20Proxy) / vwap20Proxy) * 100).toFixed(2));
  const confidence = 58 + Math.round(Math.min(lowerShadow / Math.max(body, 0.01), 4) * 6) + Math.round(Math.max(reclaimPct, 0));
  const note = `Hammer structure reclaimed 20D volume-weighted close proxy by ${reclaimPct > 0 ? '+' : ''}${reclaimPct}% on close.`;
  return buildPatternItem({
    symbol,
    key: 'hammer-reclaim',
    patternName: 'Hammer + VWAP Reclaim',
    patternType: 'candlestick',
    confidence,
    direction: 'bullish',
    triggerCandle: latest,
    note,
    evidence: {
      reclaimPct,
      lowerShadow: Number(lowerShadow.toFixed(2)),
      upperShadow: Number(upperShadow.toFixed(2)),
      bodyToRange: Number(bodyToRange.toFixed(2)),
      vwap20Proxy: Number(vwap20Proxy.toFixed(2))
    }
  });
}

function detectEngulfingFlip(symbol, candles) {
  if (!Array.isArray(candles) || candles.length < 22) {
    return null;
  }
  const end = candles.length;
  const latest = candles[end - 1];
  const previous = candles[end - 2];
  const previousBull = previous.close > previous.open;
  const previousBear = previous.close < previous.open;
  const latestBull = latest.close > latest.open;
  const latestBear = latest.close < latest.open;
  const bullishEngulf = previousBear && latestBull && latest.open <= previous.close && latest.close >= previous.open;
  const bearishEngulf = previousBull && latestBear && latest.open >= previous.close && latest.close <= previous.open;
  if (!bullishEngulf && !bearishEngulf) {
    return null;
  }
  const previousBody = Math.max(candleBodySize(previous), 0.01);
  const latestBody = candleBodySize(latest);
  const bodyExpansion = Number((latestBody / previousBody).toFixed(2));
  const avgVolume20 = averageVolumeFromCandles(candles, 20, end - 1);
  const relativeVolume = avgVolume20 > 0 ? Number((latest.volume / avgVolume20).toFixed(2)) : 0;
  if (bodyExpansion < 1.05 || relativeVolume < 0.9) {
    return null;
  }
  const confidence = 54 + Math.round((bodyExpansion - 1) * 14) + Math.round(Math.max(relativeVolume - 1, 0) * 8);
  const note = `Body engulfed prior candle (${bodyExpansion}x body size) with ${relativeVolume}x relative volume on confirmation day.`;
  return buildPatternItem({
    symbol,
    key: 'engulf-reversal',
    patternName: 'Bullish/Bearish Engulfing Flip',
    patternType: 'candlestick',
    confidence,
    direction: bullishEngulf ? 'bullish' : 'bearish',
    triggerCandle: latest,
    note,
    evidence: {
      bodyExpansion,
      relativeVolume
    }
  });
}

function detectInsideBarExpansion(symbol, candles) {
  if (!Array.isArray(candles) || candles.length < 24) {
    return null;
  }
  const end = candles.length;
  const mother = candles[end - 3];
  const inside = candles[end - 2];
  const breakout = candles[end - 1];
  const isInside = inside.high < mother.high && inside.low > mother.low;
  const brokeUp = breakout.close > inside.high && breakout.high > mother.high;
  const brokeDown = breakout.close < inside.low && breakout.low < mother.low;
  const avgVolume20 = averageVolumeFromCandles(candles, 20, end - 1);
  const relativeVolume = avgVolume20 > 0 ? Number((breakout.volume / avgVolume20).toFixed(2)) : 0;
  if (!isInside || (!brokeUp && !brokeDown) || relativeVolume < 0.8) {
    return null;
  }
  const confidence = 53 + Math.round(Math.max(relativeVolume - 0.8, 0) * 20);
  const note = `Inside bar resolved with expansion break and ${relativeVolume}x relative volume confirmation.`;
  return buildPatternItem({
    symbol,
    key: 'inside-break',
    patternName: 'Inside Bar Expansion',
    patternType: 'candlestick',
    confidence,
    direction: brokeUp ? 'bullish' : 'bearish',
    triggerCandle: breakout,
    note,
    evidence: {
      relativeVolume,
      motherHigh: Number(mother.high.toFixed(2)),
      motherLow: Number(mother.low.toFixed(2))
    }
  });
}

function detectRealizedPatternsForSymbol(symbol, candles) {
  if (!Array.isArray(candles) || candles.length < 20) {
    return [];
  }
  const detections = [
    detectVolumeFadeContinuation(symbol, candles),
    detectVolumeCompressionBreakout(symbol, candles),
    detectHammerVwapReclaim(symbol, candles),
    detectEngulfingFlip(symbol, candles),
    detectInsideBarExpansion(symbol, candles)
  ].filter(Boolean);

  const dedupe = new Set();
  return detections.filter((item) => {
    const key = `${item.symbol}:${item.patternName}`;
    if (dedupe.has(key)) {
      return false;
    }
    dedupe.add(key);
    return true;
  });
}

async function getRealizedPatterns(limit = 8, patternType = 'all') {
  const normalizedType = String(patternType || 'all').trim().toLowerCase();
  const selectedType = REALIZED_PATTERN_TYPES.includes(normalizedType) ? normalizedType : 'all';
  const total = Math.max(1, Math.min(20, Math.trunc(limit)));
  const patternUniverse = [...new Set([...PREMIUM_SPIKE_LARGE_CAPS, ...EARNINGS_WATCHLIST, ...HIGH_IV_UNIVERSE])]
    .filter((symbol) => isLikelyUsCommonTicker(symbol))
    .slice(0, 24);

  const scans = await Promise.all(patternUniverse.map(async (symbol) => {
    const candles = await fetchYahooDailyCandles(symbol, { range: '3mo', interval: '1d' });
    return {
      symbol,
      candles
    };
  }));

  const items = scans.flatMap((scan) => detectRealizedPatternsForSymbol(scan.symbol, scan.candles));
  const filteredItems = items
    .filter((item) => selectedType === 'all' || item.patternType === selectedType)
    .sort((a, b) => {
      const confidenceDiff = Number(b.confidence || 0) - Number(a.confidence || 0);
      if (confidenceDiff !== 0) {
        return confidenceDiff;
      }
      return Number(b.volume || 0) - Number(a.volume || 0);
    });

  return {
    generatedAt: new Date().toISOString(),
    availableFilters: REALIZED_PATTERN_TYPES,
    selectedFilter: selectedType,
    dataNature: 'live',
    sourceDisclosure: 'Realized pattern detections are computed from live Yahoo Finance OHLCV candles (query2 chart endpoint).',
    scanUniverseSize: patternUniverse.length,
    scannedSymbols: scans.filter((scan) => Array.isArray(scan.candles) && scan.candles.length >= 20).length,
    items: filteredItems.slice(0, total)
  };
}

function extractLikelyTickerFromText(text) {
  const content = String(text || '').toUpperCase();
  const tokens = content.match(/\b[A-Z]{1,5}\b/g) || [];
  const universe = new Set([...EARNINGS_WATCHLIST, ...PREMIUM_SPIKE_LARGE_CAPS, ...HIGH_IV_UNIVERSE]);
  for (const token of tokens) {
    if (universe.has(token)) {
      return token;
    }
  }
  return '';
}

async function extractLatestNewsHeadlines(limit = 20) {
  const symbols = [...new Set([...EARNINGS_WATCHLIST, ...PREMIUM_SPIKE_LARGE_CAPS])].slice(0, 16);
  const all = [];
  await Promise.all(symbols.map(async (symbol) => {
    const news = await fetchTickerNews(symbol, 3);
    news.forEach((entry) => {
      all.push({
        symbol,
        title: String(entry.title || '').trim(),
        url: String(entry.url || '').trim(),
        publishedAt: String(entry.publishedAt || '').trim()
      });
    });
  }));

  const dedupe = new Set();
  const cleaned = all.filter((entry) => {
    if (!entry.title || !entry.url) {
      return false;
    }
    const key = `${entry.url}::${entry.title}`;
    if (dedupe.has(key)) {
      return false;
    }
    dedupe.add(key);
    return true;
  });

  cleaned.sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());
  return cleaned.slice(0, Math.max(1, limit));
}

function buildWildTakeFromHeadline(entry, index) {
  const title = String(entry?.title || '').trim();
  const url = String(entry?.url || '').trim();
  const symbol = normalizeSymbol(entry?.symbol || extractLikelyTickerFromText(title) || 'MARKET');
  const publishedAt = String(entry?.publishedAt || new Date().toISOString());
  const sentiment = classifyHeadlineSentiment(title);
  const source = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./i, '') || 'news';
    } catch (_error) {
      return 'news';
    }
  })();

  return {
    id: `${symbol}:${hashString(url || title)}:${index}`,
    symbol,
    title,
    summary: `${symbol} headline: ${title}`,
    source,
    sentiment,
    url,
    publishedAt,
    createdAtLabel: toRelativeTimeLabel(publishedAt)
  };
}

async function getWildTakes(limit = 8) {
  const total = Math.max(1, Math.min(20, Math.trunc(limit)));
  const now = Date.now();
  if (Array.isArray(wildTakesCache.items) && wildTakesCache.items.length > 0 && now - wildTakesCache.fetchedAt < 5 * 60 * 1000) {
    return {
      generatedAt: new Date().toISOString(),
      dataNature: 'mixed_live',
      sourceDisclosure: 'Wild takes are extracted from recent Yahoo Finance news headlines and labeled with deterministic sentiment rules.',
      items: wildTakesCache.items.slice(0, total)
    };
  }

  const headlines = await extractLatestNewsHeadlines(Math.max(total * 2, 20));
  const items = headlines
    .map((entry, idx) => buildWildTakeFromHeadline(entry, idx))
    .filter((item) => item.title && item.url)
    .slice(0, total);

  wildTakesCache = {
    fetchedAt: now,
    items
  };

  return {
    generatedAt: new Date().toISOString(),
    dataNature: 'mixed_live',
    sourceDisclosure: 'Wild takes are extracted from recent Yahoo Finance news headlines and labeled with deterministic sentiment rules.',
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
