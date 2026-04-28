require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { MarketDataServiceError, normalizeTicker } = require('./MarketDataService');

const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote';
const STOOQ_QUOTE_URL = 'https://stooq.com/q/l/';

function getMarketDataApiKey() {
  const candidateKeys = [
    process.env.ALPHAVANTAGE_API_KEY,
    process.env.MARKET_DATA_API_KEY,
    process.env.MARKET_API_KEY,
    process.env.VITE_MARKET_API_KEY,
    process.env.NEXT_PUBLIC_MARKET_API_KEY,
    process.env.REACT_APP_MARKET_API_KEY
  ];
  return String(candidateKeys.find((value) => String(value || '').trim()) || '').trim();
}

function parseNumber(value) {
  const raw = String(value ?? '').trim().replace(/,/g, '');
  if (!raw) {
    return null;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function parsePercent(value) {
  return parseNumber(String(value ?? '').replace('%', ''));
}

function roundTo(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number(numeric.toFixed(digits));
}

function parseMarketCap(value) {
  const numeric = parseNumber(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isLikelyValidTicker(symbol) {
  return /^[A-Z]{1,6}(?:[.-][A-Z]{1,2})?$/.test(String(symbol || '').trim());
}

function isAlphaRateLimited(payload) {
  const note = String(payload?.Note || payload?.Information || '').trim();
  return Boolean(note && /call frequency|rate limit|thank you for using alpha vantage|standard api call frequency/i.test(note));
}

function isAlphaInvalidRequest(payload) {
  const message = String(payload?.['Error Message'] || '').trim();
  return Boolean(message);
}

async function fetchJson(url, { timeoutMs = 12000, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (_error) {
    throw new MarketDataServiceError('market_data_unavailable', 'Could not fetch market data right now. Try again.', 503);
  }

  if (!response.ok) {
    throw new MarketDataServiceError('market_data_unavailable', 'Could not fetch market data right now. Try again.', 503);
  }

  try {
    return await response.json();
  } catch (_error) {
    throw new MarketDataServiceError('market_data_unavailable', 'Could not fetch market data right now. Try again.', 503);
  }
}

async function alphaRequest(fn, symbol, extra = {}) {
  const apiKey = getMarketDataApiKey();
  if (!apiKey) {
    throw new MarketDataServiceError(
      'no_api_key',
      'Market data API key is missing. Add it to your .env file and restart the dev server.',
      503
    );
  }

  const params = new URLSearchParams({
    function: fn,
    symbol,
    apikey: apiKey,
    ...extra
  });
  const url = `${ALPHA_VANTAGE_BASE_URL}?${params.toString()}`;
  const payload = await fetchJson(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'user-agent': 'Mozilla/5.0 (DumbDollars Stock Analyzer)'
    }
  });

  if (isAlphaInvalidRequest(payload)) {
    return { status: 'invalid', payload };
  }
  if (isAlphaRateLimited(payload)) {
    return { status: 'limited', payload };
  }
  return { status: 'ok', payload };
}

function pickLatestSeriesPoint(series) {
  const dates = Object.keys(series || {}).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  if (!dates.length) {
    return {
      date: null,
      point: null,
      previousDate: null,
      previousPoint: null
    };
  }
  const date = dates[0];
  const previousDate = dates[1] || null;
  return {
    date,
    point: series[date] || null,
    previousDate,
    previousPoint: previousDate ? series[previousDate] || null : null
  };
}

async function fetchYahooQuote(symbol) {
  const url = `${YAHOO_QUOTE_URL}?symbols=${encodeURIComponent(symbol)}`;
  const payload = await fetchJson(url, {
    headers: {
      accept: 'application/json, text/plain, */*',
      'user-agent': 'Mozilla/5.0 (DumbDollars Stock Analyzer Yahoo Fallback)'
    }
  });
  const rows = Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
  if (!rows.length) {
    throw new MarketDataServiceError('invalid_ticker', 'Ticker not found. Check the symbol and try again.', 404);
  }
  const row = rows.find((entry) => String(entry?.symbol || '').toUpperCase() === symbol) || rows[0];
  const price = parseNumber(row?.regularMarketPrice);
  if (!Number.isFinite(price)) {
    throw new MarketDataServiceError('invalid_ticker', 'Ticker not found. Check the symbol and try again.', 404);
  }
  const marketTime = Number(row?.regularMarketTime);
  const latestDate = Number.isFinite(marketTime)
    ? new Date(marketTime * 1000).toISOString().slice(0, 10)
    : null;
  return {
    symbol,
    companyName: String(row?.longName || row?.shortName || symbol),
    price,
    dailyChange: parseNumber(row?.regularMarketChange),
    changePercent: parseNumber(row?.regularMarketChangePercent),
    volume: parseNumber(row?.regularMarketVolume),
    previousClose: parseNumber(row?.regularMarketPreviousClose),
    latestTradingDay: latestDate,
    source: 'Yahoo Finance quote fallback'
  };
}

async function fetchStooqQuote(symbol) {
  const stooqSymbol = `${String(symbol).toLowerCase()}.us`;
  const params = new URLSearchParams({
    s: stooqSymbol,
    i: 'd'
  });
  const url = `${STOOQ_QUOTE_URL}?${params.toString()}`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        accept: 'text/plain,*/*',
        'user-agent': 'Mozilla/5.0 (DumbDollars Stock Analyzer Stooq Fallback)'
      },
      signal: AbortSignal.timeout(12000)
    });
  } catch (_error) {
    throw new MarketDataServiceError('market_data_unavailable', 'Could not fetch market data right now. Try again.', 503);
  }

  if (!response.ok) {
    throw new MarketDataServiceError('market_data_unavailable', 'Could not fetch market data right now. Try again.', 503);
  }

  const text = await response.text();
  const line = String(text || '').trim().split('\n')[0] || '';
  const parts = line.split(',');
  if (parts.length < 8) {
    throw new MarketDataServiceError('market_data_unavailable', 'Could not fetch market data right now. Try again.', 503);
  }

  const dateToken = String(parts[1] || '').trim();
  const close = parseNumber(parts[6]);
  const volume = parseNumber(parts[7]);
  const open = parseNumber(parts[3]);
  const high = parseNumber(parts[4]);
  const low = parseNumber(parts[5]);

  if (!Number.isFinite(close) || /N\/D/i.test(line)) {
    throw new MarketDataServiceError('invalid_ticker', 'Ticker not found. Check the symbol and try again.', 404);
  }

  const latestTradingDay = /^\d{8}$/.test(dateToken)
    ? `${dateToken.slice(0, 4)}-${dateToken.slice(4, 6)}-${dateToken.slice(6, 8)}`
    : null;

  return {
    symbol,
    companyName: symbol,
    price: close,
    dailyChange: null,
    changePercent: null,
    volume,
    previousClose: null,
    latestTradingDay,
    open,
    high,
    low,
    source: 'Stooq quote fallback'
  };
}

