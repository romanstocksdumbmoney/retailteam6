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

function humanizeEarningsScheduleLabel(targetDate, effectiveDate) {
  const target = String(targetDate || '').trim();
  const effective = String(effectiveDate || '').trim();
  const today = todayIsoDate();
  const tomorrow = addDaysToIsoDate(today, 1);
  if (effective === today) {
    return `Today's earnings (${formatIsoDate(effective)} ET)`;
  }
  if (effective === tomorrow) {
    return `Tomorrow's earnings (${formatIsoDate(effective)} ET)`;
  }
  if (target && effective === target) {
    return `Earnings board (${formatIsoDate(effective)} ET)`;
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
  const calendarRows = await fetchNasdaqEarningsCalendar();

  let source = 'nasdaq';
  let scheduleDate = requestedDate;
  let scheduleLabel = humanizeEarningsScheduleLabel(requestedDate, requestedDate);

  let selectedRows = calendarRows.filter((entry) => entry.earningsDate === requestedDate);
  if (selectedRows.length === 0) {
    const alphaRows = await fetchAlphaVantageEarningsByDate(requestedDate);
    if (alphaRows.length > 0) {
      selectedRows = alphaRows;
      source = 'alphavantage';
    }
  }

  selectedRows = filterCompletedEarnings(selectedRows);

  if (selectedRows.length === 0 && calendarRows.length > 0) {
    const availableDates = [...new Set(calendarRows.map((entry) => entry.earningsDate).filter(Boolean))].sort();
    const nowEtDate = todayIsoDate();
    const selectedDate = availableDates.find((isoDate) => isoDate > nowEtDate)
      || availableDates.find((isoDate) => isoDate >= requestedDate)
      || availableDates[0]
      || requestedDate;
    selectedRows = calendarRows.filter((entry) => entry.earningsDate === selectedDate);
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
      return {
        ...entry,
        estimatedVolume: hasYahooVolume ? yahooVolume : estimatedVolume + marketCapWeight,
        volumeSource: hasYahooVolume ? (yahooVolumes[entry.symbol]?.source || 'yahoo') : 'model_estimate'
      };
    })
    .filter((entry) => source !== 'alphavantage' || isLikelyTradableTicker(entry.symbol));

  if (rankedByVolume.length === 0) {
    const fallbackDate = requestedDate;
    rankedByVolume = TOMORROW_EARNINGS_CALLS.map((symbol) => ({
      symbol,
      earningsDate: fallbackDate,
      reportTime: 'Unknown',
      estimatedVolume: estimateEarningsDayVolume(symbol, fallbackDate),
      volumeSource: 'model_estimate'
    }))
      .sort((a, b) => b.estimatedVolume - a.estimatedVolume);
    source = 'simulated';
    scheduleDate = fallbackDate;
    scheduleLabel = `Estimated earnings board (${formatIsoDate(fallbackDate)} ET)`;
  }

  rankedByVolume = rankedByVolume.sort((a, b) => b.estimatedVolume - a.estimatedVolume).slice(0, boundedLimit);

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

    return {
      symbol,
      volume: entry.estimatedVolume,
      volumeSource: entry.volumeSource || 'model_estimate',
      earningsDate: entry.earningsDate,
      earningsDateLabel,
      reportTime: entry.reportTime === 'Unknown' ? (index % 2 === 0 ? 'Pre-Market' : 'After-Hours') : entry.reportTime,
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
  getHighIvTracker,
  getRealizedPatterns,
  getWildTakes,
  analyzeAiTradePattern
};
