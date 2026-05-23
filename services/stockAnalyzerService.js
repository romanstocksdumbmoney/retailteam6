const path = require('node:path');
const fs = require('node:fs/promises');
const { MarketDataServiceError, normalizeTicker } = require('./MarketDataService');

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const NASDAQ_STOCKS_URL = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=25&offset=0&download=true';
const NASDAQ_ETFS_URL = 'https://api.nasdaq.com/api/screener/etf?download=true';
const YAHOO_CHART_URLS = [
  'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1y',
  'https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1y'
];
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const ALPHA_BASE = 'https://www.alphavantage.co/query';
const UNIVERSE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UNIVERSE_CACHE_FILE = path.join(__dirname, '..', 'data', 'ticker-universe-cache.json');

const FINNHUB_TOKEN = String(process.env.FINNHUB_TOKEN || process.env.FINNHUB_API_KEY || 'cqnbm59r01qhse25tlu0cqnbm59r01qhse25tlug').trim();
const ALPHA_VANTAGE_KEY = String(
  process.env.ALPHAVANTAGE_API_KEY
  || process.env.VITE_MARKET_API_KEY
  || process.env.MARKET_API_KEY
  || 'XK10T6I58YPTGMWE'
).trim();

const SEC_HEADERS = Object.freeze({
  accept: 'application/json, text/plain, */*',
  'user-agent': 'DumbDollars/1.0 (support@dumbdollars.app)'
});
const NASDAQ_HEADERS = Object.freeze({
  accept: 'application/json, text/plain, */*',
  'user-agent': 'Mozilla/5.0 (DumbDollars Stock Analysis)',
  origin: 'https://www.nasdaq.com',
  referer: 'https://www.nasdaq.com/'
});
const JSON_HEADERS = Object.freeze({
  accept: 'application/json, text/plain, */*',
  'user-agent': 'Mozilla/5.0 (DumbDollars Stock Analysis)'
});

let didAttemptDiskLoad = false;
let refreshUniversePromise = null;
let tickerUniverseCache = {
  loadedAt: 0,
  entries: [],
  symbolMap: new Map()
};

function createStockError(code, message, status = 500, extra = {}) {
  const error = new MarketDataServiceError(code, message, status);
  Object.assign(error, extra);
  return error;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Number(n.toFixed(digits));
}

function calculateRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) {
    return 50;
  }
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const diff = Number(closes[i]) - Number(closes[i - 1]);
    if (!Number.isFinite(diff)) {
      continue;
    }
    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) {
    return 100;
  }
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function normalizeUniverseSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, '')
    .replace(/\./g, '-');
}

function isUniverseSymbol(symbol) {
  return /^[A-Z]{1,6}(?:-[A-Z]{1,2})?$/.test(symbol);
}

function isStaleTimestamp(ts) {
  return !Number.isFinite(ts) || (Date.now() - ts) > UNIVERSE_TTL_MS;
}

function mapUniverseEntries(entries) {
  const symbolMap = new Map();
  for (const entry of entries) {
    if (!entry?.symbol) continue;
    symbolMap.set(entry.symbol, entry);
  }
  return symbolMap;
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchJsonWithAudit(source, ticker, url, { headers = JSON_HEADERS, timeoutMs = 5000 } = {}) {
  let response;
  let bodyText = '';
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
    bodyText = await response.text();
  } catch (error) {
    throw createStockError(
      'network_error',
      `Network error while calling ${source} for ${ticker}.`,
      503,
      { source, ticker, cause: error }
    );
  }

  console.log(`[STOCK_API_RESPONSE][${nowIso()}][${source}][${ticker}] status=${response.status} body=${bodyText}`);

  if (!response.ok) {
    throw createStockError(
      'upstream_failed',
      `${source} request failed for ${ticker}.`,
      502,
      { source, ticker, responseStatus: response.status, responseBody: bodyText }
    );
  }

  try {
    return JSON.parse(bodyText);
  } catch (error) {
    throw createStockError(
      'upstream_failed',
      `${source} returned invalid JSON for ${ticker}.`,
      502,
      { source, ticker, responseBody: bodyText, cause: error }
    );
  }
}