async function fetchQuote(symbol) {
  const result = await alphaRequest('GLOBAL_QUOTE', symbol);
  if (result.status === 'invalid') {
    throw new MarketDataServiceError('invalid_ticker', 'Ticker not found. Check the symbol and try again.', 404);
  }
  if (result.status === 'limited') {
    try {
      return await fetchYahooQuote(symbol);
    } catch (_error) {
      return fetchStooqQuote(symbol);
    }
  }

  const quote = result.payload?.['Global Quote'] || {};
  const price = parseNumber(quote?.['05. price']);
  if (!Number.isFinite(price)) {
    try {
      return await fetchYahooQuote(symbol);
    } catch (_error) {
      return fetchStooqQuote(symbol);
    }
  }
  return {
    symbol,
    companyName: symbol,
    price,
    dailyChange: parseNumber(quote?.['09. change']),
    changePercent: parsePercent(quote?.['10. change percent']),
    volume: parseNumber(quote?.['06. volume']),
    previousClose: parseNumber(quote?.['08. previous close']),
    latestTradingDay: String(quote?.['07. latest trading day'] || '').trim() || null,
    source: 'Alpha Vantage GLOBAL_QUOTE'
  };
}

function computeRsiScore(rsi) {
  if (!Number.isFinite(rsi)) {
    return 50;
  }
  if (rsi < 30) return 85;
  if (rsi < 45) return 70;
  if (rsi <= 55) return 50;
  if (rsi <= 70) return 40;
  return 20;
}

function computeMacdScore(macdLine, signalLine, histogram, previousHistogram) {
  if (![macdLine, signalLine, histogram].every(Number.isFinite)) {
    return 50;
  }
  const histogramGrowing = Number.isFinite(previousHistogram) ? histogram > previousHistogram : histogram >= 0;
  if (macdLine > signalLine && histogramGrowing) return 80;
  if (macdLine > signalLine && !histogramGrowing) return 55;
  if (macdLine < signalLine && !histogramGrowing) return 25;
  return 45;
}