async function loadUniverseFromDiskIfAvailable() {
  if (didAttemptDiskLoad) {
    return;
  }
  didAttemptDiskLoad = true;
  try {
    const payload = JSON.parse(await fs.readFile(UNIVERSE_CACHE_FILE, 'utf8'));
    const loadedAt = Number(payload?.loadedAt || 0);
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    if (!entries.length) {
      return;
    }
    tickerUniverseCache = {
      loadedAt,
      entries,
      symbolMap: mapUniverseEntries(entries)
    };
    console.log(`[TICKER_UNIVERSE][LOAD_FROM_DISK] loaded ${entries.length} symbols from ${UNIVERSE_CACHE_FILE}`);
  } catch (_error) {
    // No cache on disk yet is expected for first run.
  }
}

async function persistUniverse(entries, loadedAt) {
  const payload = {
    loadedAt,
    entries
  };
  await fs.mkdir(path.dirname(UNIVERSE_CACHE_FILE), { recursive: true });
  await fs.writeFile(UNIVERSE_CACHE_FILE, JSON.stringify(payload), 'utf8');
}

async function fetchSecTickers() {
  const payload = await fetchJsonWithAudit('SEC Universe', 'UNIVERSE', SEC_TICKERS_URL, {
    headers: SEC_HEADERS,
    timeoutMs: 12000
  });
  const secMap = new Map();
  for (const row of Object.values(payload || {})) {
    const symbol = normalizeUniverseSymbol(row?.ticker);
    if (!symbol || !isUniverseSymbol(symbol)) continue;
    secMap.set(symbol, {
      symbol,
      name: String(row?.title || symbol).trim(),
      cik: Number(row?.cik_str || 0) || null
    });
  }
  return secMap;
}

async function fetchNasdaqRows(url, sourceLabel) {
  const payload = await fetchJsonWithAudit(sourceLabel, 'UNIVERSE', url, {
    headers: NASDAQ_HEADERS,
    timeoutMs: 12000
  });
  const rows = Array.isArray(payload?.data?.rows)
    ? payload.data.rows
    : Array.isArray(payload?.data?.data?.rows)
      ? payload.data.data.rows
      : [];
  return rows;
}