function computeSmaScore(price, sma50, sma200) {
  if (![price, sma50, sma200].every(Number.isFinite)) {
    return 50;
  }
  if (price > sma50 && sma50 > sma200) return 85;
  if (price > sma50 && sma50 < sma200) return 55;
  if (price < sma50 && sma50 > sma200) return 40;
  if (price < sma50 && sma50 < sma200) return 20;
  return 50;
}

function getBbPosition(price, lower, upper) {
  if (![price, lower, upper].every(Number.isFinite) || upper <= lower) {
    return null;
  }
  return Math.max(0, Math.min(1, (price - lower) / (upper - lower)));
}

function computeBbScore(price, lower, middle, upper) {
  const position = getBbPosition(price, lower, upper);
  if (!Number.isFinite(position)) {
    return 50;
  }
  if (position <= 0.33) return 75;
  if (position >= 0.67) return 30;
  if (Number.isFinite(middle) && Math.abs(price - middle) <= Math.abs(upper - lower) * 0.16) {
    return 50;
  }
  return 50;
}

function computeValuationScore(peRatio) {
  if (!Number.isFinite(peRatio)) {
    return 50;
  }
  if (peRatio < 15) return 80;
  if (peRatio <= 25) return 65;
  if (peRatio <= 40) return 45;
  return 25;
}

function riskFromScore(score) {
  if (!Number.isFinite(score)) {
    return 'MEDIUM';
  }
  if (score >= 70) return 'LOW';
  if (score >= 45) return 'MEDIUM';
  return 'HIGH';
}

function overallLabel(score) {
  if (score >= 80) return 'STRONG BUY';
  if (score >= 60) return 'GOOD';
  if (score >= 40) return 'NEUTRAL';
  return 'WEAK';
}

function signalFromRsi(rsi) {
  if (!Number.isFinite(rsi)) return 'Unavailable';
  if (rsi < 30) return 'Oversold opportunity';
  if (rsi > 70) return 'Overbought risk';
  return 'Neutral';
}

function signalFromMacd(macdLine, signalLine, histogram, previousHistogram) {
  if (![macdLine, signalLine, histogram].every(Number.isFinite)) {
    return 'Unavailable';
  }
  const histogramGrowing = Number.isFinite(previousHistogram) ? histogram > previousHistogram : histogram >= 0;
  if (macdLine > signalLine && histogramGrowing) return 'Bullish crossover';
  if (macdLine > signalLine) return 'Bullish but cooling';
  if (macdLine < signalLine && histogramGrowing) return 'Bearish but recovering';
  return 'Bearish crossover';
}

function signalFromPriceVsSma(price, sma) {
  if (![price, sma].every(Number.isFinite)) {
    return 'Unavailable';
  }
  return price >= sma ? 'Above (bullish)' : 'Below (bearish)';
}

function signalFromBbPosition(position) {
  if (!Number.isFinite(position)) {
    return 'Unavailable';
  }
  if (position <= 0.33) return 'Near lower band';
  if (position >= 0.67) return 'Near upper band';
  return 'Near middle';
}

function formatBandZone(position) {
  if (!Number.isFinite(position)) return 'Unavailable';
  if (position <= 0.33) return 'lower';
  if (position >= 0.67) return 'upper';
  return 'middle';
}