async function refreshTickerUniverse() {
  if (refreshUniversePromise) {
    return refreshUniversePromise;
  }
  refreshUniversePromise = (async () => {
    const secMap = await fetchSecTickers();
    const [stocksResult, etfsResult] = await Promise.allSettled([
      fetchNasdaqRows(NASDAQ_STOCKS_URL, 'Nasdaq Stocks Universe'),
      fetchNasdaqRows(NASDAQ_ETFS_URL, 'Nasdaq ETF Universe')
    ]);

    const stockRows = stocksResult.status === 'fulfilled' ? stocksResult.value : [];
    const etfRows = etfsResult.status === 'fulfilled' ? etfsResult.value : [];
    if (stocksResult.status !== 'fulfilled') {
      console.error(`[TICKER_UNIVERSE][NASDAQ_STOCKS_FAIL] ${stocksResult.reason?.message || stocksResult.reason}`);
    }
    if (etfsResult.status !== 'fulfilled') {
      console.error(`[TICKER_UNIVERSE][NASDAQ_ETF_FAIL] ${etfsResult.reason?.message || etfsResult.reason}`);
    }

    const stockMap = new Map();
    for (const row of stockRows) {
      const symbol = normalizeUniverseSymbol(row?.symbol);
      if (!symbol || !isUniverseSymbol(symbol)) continue;
      stockMap.set(symbol, String(row?.name || symbol).trim());
    }

    const etfMap = new Map();
    for (const row of etfRows) {
      const symbol = normalizeUniverseSymbol(row?.symbol || row?.ticker);
      if (!symbol || !isUniverseSymbol(symbol)) continue;
      etfMap.set(symbol, String(row?.companyName || row?.name || symbol).trim());
    }

    const majorEtfs = ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'IVV'];
    const secFallbackSymbols = stockMap.size === 0 ? [...secMap.keys()] : [];
    const allowedSymbols = new Set([
      ...secFallbackSymbols,
      ...stockMap.keys(),
      ...etfMap.keys(),
      ...majorEtfs
    ]);

    const entries = [...allowedSymbols]
      .filter((symbol) => isUniverseSymbol(symbol))
      .map((symbol) => {
        const secInfo = secMap.get(symbol);
        const stockName = stockMap.get(symbol);
        const etfName = etfMap.get(symbol);
        return {
          symbol,
          name: secInfo?.name || stockName || etfName || symbol,
          type: etfMap.has(symbol) ? 'etf' : 'equity',
          cik: secInfo?.cik || null
        };
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    const loadedAt = Date.now();
    tickerUniverseCache = {
      loadedAt,
      entries,
      symbolMap: mapUniverseEntries(entries)
    };
    await persistUniverse(entries, loadedAt);
    console.log(`[TICKER_UNIVERSE][REFRESH] loaded ${entries.length} symbols (equities + ETFs)`);
  })().finally(() => {
    refreshUniversePromise = null;
  });

  return refreshUniversePromise;
}

async function getTickerUniverse({ allowStale = true } = {}) {
  await loadUniverseFromDiskIfAvailable();

  const hasCache = tickerUniverseCache.entries.length > 0;
  const stale = isStaleTimestamp(tickerUniverseCache.loadedAt);

  if (!hasCache) {
    await refreshTickerUniverse();
    return tickerUniverseCache;
  }

  if (!stale) {
    return tickerUniverseCache;
  }

  if (allowStale) {
    void refreshTickerUniverse();
    return tickerUniverseCache;
  }

  await refreshTickerUniverse();
  return tickerUniverseCache;
}

function levenshtein(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  const dp = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[left.length][right.length];
}

function suggestTickers(query, entries, limit = 5) {
  const q = normalizeUniverseSymbol(query);
  if (!q) return [];

  const ranked = [];
  for (const entry of entries) {
    const symbol = entry.symbol;
    const name = String(entry.name || '').toUpperCase();
    let score = Number.POSITIVE_INFINITY;

    if (symbol === q) {
      score = 0;
    } else if (symbol.startsWith(q)) {
      score = 10 + (symbol.length - q.length);
    } else if (symbol.includes(q)) {
      score = 25 + symbol.indexOf(q);
    } else if (name.includes(q)) {
      score = 40 + name.indexOf(q);
    } else if (q.length >= 2 && symbol.length <= 6) {
      const dist = levenshtein(q, symbol);
      if (dist <= 2) {
        score = 60 + (dist * 10);
      }
    }

    if (Number.isFinite(score)) {
      ranked.push({
        symbol,
        name: entry.name,
        score
      });
    }
  }

  ranked.sort((a, b) => a.score - b.score || a.symbol.localeCompare(b.symbol));
  return ranked.slice(0, limit).map(({ symbol, name }) => ({ symbol, name }));
}

async function validateTradableTicker(symbol) {
  const universe = await getTickerUniverse({ allowStale: true });
  const entry = universe.symbolMap.get(symbol);
  if (entry) {
    return entry;
  }
  const suggestions = suggestTickers(symbol, universe.entries, 5);
  throw createStockError(
    'invalid_ticker',
    `'${symbol}' is not a recognized US stock ticker. Please enter a valid symbol like AAPL, TSLA, MU, NVDA.`,
    400,
    { suggestions }
  );
}

async function fetchYahooData(ticker) {
  let lastError = null;
  for (const template of YAHOO_CHART_URLS) {
    const url = template.replace('{ticker}', encodeURIComponent(ticker));
    try {
      const data = await fetchJsonWithAudit('Yahoo Finance', ticker, url, { timeoutMs: 5000 });
      if (data?.chart?.error) {
        throw createStockError(
          'source_no_data',
          data.chart.error.description || `No Yahoo data found for ${ticker}.`,
          404
        );
      }
      const result = data?.chart?.result?.[0];
      if (!result) {
        throw createStockError('source_no_data', `No Yahoo data found for ${ticker}.`, 404);
      }

      const meta = result.meta || {};
      const quote = result.indicators?.quote?.[0] || {};
      const closes = (quote.close || []).filter((v) => Number.isFinite(Number(v))).map(Number);
      const highs = (quote.high || []).filter((v) => Number.isFinite(Number(v))).map(Number);
      const lows = (quote.low || []).filter((v) => Number.isFinite(Number(v))).map(Number);
      const volumes = (quote.volume || []).filter((v) => Number.isFinite(Number(v))).map(Number);
      if (!closes.length) {
        throw createStockError('source_no_data', `No Yahoo data found for ${ticker}.`, 404);
      }

      const price = toNumber(meta.regularMarketPrice) ?? closes.at(-1);
      const prevClose = toNumber(meta.previousClose) ?? toNumber(meta.chartPreviousClose) ?? closes.at(-2) ?? closes.at(-1);
      const change = Number(price) - Number(prevClose);
      const changePercent = prevClose ? round((change / prevClose) * 100, 2) : 0;
      const trailing = closes.slice(-252);
      const week52High = trailing.length ? Math.max(...trailing) : Math.max(...closes);
      const week52Low = trailing.length ? Math.min(...trailing) : Math.min(...closes);
      const avgVolume = volumes.length
        ? volumes.slice(-20).reduce((acc, value) => acc + value, 0) / Math.min(20, volumes.length)
        : 0;

      return {
        source: 'Yahoo Finance',
        price: round(price, 2),
        prevClose: round(prevClose, 2),
        change: round(change, 2),
        changePercent,
        volume: toNumber(meta.regularMarketVolume) || volumes.at(-1) || 0,
        avgVolume: round(avgVolume, 0),
        week52High: round(week52High, 2),
        week52Low: round(week52Low, 2),
        sma20: closes.length >= 20 ? round(closes.slice(-20).reduce((a, b) => a + b, 0) / 20, 2) : null,
        sma50: closes.length >= 50 ? round(closes.slice(-50).reduce((a, b) => a + b, 0) / 50, 2) : null,
        sma200: closes.length >= 200 ? round(closes.slice(-200).reduce((a, b) => a + b, 0) / 200, 2) : null,
        rsi: round(calculateRSI(closes, 14), 1),
        companyName: String(meta.longName || meta.shortName || ticker),
        marketCap: toNumber(meta.marketCap),
        dayHigh: highs.length ? highs.at(-1) : null,
        dayLow: lows.length ? lows.at(-1) : null,
        rawCloses: closes
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || createStockError('upstream_failed', `Yahoo Finance failed for ${ticker}.`, 503);
}

async function fetchFinnhubData(ticker) {
  const quote = await fetchJsonWithAudit('Finnhub Quote', ticker, `${FINNHUB_BASE}/quote?symbol=${ticker}&token=${FINNHUB_TOKEN}`, { timeoutMs: 5000 });
  if (!quote || !Number.isFinite(Number(quote.c))) {
    throw createStockError('source_no_data', `No Finnhub quote data for ${ticker}.`, 404);
  }

  const [profileRes, recommendationsRes, metricsRes] = await Promise.allSettled([
    fetchJsonWithAudit('Finnhub Profile', ticker, `${FINNHUB_BASE}/stock/profile2?symbol=${ticker}&token=${FINNHUB_TOKEN}`, { timeoutMs: 5000 }),
    fetchJsonWithAudit('Finnhub Recommendations', ticker, `${FINNHUB_BASE}/stock/recommendation?symbol=${ticker}&token=${FINNHUB_TOKEN}`, { timeoutMs: 5000 }),
    fetchJsonWithAudit('Finnhub Metrics', ticker, `${FINNHUB_BASE}/stock/metric?symbol=${ticker}&metric=all&token=${FINNHUB_TOKEN}`, { timeoutMs: 5000 })
  ]);

  const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
  const recs = recommendationsRes.status === 'fulfilled' ? recommendationsRes.value : null;
  const metrics = metricsRes.status === 'fulfilled' ? metricsRes.value : null;
  const metric = metrics?.metric || {};

  const analystRec = Array.isArray(recs) && recs.length
    ? {
      strongBuy: Number(recs[0].strongBuy || 0),
      buy: Number(recs[0].buy || 0),
      hold: Number(recs[0].hold || 0),
      sell: Number(recs[0].sell || 0),
      strongSell: Number(recs[0].strongSell || 0),
      period: recs[0].period || ''
    }
    : null;

  return {
    source: 'Finnhub',
    price: round(quote.c, 2),
    prevClose: round(quote.pc, 2),
    change: round(quote.c - quote.pc, 2),
    changePercent: quote.pc ? round(((quote.c - quote.pc) / quote.pc) * 100, 2) : 0,
    dayHigh: toNumber(quote.h),
    dayLow: toNumber(quote.l),
    companyName: profile?.name || ticker,
    sector: profile?.finnhubIndustry || null,
    country: profile?.country || null,
    exchange: profile?.exchange || null,
    ipo: profile?.ipo || null,
    website: profile?.weburl || null,
    analystRec,
    week52High: toNumber(metric['52WeekHigh']),
    week52Low: toNumber(metric['52WeekLow']),
    pe: toNumber(metric.peNormalizedAnnual) || toNumber(metric.peTTM),
    eps: toNumber(metric.epsTTM),
    beta: toNumber(metric.beta),
    roa: toNumber(metric.roaTTM),
    roe: toNumber(metric.roeTTM),
    revenueGrowth: toNumber(metric.revenueGrowthTTMYoy),
    grossMargin: toNumber(metric.grossMarginTTM),
    netMargin: toNumber(metric.netMarginTTM),
    debtToEquity: toNumber(metric['totalDebt/totalEquityAnnual']),
    currentRatio: toNumber(metric.currentRatioAnnual)
  };
}

async function fetchAlphaVantageData(ticker) {
  const quoteData = await fetchJsonWithAudit(
    'Alpha Vantage Quote',
    ticker,
    `${ALPHA_BASE}?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${encodeURIComponent(ALPHA_VANTAGE_KEY)}`,
    { timeoutMs: 5000 }
  );

  if (quoteData?.Information || quoteData?.Note) {
    throw createStockError('api_rate_limited', `Alpha Vantage rate limited for ${ticker}.`, 429);
  }
  if (quoteData?.['Error Message']) {
    throw createStockError('source_no_data', `No Alpha Vantage quote data for ${ticker}.`, 404);
  }

  const q = quoteData?.['Global Quote'] || {};
  const price = toNumber(q['05. price']);
  if (!Number.isFinite(price)) {
    throw createStockError('source_no_data', `No Alpha Vantage quote data for ${ticker}.`, 404);
  }

  let overview = {};
  let rsi = null;
  let macd = null;
  let macdSignal = null;
  let macdHist = null;

  try {
    overview = await fetchJsonWithAudit(
      'Alpha Vantage Overview',
      ticker,
      `${ALPHA_BASE}?function=OVERVIEW&symbol=${ticker}&apikey=${encodeURIComponent(ALPHA_VANTAGE_KEY)}`,
      { timeoutMs: 5000 }
    );
  } catch (_error) {
    overview = {};
  }

  try {
    const rsiData = await fetchJsonWithAudit(
      'Alpha Vantage RSI',
      ticker,
      `${ALPHA_BASE}?function=RSI&symbol=${ticker}&interval=daily&time_period=14&series_type=close&apikey=${encodeURIComponent(ALPHA_VANTAGE_KEY)}`,
      { timeoutMs: 5000 }
    );
    const points = rsiData?.['Technical Analysis: RSI'];
    if (points) {
      const latest = Object.values(points)[0];
      rsi = toNumber(latest?.RSI);
    }
  } catch (_error) {
    rsi = null;
  }

  try {
    const macdData = await fetchJsonWithAudit(
      'Alpha Vantage MACD',
      ticker,
      `${ALPHA_BASE}?function=MACD&symbol=${ticker}&interval=daily&series_type=close&apikey=${encodeURIComponent(ALPHA_VANTAGE_KEY)}`,
      { timeoutMs: 5000 }
    );
    const points = macdData?.['Technical Analysis: MACD'];
    if (points) {
      const latest = Object.values(points)[0];
      macd = toNumber(latest?.MACD);
      macdSignal = toNumber(latest?.MACD_Signal);
      macdHist = toNumber(latest?.MACD_Hist);
    }
  } catch (_error) {
    macd = null;
  }

  return {
    source: 'Alpha Vantage',
    price: round(price, 2),
    prevClose: toNumber(q['08. previous close']),
    change: toNumber(q['09. change']),
    changePercent: toNumber(String(q['10. change percent'] || '').replace('%', '')),
    volume: toNumber(q['06. volume']),
    week52High: toNumber(overview['52WeekHigh']),
    week52Low: toNumber(overview['52WeekLow']),
    rsi,
    macd,
    macdSignal,
    macdHist,
    pe: toNumber(overview.PERatio),
    eps: toNumber(overview.EPS),
    analystTarget: toNumber(overview.AnalystTargetPrice),
    sector: overview.Sector || null,
    industry: overview.Industry || null,
    companyName: overview.Name || ticker,
    marketCap: toNumber(overview.MarketCapitalization),
    beta: toNumber(overview.Beta),
    dividendYield: toNumber(overview.DividendYield),
    pegRatio: toNumber(overview.PEGRatio),
    priceToBook: toNumber(overview.PriceToBookRatio),
    revenueGrowth: toNumber(overview.QuarterlyRevenueGrowthYOY),
    earningsGrowth: toNumber(overview.QuarterlyEarningsGrowthYOY),
    description: overview.Description || null
  };
}

async function fetchStockDataWaterfall(ticker) {
  const attempts = [];
  const providers = [
    { name: 'Yahoo Finance', handler: fetchYahooData },
    { name: 'Finnhub', handler: fetchFinnhubData },
    { name: 'Alpha Vantage', handler: fetchAlphaVantageData }
  ];

  for (const provider of providers) {
    try {
      return await provider.handler(ticker);
    } catch (error) {
      attempts.push({
        provider: provider.name,
        code: error?.code || 'upstream_failed',
        message: error?.message || 'Unknown error'
      });
      console.error(`[STOCK_FETCH_FAIL][${nowIso()}][${ticker}][${provider.name}] ${error?.code || 'error'} ${error?.message || error}`);
    }
  }

  const attemptCodes = attempts.map((item) => item.code);
  const allRateLimited = attempts.length > 0 && attempts.every((item) => item.code === 'api_rate_limited');
  if (allRateLimited) {
    throw createStockError('api_rate_limited', `Data providers are rate limited for ${ticker}. Please try again shortly.`, 429, { attempts });
  }
  if (attemptCodes.includes('network_error')) {
    throw createStockError('network_error', `Network error while fetching data for ${ticker}. Please try again.`, 503, { attempts });
  }
  throw createStockError('data_temporarily_unavailable', `Data temporarily unavailable for ${ticker}. Please try again.`, 503, { attempts });
}

function mergeTickerEntry(symbol, entry, sourcePayload) {
  const price = toNumber(sourcePayload.price);
  const prevClose = toNumber(sourcePayload.prevClose);
  const change = Number.isFinite(toNumber(sourcePayload.change))
    ? Number(sourcePayload.change)
    : (Number.isFinite(price) && Number.isFinite(prevClose) ? price - prevClose : null);
  const changePercent = Number.isFinite(toNumber(sourcePayload.changePercent))
    ? Number(sourcePayload.changePercent)
    : (Number.isFinite(change) && Number.isFinite(prevClose) && prevClose !== 0
      ? (change / prevClose) * 100
      : null);

  if (!Number.isFinite(price)) {
    throw createStockError('data_temporarily_unavailable', `Data temporarily unavailable for ${symbol}. Please try again.`, 503);
  }

  return {
    ticker: symbol,
    companyName: String(sourcePayload.companyName || entry?.name || symbol),
    price: round(price, 2),
    prevClose: round(prevClose, 2),
    change: round(change, 2),
    changePercent: Number.isFinite(changePercent) ? `${round(changePercent, 2)}%` : 'N/A',
    changeFloat: round(changePercent, 2),
    dayHigh: toNumber(sourcePayload.dayHigh),
    dayLow: toNumber(sourcePayload.dayLow),
    volume: toNumber(sourcePayload.volume) || 0,
    avgVolume: toNumber(sourcePayload.avgVolume),
    week52High: toNumber(sourcePayload.week52High),
    week52Low: toNumber(sourcePayload.week52Low),
    sma20: toNumber(sourcePayload.sma20),
    sma50: toNumber(sourcePayload.sma50),
    sma200: toNumber(sourcePayload.sma200),
    rsi: toNumber(sourcePayload.rsi),
    macd: toNumber(sourcePayload.macd),
    macdSignal: toNumber(sourcePayload.macdSignal),
    macdHist: toNumber(sourcePayload.macdHist),
    pe: toNumber(sourcePayload.pe),
    forwardPE: toNumber(sourcePayload.forwardPE),
    eps: toNumber(sourcePayload.eps),
    beta: toNumber(sourcePayload.beta),
    marketCap: toNumber(sourcePayload.marketCap),
    sector: sourcePayload.sector || 'N/A',
    industry: sourcePayload.industry || null,
    analystTarget: toNumber(sourcePayload.analystTarget),
    analystRec: sourcePayload.analystRec || null,
    analystCount: toNumber(sourcePayload.analystCount),
    dividendYield: toNumber(sourcePayload.dividendYield),
    pegRatio: toNumber(sourcePayload.pegRatio),
    priceToBook: toNumber(sourcePayload.priceToBook),
    revenueGrowth: toNumber(sourcePayload.revenueGrowth),
    earningsGrowth: toNumber(sourcePayload.earningsGrowth),
    roa: toNumber(sourcePayload.roa),
    roe: toNumber(sourcePayload.roe),
    grossMargin: toNumber(sourcePayload.grossMargin),
    netMargin: toNumber(sourcePayload.netMargin),
    debtToEquity: toNumber(sourcePayload.debtToEquity),
    currentRatio: toNumber(sourcePayload.currentRatio),
    description: sourcePayload.description || null,
    website: sourcePayload.website || null,
    employees: toNumber(sourcePayload.employees),
    country: sourcePayload.country || null,
    exchange: sourcePayload.exchange || null,
    ipo: sourcePayload.ipo || null,
    rawCloses: Array.isArray(sourcePayload.rawCloses) ? sourcePayload.rawCloses : [],
    sources: [sourcePayload.source || 'Unknown'],
    dataSource: sourcePayload.source || 'Unknown',
    validation: {
      universe: 'SEC + Nasdaq Stocks/ETF screener',
      refreshedAt: nowIso(),
      tradableType: entry?.type || 'equity'
    }
  };
}

async function analyzeStockResearch(ticker) {
  const symbol = normalizeTicker(ticker);
  if (!symbol || !isUniverseSymbol(symbol)) {
    const universe = await getTickerUniverse({ allowStale: true });
    const suggestions = suggestTickers(symbol, universe.entries, 5);
    throw createStockError(
      'invalid_ticker',
      `'${symbol || ticker}' is not a recognized US stock ticker. Please enter a valid symbol like AAPL, TSLA, MU, NVDA.`,
      400,
      { suggestions }
    );
  }

  const entry = await validateTradableTicker(symbol);
  const sourcePayload = await fetchStockDataWaterfall(symbol);
  return mergeTickerEntry(symbol, entry, sourcePayload);
}

async function warmTickerUniverseCache() {
  try {
    await getTickerUniverse({ allowStale: false });
  } catch (error) {
    console.error(`[TICKER_UNIVERSE][WARM_FAIL] ${error?.message || error}`);
  }
}

module.exports = {
  analyzeStockResearch,
  warmTickerUniverseCache
};