async function analyzeStockResearch(ticker) {
  const symbol = normalizeTicker(ticker);
  if (!symbol || !isLikelyValidTicker(symbol)) {
    throw new MarketDataServiceError('invalid_ticker', 'Ticker not found. Check the symbol and try again.', 404);
  }
  if (!getMarketDataApiKey()) {
    throw new MarketDataServiceError(
      'no_api_key',
      'Market data API key is missing. Add it to your .env file and restart the dev server.',
      503
    );
  }

  const quote = await fetchQuote(symbol);

  const endpointCalls = {
    rsi: alphaRequest('RSI', symbol, { interval: 'daily', time_period: '14', series_type: 'close' }),
    macd: alphaRequest('MACD', symbol, { interval: 'daily', series_type: 'close' }),
    sma50: alphaRequest('SMA', symbol, { interval: 'daily', time_period: '50', series_type: 'close' }),
    sma200: alphaRequest('SMA', symbol, { interval: 'daily', time_period: '200', series_type: 'close' }),
    bbands: alphaRequest('BBANDS', symbol, { interval: 'daily', time_period: '20', series_type: 'close' }),
    overview: alphaRequest('OVERVIEW', symbol)
  };

  const settled = await Promise.allSettled(Object.values(endpointCalls));
  const [rsiRaw, macdRaw, sma50Raw, sma200Raw, bbandsRaw, overviewRaw] = settled.map((entry) => (
    entry.status === 'fulfilled' ? entry.value : { status: 'error', error: entry.reason }
  ));

  const limitedEndpoints = [];
  [rsiRaw, macdRaw, sma50Raw, sma200Raw, bbandsRaw, overviewRaw].forEach((entry, index) => {
    if (entry?.status === 'limited') {
      limitedEndpoints.push(Object.keys(endpointCalls)[index]);
    }
  });

  const rsiPoint = pickLatestSeriesPoint(rsiRaw?.payload?.['Technical Analysis: RSI']);
  const rsi14 = parseNumber(rsiPoint?.point?.RSI);

  const macdPoint = pickLatestSeriesPoint(macdRaw?.payload?.['Technical Analysis: MACD']);
  const macdLine = parseNumber(macdPoint?.point?.MACD);
  const macdSignal = parseNumber(macdPoint?.point?.MACD_Signal);
  const macdHistogram = parseNumber(macdPoint?.point?.MACD_Hist);
  const macdHistogramPrev = parseNumber(macdPoint?.previousPoint?.MACD_Hist);

  const sma50Point = pickLatestSeriesPoint(sma50Raw?.payload?.['Technical Analysis: SMA']);
  const sma200Point = pickLatestSeriesPoint(sma200Raw?.payload?.['Technical Analysis: SMA']);
  const sma50 = parseNumber(sma50Point?.point?.SMA);
  const sma200 = parseNumber(sma200Point?.point?.SMA);

  const bbPoint = pickLatestSeriesPoint(bbandsRaw?.payload?.['Technical Analysis: BBANDS']);
  const bbLower = parseNumber(bbPoint?.point?.['Real Lower Band']);
  const bbMiddle = parseNumber(bbPoint?.point?.['Real Middle Band']);
  const bbUpper = parseNumber(bbPoint?.point?.['Real Upper Band']);
  const bbPosition = getBbPosition(quote.price, bbLower, bbUpper);
  const bbWidthPercent = ([bbLower, bbUpper, bbMiddle].every(Number.isFinite) && bbMiddle !== 0)
    ? roundTo(((bbUpper - bbLower) / Math.abs(bbMiddle)) * 100, 2)
    : null;

  const overviewPayload = overviewRaw?.status === 'ok' ? overviewRaw.payload : {};
  const companyName = String(overviewPayload?.Name || quote.companyName || symbol).trim() || symbol;
  const marketCap = parseMarketCap(overviewPayload?.MarketCapitalization);
  const peRatio = parseNumber(overviewPayload?.PERatio);
  const eps = parseNumber(overviewPayload?.EPS);
  const sector = String(overviewPayload?.Sector || '').trim() || null;
  const fiftyTwoWeekHigh = parseNumber(overviewPayload?.['52WeekHigh']);
  const fiftyTwoWeekLow = parseNumber(overviewPayload?.['52WeekLow']);
  const analystTargetPrice = parseNumber(overviewPayload?.AnalystTargetPrice);
  const averageVolume = parseNumber(overviewPayload?.AverageVolume);
  const volumeRatio = Number.isFinite(quote.volume) && Number.isFinite(averageVolume) && averageVolume > 0
    ? roundTo(quote.volume / averageVolume, 2)
    : null;

  const rsiScore = computeRsiScore(rsi14);
  const macdScore = computeMacdScore(macdLine, macdSignal, macdHistogram, macdHistogramPrev);
  const smaScore = computeSmaScore(quote.price, sma50, sma200);
  const bbScore = computeBbScore(quote.price, bbLower, bbMiddle, bbUpper);
  const valuationScore = computeValuationScore(peRatio);

  const overallScore = Math.round(
    (rsiScore * 0.2)
    + (macdScore * 0.25)
    + (smaScore * 0.25)
    + (bbScore * 0.15)
    + (valuationScore * 0.15)
  );
  const compositeLabel = overallLabel(overallScore);

  const volumeScore = Number.isFinite(volumeRatio)
    ? (volumeRatio >= 1.2 ? 75 : volumeRatio < 0.8 ? 35 : 50)
    : 50;
  const dayTradeScore = Math.round((rsiScore * 0.3) + (macdScore * 0.35) + (bbScore * 0.2) + (volumeScore * 0.15));
  const dayTradeVerdict = dayTradeScore >= 65 ? 'Good for day trading today' : dayTradeScore < 40 ? 'Avoid day trading' : 'Neutral';
  const dayTradeReason = Number.isFinite(rsi14) && Number.isFinite(volumeRatio)
    ? `RSI ${roundTo(rsi14, 1)} with volume ${volumeRatio}x average and MACD signal ${signalFromMacd(macdLine, macdSignal, macdHistogram, macdHistogramPrev)}.`
    : 'Momentum data is mixed, so intraday edge is limited until confirmation improves.';

  const histogramGrowing = Number.isFinite(macdHistogram) && Number.isFinite(macdHistogramPrev)
    ? macdHistogram > macdHistogramPrev
    : null;
  const macdTrendScore = histogramGrowing === null ? 50 : histogramGrowing ? 72 : 38;
  const priceVsSma50Score = Number.isFinite(quote.price) && Number.isFinite(sma50) ? (quote.price >= sma50 ? 70 : 35) : 50;
  const rsiMomentumScore = Number.isFinite(rsi14) ? (rsi14 >= 40 && rsi14 <= 60 ? 68 : rsi14 >= 30 && rsi14 <= 70 ? 55 : 35) : 50;
  const bbWidthScore = Number.isFinite(bbWidthPercent) ? (bbWidthPercent >= 6 && bbWidthPercent <= 14 ? 70 : 45) : 50;
  const swingTradeScore = Math.round((macdTrendScore * 0.35) + (priceVsSma50Score * 0.3) + (rsiMomentumScore * 0.2) + (bbWidthScore * 0.15));
  const swingVerdict = swingTradeScore >= 65 ? 'Favorable swing setup' : swingTradeScore < 40 ? 'Weak swing setup' : 'Neutral swing setup';
  const swingEntry = Number.isFinite(bbLower) ? bbLower : (Number.isFinite(sma50) ? sma50 : Number(quote.price) * 0.98);
  const swingTarget = Number.isFinite(bbUpper) ? bbUpper : Number(quote.price) * 1.05;
  const swingReason = `MACD histogram is ${histogramGrowing === null ? 'mixed' : histogramGrowing ? 'expanding' : 'contracting'} with price ${Number.isFinite(sma50) && quote.price >= sma50 ? 'above' : 'below'} the 50-day SMA (${Number.isFinite(sma50) ? roundTo(sma50, 2) : 'Unavailable'}).`;

  const priceVsSma200Score = Number.isFinite(quote.price) && Number.isFinite(sma200) ? (quote.price >= sma200 ? 75 : 30) : 50;
  const epsScore = Number.isFinite(eps) ? (eps > 0 ? 70 : 35) : 50;
  const analystUpsidePercent = Number.isFinite(analystTargetPrice) && Number.isFinite(quote.price) && quote.price > 0
    ? roundTo(((analystTargetPrice - quote.price) / quote.price) * 100, 2)
    : null;
  const upsideScore = !Number.isFinite(analystUpsidePercent)
    ? 50
    : analystUpsidePercent >= 20
      ? 80
      : analystUpsidePercent >= 10
        ? 65
        : analystUpsidePercent >= 0
          ? 50
          : 35;
  const longHoldScore = Math.round((priceVsSma200Score * 0.35) + (valuationScore * 0.25) + (epsScore * 0.2) + (upsideScore * 0.2));
  const longVerdict = longHoldScore >= 70 ? 'Strong long-term hold' : longHoldScore < 40 ? 'Risky at current valuation' : 'Moderate long-term hold';

  const peAssessment = Number.isFinite(peRatio)
    ? (peRatio < 15 ? 'Value-leaning valuation' : peRatio <= 25 ? 'Reasonable valuation' : peRatio <= 40 ? 'Premium valuation' : 'Expensive valuation')
    : 'P/E unavailable';
  const marketCapStability = Number.isFinite(marketCap)
    ? (marketCap >= 200_000_000_000 ? 'Large-cap stability profile' : marketCap >= 10_000_000_000 ? 'Mid/Large-cap profile' : 'Smaller-cap volatility profile')
    : 'Market cap unavailable';

  const indicatorRows = [
    {
      label: 'RSI (14)',
      value: Number.isFinite(rsi14) ? roundTo(rsi14, 2) : null,
      signal: signalFromRsi(rsi14),
      tone: rsiScore >= 70 ? 'bullish' : rsiScore <= 35 ? 'bearish' : 'neutral'
    },
    {
      label: 'MACD',
      value: Number.isFinite(macdLine) ? roundTo(macdLine, 2) : null,
      signal: signalFromMacd(macdLine, macdSignal, macdHistogram, macdHistogramPrev),
      tone: macdScore >= 70 ? 'bullish' : macdScore <= 35 ? 'bearish' : 'neutral'
    },
    {
      label: 'SMA 50',
      value: Number.isFinite(sma50) ? roundTo(sma50, 2) : null,
      signal: signalFromPriceVsSma(quote.price, sma50),
      tone: Number.isFinite(quote.price) && Number.isFinite(sma50) ? (quote.price >= sma50 ? 'bullish' : 'bearish') : 'neutral'
    },
    {
      label: 'SMA 200',
      value: Number.isFinite(sma200) ? roundTo(sma200, 2) : null,
      signal: signalFromPriceVsSma(quote.price, sma200),
      tone: Number.isFinite(quote.price) && Number.isFinite(sma200) ? (quote.price >= sma200 ? 'bullish' : 'bearish') : 'neutral'
    },
    {
      label: 'Bollinger Band',
      value: formatBandZone(bbPosition),
      signal: signalFromBbPosition(bbPosition),
      tone: bbScore >= 65 ? 'bullish' : bbScore <= 35 ? 'bearish' : 'neutral'
    },
    {
      label: 'Volume',
      value: Number.isFinite(volumeRatio) ? `${volumeRatio}x avg` : null,
      signal: Number.isFinite(volumeRatio)
        ? (volumeRatio >= 1.2 ? 'Above average' : volumeRatio < 0.8 ? 'Below average' : 'Normal')
        : 'Unavailable',
      tone: Number.isFinite(volumeRatio) ? (volumeRatio >= 1.2 ? 'bullish' : volumeRatio < 0.8 ? 'bearish' : 'neutral') : 'neutral'
    }
  ];

  return {
    ticker: symbol,
    companyName,
    quote: {
      currentPrice: quote.price,
      dailyChange: quote.dailyChange,
      dailyChangePercent: quote.changePercent,
      volume: quote.volume,
      previousClose: quote.previousClose,
      latestTradingDay: quote.latestTradingDay
    },
    overview: {
      marketCap,
      sector,
      peRatio,
      eps,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
      analystTargetPrice,
      averageVolume
    },
    technicals: {
      rsi14,
      macdLine,
      macdSignal,
      macdHistogram,
      macdHistogramPrevious: macdHistogramPrev,
      sma50,
      sma200,
      bbLower,
      bbMiddle,
      bbUpper,
      bbWidthPercent,
      volumeRatio
    },
    scores: {
      rsiScore,
      macdScore,
      smaScore,
      bbScore,
      valuationScore,
      overallScore,
      overallLabel: compositeLabel
    },
    styles: {
      dayTrade: {
        score: dayTradeScore,
        verdict: dayTradeVerdict,
        reason: dayTradeReason,
        riskLevel: riskFromScore(dayTradeScore)
      },
      swingTrade: {
        score: swingTradeScore,
        verdict: swingVerdict,
        reason: swingReason,
        entrySuggestion: Number.isFinite(swingEntry) ? roundTo(swingEntry, 2) : null,
        targetSuggestion: Number.isFinite(swingTarget) ? roundTo(swingTarget, 2) : null,
        riskLevel: riskFromScore(swingTradeScore)
      },
      longHold: {
        score: longHoldScore,
        verdict: longVerdict,
        reason: `Analyst target implies ${Number.isFinite(analystUpsidePercent) ? `${analystUpsidePercent}%` : 'Unavailable'} upside with ${peAssessment.toLowerCase()}.`,
        analystUpsidePercent,
        riskLevel: riskFromScore(longHoldScore),
        fundamentalHealth: `${peAssessment}. ${marketCapStability}.`
      }
    },
    indicatorRows,
    rangePositionPercent: Number.isFinite(quote.price) && Number.isFinite(fiftyTwoWeekLow) && Number.isFinite(fiftyTwoWeekHigh) && fiftyTwoWeekHigh > fiftyTwoWeekLow
      ? roundTo(((quote.price - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)) * 100, 2)
      : null,
    source: {
      provider: 'Alpha Vantage',
      quoteSource: quote.source,
      limitedEndpoints,
      endpoints: [
        'GLOBAL_QUOTE',
        'RSI',
        'MACD',
        'SMA(50)',
        'SMA(200)',
        'BBANDS',
        'OVERVIEW'
      ],
      lastUpdated: new Date().toISOString()
    }
  };
}

module.exports = {
  analyzeStockResearch
};
