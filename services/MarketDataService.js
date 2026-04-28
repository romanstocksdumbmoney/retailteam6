const YAHOO_REQUEST_HEADERS = Object.freeze({
  accept: 'application/json, text/plain, */*',
  'user-agent': 'Mozilla/5.0 (DumbDollars MarketDataService)'
});

const NEWS_REQUEST_HEADERS = Object.freeze({
  accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  'user-agent': 'Mozilla/5.0 (DumbDollars MarketDataService)'
});

const LOOKBACK_DAYS_FOR_TREND = 260;
const RSI_PERIOD = 14;
const RECENT_WINDOW = 20;
const SUPPORT_RESISTANCE_WINDOW = 30;

class MarketDataServiceError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'MarketDataServiceError';
    this.code = code;
    this.status = status;
  }
}

function normalizeTicker(ticker) {
  return String(ticker || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, '')
    .replace(/\./g, '-');
}

function hasConfiguredMarketDataApiKey() {
  const candidateKeys = [
    process.env.MARKET_DATA_API_KEY,
    process.env.ALPHAVANTAGE_API_KEY,
    process.env.FMP_API_KEY,
    process.env.UNUSUAL_WHALES_API_KEY
  ];
  return candidateKeys.some((value) => String(value || '').trim());
}

async function fetchJson(url, { timeoutMs = 9000, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (_error) {
    throw new MarketDataServiceError(
      'market_data_provider_unreachable',
      'Could not reach the market data provider. Please try again.',
      503
    );
  }

  if (!response.ok) {
    throw new MarketDataServiceError(
      'market_data_provider_error',
      `Market data provider request failed (${response.status}).`,
      503
    );
  }

  try {
    return await response.json();
  } catch (_error) {
    throw new MarketDataServiceError(
      'market_data_invalid_payload',
      'Market data provider returned an invalid response.',
      502
    );
  }
}

async function fetchText(url, { timeoutMs = 9000, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (_error) {
    throw new MarketDataServiceError(
      'market_data_provider_unreachable',
      'Could not reach the market data provider. Please try again.',
      503
    );
  }

  if (!response.ok) {
    throw new MarketDataServiceError(
      'market_data_provider_error',
      `Market data provider request failed (${response.status}).`,
      503
    );
  }

  return response.text();
}

function parseRawNumber(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'raw')) {
    const fromRaw = Number(value.raw);
    return Number.isFinite(fromRaw) ? fromRaw : null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundTo(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number(numeric.toFixed(digits));
}

function average(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) {
    return null;
  }
  const sum = filtered.reduce((acc, value) => acc + value, 0);
  return sum / filtered.length;
}

function stdDev(values) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length < 2) {
    return null;
  }
  const mean = average(filtered);
  if (!Number.isFinite(mean)) {
    return null;
  }
  const variance = filtered.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / (filtered.length - 1);
  return Math.sqrt(variance);
}

function movingAverage(series, length) {
  if (!Array.isArray(series) || series.length < length || length <= 0) {
    return null;
  }
  const window = series.slice(-length);
  const value = average(window);
  return Number.isFinite(value) ? value : null;
}

function computeRsi(closes, period = RSI_PERIOD) {
  if (!Array.isArray(closes) || closes.length <= period) {
    return null;
  }
  let gains = 0;
  let losses = 0;

  for (let index = closes.length - period; index < closes.length; index += 1) {
    const prev = Number(closes[index - 1]);
    const current = Number(closes[index]);
    if (!Number.isFinite(prev) || !Number.isFinite(current)) {
      continue;
    }
    const delta = current - prev;
    if (delta >= 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  if (gains === 0 && losses === 0) {
    return 50;
  }
  if (losses === 0) {
    return 100;
  }
  const rs = gains / losses;
  const rsi = 100 - (100 / (1 + rs));
  return Number.isFinite(rsi) ? roundTo(rsi, 2) : null;
}

function parseRssItems(xmlText) {
  if (!xmlText) {
    return [];
  }
  const items = [];
  const matches = xmlText.match(/<item>([\s\S]*?)<\/item>/gi) || [];
  matches.forEach((itemXml) => {
    const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || itemXml.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const title = titleMatch ? String(titleMatch[1]).trim() : '';
    const url = linkMatch ? String(linkMatch[1]).trim() : '';
    let publishedAt = null;
    if (pubDateMatch) {
      const parsedDate = new Date(String(pubDateMatch[1]).trim());
      if (!Number.isNaN(parsedDate.getTime())) {
        publishedAt = parsedDate.toISOString();
      }
    }
    if (!title || !url) {
      return;
    }
    let source = 'news';
    try {
      source = new URL(url).hostname.replace(/^www\./i, '');
    } catch (_error) {
      source = 'news';
    }
    items.push({
      title,
      url,
      source,
      publishedAt
    });
  });
  return items;
}

function buildNewsSentiment(newsItems) {
  const positiveTokens = ['beat', 'surge', 'rally', 'upgrade', 'growth', 'strong', 'bullish', 'outperform', 'record', 'win'];
  const negativeTokens = ['miss', 'drop', 'fall', 'plunge', 'downgrade', 'warning', 'bearish', 'probe', 'lawsuit', 'weak'];
  let positiveCount = 0;
  let negativeCount = 0;

  newsItems.forEach((item) => {
    const title = String(item?.title || '').toLowerCase();
    const positiveHits = positiveTokens.reduce((acc, token) => acc + (title.includes(token) ? 1 : 0), 0);
    const negativeHits = negativeTokens.reduce((acc, token) => acc + (title.includes(token) ? 1 : 0), 0);
    if (positiveHits > negativeHits) {
      positiveCount += 1;
    } else if (negativeHits > positiveHits) {
      negativeCount += 1;
    }
  });

  return {
    positiveCount,
    negativeCount
  };
}

async function getQuote(ticker) {
  const symbol = normalizeTicker(ticker);
  if (!symbol) {
    throw new MarketDataServiceError('invalid_ticker', 'Enter a valid ticker symbol to analyze.', 400);
  }

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  let payload;
  try {
    payload = await fetchJson(url, {
      timeoutMs: 10000,
      headers: YAHOO_REQUEST_HEADERS
    });
  } catch (error) {
    if (error instanceof MarketDataServiceError && !hasConfiguredMarketDataApiKey()) {
      throw new MarketDataServiceError(
        'market_data_api_not_connected',
        'Market data API is not connected yet. Add a valid API key to enable real analysis.',
        503
      );
    }
    throw error;
  }

  const rows = Array.isArray(payload?.quoteResponse?.result) ? payload.quoteResponse.result : [];
  if (!rows.length) {
    throw new MarketDataServiceError('unknown_ticker', 'Ticker not found in live market listings.', 404);
  }

  const row = rows.find((entry) => String(entry?.symbol || '').toUpperCase() === symbol) || rows[0];
  const price = parseRawNumber(row?.regularMarketPrice);
  if (!Number.isFinite(price)) {
    throw new MarketDataServiceError('unknown_ticker', 'Ticker does not have live quote data right now.', 404);
  }

  return {
    symbol,
    companyName: String(row?.longName || row?.shortName || symbol),
    price,
    currency: String(row?.currency || 'USD'),
    changePercent: parseRawNumber(row?.regularMarketChangePercent),
    volume: parseRawNumber(row?.regularMarketVolume),
    averageVolume: parseRawNumber(row?.averageDailyVolume3Month),
    marketCap: parseRawNumber(row?.marketCap),
    fiftyTwoWeekHigh: parseRawNumber(row?.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: parseRawNumber(row?.fiftyTwoWeekLow),
    marketState: String(row?.marketState || ''),
    exchange: String(row?.fullExchangeName || row?.exchange || ''),
    timestamp: Number.isFinite(Number(row?.regularMarketTime))
      ? new Date(Number(row.regularMarketTime) * 1000).toISOString()
      : new Date().toISOString(),
    source: 'Yahoo Finance quote endpoint (v7/finance/quote)'
  };
}

async function getCompanyProfile(ticker) {
  const symbol = normalizeTicker(ticker);
  const modules = [
    'price',
    'assetProfile',
    'summaryDetail',
    'defaultKeyStatistics',
    'financialData',
    'calendarEvents',
    'recommendationTrend'
  ].join(',');
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}`;

  let payload;
  try {
    payload = await fetchJson(url, {
      timeoutMs: 10000,
      headers: YAHOO_REQUEST_HEADERS
    });
  } catch (_error) {
    return {
      symbol,
      companyName: null,
      sector: null,
      industry: null,
      marketCap: null,
      analystRating: null,
      analystRatingMean: null,
      analystCount: null,
      source: 'Unavailable'
    };
  }

  const summary = payload?.quoteSummary?.result?.[0] || {};
  const priceNode = summary?.price || {};
  const financialData = summary?.financialData || {};
  const defaultStats = summary?.defaultKeyStatistics || {};
  const recommendation = summary?.recommendationTrend || {};
  const earningsDates = summary?.calendarEvents?.earnings?.earningsDate;
  const firstEarningsDate = Array.isArray(earningsDates) ? earningsDates[0] : null;

  return {
    symbol,
    companyName: String(priceNode?.longName || priceNode?.shortName || '').trim() || null,
    sector: String(summary?.assetProfile?.sector || '').trim() || null,
    industry: String(summary?.assetProfile?.industry || '').trim() || null,
    marketCap: parseRawNumber(priceNode?.marketCap) ?? parseRawNumber(defaultStats?.marketCap),
    analystRating: String(financialData?.recommendationKey || '').trim() || null,
    analystRatingMean: parseRawNumber(financialData?.recommendationMean),
    analystCount: parseRawNumber(financialData?.numberOfAnalystOpinions),
    earningsDate: Number.isFinite(parseRawNumber(firstEarningsDate))
      ? new Date(parseRawNumber(firstEarningsDate) * 1000).toISOString()
      : null,
    recommendationTrend: recommendation?.trend || [],
    source: 'Yahoo Finance quoteSummary endpoint (v10/finance/quoteSummary)'
  };
}

async function getTechnicalIndicators(ticker) {
  const symbol = normalizeTicker(ticker);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&includePrePost=false`;
  const payload = await fetchJson(url, {
    timeoutMs: 10000,
    headers: YAHOO_REQUEST_HEADERS
  });

  const chart = payload?.chart?.result?.[0];
  const quote = chart?.indicators?.quote?.[0] || {};
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const opens = Array.isArray(quote?.open) ? quote.open : [];
  const highs = Array.isArray(quote?.high) ? quote.high : [];
  const lows = Array.isArray(quote?.low) ? quote.low : [];
  const volumes = Array.isArray(quote?.volume) ? quote.volume : [];

  const candles = [];
  for (let index = 0; index < closes.length; index += 1) {
    const close = Number(closes[index]);
    const open = Number(opens[index]);
    const high = Number(highs[index]);
    const low = Number(lows[index]);
    const volume = Number(volumes[index]);
    if (!Number.isFinite(close) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low)) {
      continue;
    }
    candles.push({
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : null
    });
  }

  if (!candles.length) {
    throw new MarketDataServiceError(
      'missing_technical_data',
      'Historical market data is unavailable for this ticker.',
      503
    );
  }

  const recentCandles = candles.slice(-LOOKBACK_DAYS_FOR_TREND);
  const closeSeries = recentCandles.map((item) => item.close);
  const volumeSeries = recentCandles.map((item) => item.volume).filter((value) => Number.isFinite(value));

  const sma50 = movingAverage(closeSeries, 50);
  const sma200 = movingAverage(closeSeries, 200);
  const rsi14 = computeRsi(closeSeries, RSI_PERIOD);
  const averageVolume20 = average(volumeSeries.slice(-RECENT_WINDOW));

  const dailyReturns = [];
  for (let index = 1; index < closeSeries.length; index += 1) {
    const prev = closeSeries[index - 1];
    const current = closeSeries[index];
    const change = (current - prev) / Math.max(Math.abs(prev), 0.00001);
    if (Number.isFinite(change)) {
      dailyReturns.push(change);
    }
  }

  const volatilityDailyPct = Number.isFinite(stdDev(dailyReturns))
    ? roundTo(stdDev(dailyReturns) * 100, 2)
    : null;

  const supportResistanceWindow = recentCandles.slice(-SUPPORT_RESISTANCE_WINDOW);
  const supportLevel = supportResistanceWindow.length
    ? Math.min(...supportResistanceWindow.map((item) => item.low))
    : null;
  const resistanceLevel = supportResistanceWindow.length
    ? Math.max(...supportResistanceWindow.map((item) => item.high))
    : null;

  const latest = recentCandles[recentCandles.length - 1];
  const prev = recentCandles[recentCandles.length - 2];
  const gapPercent = prev && Number.isFinite(prev.close)
    ? roundTo(((latest.open - prev.close) / Math.max(Math.abs(prev.close), 0.00001)) * 100, 2)
    : null;

  return {
    symbol,
    latestClose: latest.close,
    latestOpen: latest.open,
    latestVolume: Number.isFinite(latest.volume) ? latest.volume : null,
    sma50: roundTo(sma50, 2),
    sma200: roundTo(sma200, 2),
    rsi14,
    averageVolume20: roundTo(averageVolume20, 0),
    volatilityDailyPct,
    supportLevel: roundTo(supportLevel, 2),
    resistanceLevel: roundTo(resistanceLevel, 2),
    gapPercent,
    source: 'Yahoo Finance chart endpoint (v8/finance/chart)',
    sampleSize: recentCandles.length
  };
}

async function getNews(ticker) {
  const symbol = normalizeTicker(ticker);
  const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;

  let rssText = '';
  try {
    rssText = await fetchText(rssUrl, {
      timeoutMs: 9000,
      headers: NEWS_REQUEST_HEADERS
    });
  } catch (_error) {
    return {
      symbol,
      items: [],
      sentiment: {
        positiveCount: 0,
        negativeCount: 0
      },
      source: 'Unavailable'
    };
  }

  const items = parseRssItems(rssText).slice(0, 8);
  return {
    symbol,
    items,
    sentiment: buildNewsSentiment(items),
    source: 'Yahoo Finance RSS feed'
  };
}

async function getEarnings(ticker) {
  const profile = await getCompanyProfile(ticker);
  return {
    symbol: normalizeTicker(ticker),
    earningsDate: profile.earningsDate || null,
    source: profile.earningsDate
      ? 'Yahoo Finance quoteSummary calendarEvents'
      : 'Unavailable'
  };
}

function computeOutlookFromData({ quote, technical, news, earnings }) {
  let bullish = 0;
  let bearish = 0;
  let risk = 15;
  const strengths = [];
  const risks = [];

  if (Number.isFinite(quote?.price) && Number.isFinite(technical?.sma50)) {
    if (quote.price > technical.sma50) {
      bullish += 18;
      strengths.push('Price is trading above the 50-day moving average.');
    } else {
      bearish += 18;
      risks.push('Price is below the 50-day moving average.');
    }
  } else {
    risks.push('50-day moving average is unavailable.');
  }

  if (Number.isFinite(quote?.price) && Number.isFinite(technical?.sma200)) {
    if (quote.price > technical.sma200) {
      bullish += 12;
      strengths.push('Price is above the 200-day moving average (long-term trend support).');
    } else {
      bearish += 12;
      risks.push('Price is below the 200-day moving average (long-term trend pressure).');
    }
  } else {
    risks.push('200-day moving average is unavailable.');
  }

  if (Number.isFinite(technical?.rsi14)) {
    if (technical.rsi14 < 30) {
      bullish += 10;
      risk += 15;
      strengths.push('RSI is oversold (<30), which can support a bounce setup.');
      risks.push('Oversold momentum can remain volatile before confirmation.');
    } else if (technical.rsi14 > 70) {
      bearish += 12;
      risk += 20;
      risks.push('RSI is overbought (>70), increasing pullback risk.');
    } else if (technical.rsi14 >= 40 && technical.rsi14 <= 60) {
      strengths.push('RSI is in a neutral range (40-60).');
    }
  } else {
    risks.push('RSI is unavailable.');
  }

  if (Number.isFinite(technical?.latestVolume) && Number.isFinite(technical?.averageVolume20) && technical.averageVolume20 > 0) {
    const volumeRatio = technical.latestVolume / technical.averageVolume20;
    if (volumeRatio >= 1.2) {
      if (Number.isFinite(quote?.changePercent) && quote.changePercent >= 0) {
        bullish += 8;
        strengths.push(`Volume is ${roundTo(volumeRatio, 2)}x above average with positive daily move.`);
      } else {
        bearish += 8;
        risks.push(`Volume is ${roundTo(volumeRatio, 2)}x above average with a weak daily move.`);
      }
    } else if (volumeRatio < 0.8) {
      risk += 6;
      risks.push('Current volume is below average, reducing confirmation quality.');
    }
  } else {
    risks.push('Volume trend data is unavailable.');
  }

  if (earnings?.earningsDate) {
    const earningsTs = new Date(earnings.earningsDate).getTime();
    if (Number.isFinite(earningsTs)) {
      const daysAway = Math.ceil((earningsTs - Date.now()) / (24 * 60 * 60 * 1000));
      if (daysAway >= 0 && daysAway <= 7) {
        risk += 22;
        risks.push(`Earnings are within ${daysAway} day(s), which raises volatility risk.`);
      } else if (daysAway > 7 && daysAway <= 14) {
        risk += 12;
        risks.push(`Earnings are in ${daysAway} day(s), adding event risk.`);
      }
    }
  }

  if (Number.isFinite(technical?.gapPercent) && Math.abs(technical.gapPercent) >= 4) {
    risk += 12;
    risks.push(`Recent opening gap is ${technical.gapPercent}% (elevated gap risk).`);
  }

  if (Number.isFinite(technical?.volatilityDailyPct)) {
    if (technical.volatilityDailyPct >= 4) {
      risk += 16;
      risks.push(`Daily volatility is high (${technical.volatilityDailyPct}%).`);
    } else if (technical.volatilityDailyPct >= 2.5) {
      risk += 8;
      risks.push(`Daily volatility is elevated (${technical.volatilityDailyPct}%).`);
    }
  }

  const positiveNews = Number(news?.sentiment?.positiveCount || 0);
  const negativeNews = Number(news?.sentiment?.negativeCount || 0);
  if (positiveNews > negativeNews) {
    bullish += Math.min(12, (positiveNews - negativeNews) * 3);
    strengths.push('Recent headline tone is more positive than negative.');
  } else if (negativeNews > positiveNews) {
    bearish += Math.min(12, (negativeNews - positiveNews) * 3);
    risks.push('Recent headline tone is more negative than positive.');
  } else if (positiveNews === 0 && negativeNews === 0) {
    risks.push('No recent headline sentiment signals were available.');
  }

  bullish = Math.max(0, Math.round(bullish));
  bearish = Math.max(0, Math.round(bearish));
  risk = Math.max(0, Math.min(100, Math.round(risk)));

  const directionalTotal = bullish + bearish;
  const directionalGap = Math.abs(bullish - bearish);
  const confidence = directionalTotal > 0
    ? Math.max(30, Math.min(95, Math.round((directionalGap / directionalTotal) * 100)))
    : 30;

  let bias = 'Neutral';
  if (bullish - bearish >= 8) {
    bias = 'Bullish';
  } else if (bearish - bullish >= 8) {
    bias = 'Bearish';
  }

  let riskLevel = 'Low';
  if (risk >= 70) {
    riskLevel = 'High';
  } else if (risk >= 45) {
    riskLevel = 'Medium';
  }

  let guidanceLabel = 'No Clear Setup';
  if (risk >= 80) {
    guidanceLabel = 'High Risk';
  } else if (bias === 'Bearish' && confidence >= 55) {
    guidanceLabel = 'Avoid for Now';
  } else if (bias === 'Bullish' && confidence >= 70 && risk < 55) {
    guidanceLabel = 'Strong Watch';
  } else if (bias === 'Bullish') {
    guidanceLabel = 'Watch';
  } else if (bias === 'Neutral' && risk >= 65) {
    guidanceLabel = 'High Risk';
  }

  return {
    bias,
    confidence,
    risk,
    riskLevel,
    bullishScore: bullish,
    bearishScore: bearish,
    guidanceLabel,
    strengths: strengths.slice(0, 4),
    risks: risks.slice(0, 5)
  };
}

function buildTradePlan({ quote, technical, outlook }) {
  const currentPrice = Number(quote?.price);
  const support = Number(technical?.supportLevel);
  const resistance = Number(technical?.resistanceLevel);

  if (!Number.isFinite(currentPrice)) {
    return {
      entryZone: null,
      stopLoss: null,
      target: null,
      invalidation: null,
      waitRecommendation: 'Not enough real-time pricing data to define a setup yet.'
    };
  }

  if (outlook.bias === 'Bearish') {
    return {
      entryZone: null,
      stopLoss: null,
      target: null,
      invalidation: 'Bearish pressure weakens if price reclaims and holds above the 50-day moving average.',
      waitRecommendation: 'Avoid for now unless a fresh bullish reversal signal appears with strong volume.'
    };
  }

  if (outlook.bias === 'Neutral') {
    return {
      entryZone: null,
      stopLoss: null,
      target: null,
      invalidation: 'Current setup is neutral; direction is not confirmed.',
      waitRecommendation: 'Wait for confirmation above resistance or a clean support bounce before planning a trade.'
    };
  }

  const entryLower = Number.isFinite(support) ? Math.max(support, currentPrice * 0.985) : currentPrice * 0.99;
  const entryUpper = currentPrice * 1.01;
  const stopLoss = Number.isFinite(support) ? support * 0.985 : currentPrice * 0.95;
  const target = Number.isFinite(resistance) ? resistance * 1.015 : currentPrice * 1.06;
  const invalidation = Number.isFinite(support)
    ? `Bullish setup is invalid if price closes below ${roundTo(support, 2)}.`
    : 'Bullish setup is invalid if price loses short-term support and closes below the recent base.';

  return {
    entryZone: `${roundTo(entryLower, 2)} - ${roundTo(entryUpper, 2)}`,
    stopLoss: roundTo(stopLoss, 2),
    target: roundTo(target, 2),
    invalidation,
    waitRecommendation: outlook.riskLevel === 'High'
      ? 'Setup can be watched, but risk is elevated. Consider waiting for lower volatility.'
      : 'This may be worth watching if price holds support and volume confirms.'
  };
}

function valueOrUnavailable(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

async function analyzeStockOutlook(ticker) {
  const symbol = normalizeTicker(ticker);
  if (!symbol) {
    throw new MarketDataServiceError('invalid_ticker', 'Enter a ticker symbol (example: AAPL).', 400);
  }
  if (!hasConfiguredMarketDataApiKey()) {
    throw new MarketDataServiceError(
      'market_data_api_not_connected',
      'Market data API is not connected yet. Add a valid API key to enable real analysis.',
      503
    );
  }

  const quote = await getQuote(symbol);

  const [profile, technical, news, earnings] = await Promise.all([
    getCompanyProfile(symbol),
    getTechnicalIndicators(symbol),
    getNews(symbol),
    getEarnings(symbol)
  ]);

  const outlook = computeOutlookFromData({
    quote,
    technical,
    news,
    earnings
  });

  const tradePlan = buildTradePlan({
    quote,
    technical,
    outlook
  });

  const keyLevelsToWatch = [
    Number.isFinite(technical?.supportLevel) ? `Support: ${technical.supportLevel}` : null,
    Number.isFinite(technical?.resistanceLevel) ? `Resistance: ${technical.resistanceLevel}` : null,
    Number.isFinite(technical?.sma50) ? `50-day MA: ${technical.sma50}` : null,
    Number.isFinite(technical?.sma200) ? `200-day MA: ${technical.sma200}` : null
  ].filter(Boolean);

  return {
    ticker: symbol,
    companyName: profile.companyName || quote.companyName || symbol,
    stock: {
      currentPrice: valueOrUnavailable(quote.price),
      dailyChangePercent: valueOrUnavailable(quote.changePercent),
      volume: valueOrUnavailable(technical.latestVolume ?? quote.volume),
      marketCap: valueOrUnavailable(profile.marketCap ?? quote.marketCap),
      fiftyTwoWeekHigh: valueOrUnavailable(quote.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: valueOrUnavailable(quote.fiftyTwoWeekLow)
    },
    technicals: {
      movingAverage50Day: valueOrUnavailable(technical.sma50),
      movingAverage200Day: valueOrUnavailable(technical.sma200),
      rsi14: valueOrUnavailable(technical.rsi14),
      averageVolume20Day: valueOrUnavailable(technical.averageVolume20),
      volatilityDailyPercent: valueOrUnavailable(technical.volatilityDailyPct),
      supportLevel: valueOrUnavailable(technical.supportLevel),
      resistanceLevel: valueOrUnavailable(technical.resistanceLevel)
    },
    fundamentals: {
      earningsDate: earnings.earningsDate || profile.earningsDate || null,
      analystRating: profile.analystRating || null,
      analystRatingMean: valueOrUnavailable(profile.analystRatingMean),
      analystCount: valueOrUnavailable(profile.analystCount),
      sector: profile.sector || null,
      industry: profile.industry || null
    },
    news: news.items,
    outlook: {
      bias: outlook.bias,
      confidenceScore: outlook.confidence,
      riskLevel: outlook.riskLevel,
      riskScore: outlook.risk,
      bullishScore: outlook.bullishScore,
      bearishScore: outlook.bearishScore,
      guidanceLabel: outlook.guidanceLabel,
      timeframe: 'Near-term swing (days to weeks)'
    },
    summary: {
      plainEnglish: outlook.bias === 'Bullish'
        ? 'Setup looks bullish if support holds, but this is not a guaranteed move and risk controls still matter.'
        : outlook.bias === 'Bearish'
          ? 'Current setup leans bearish, so avoiding aggressive entries may be safer until trend conditions improve.'
          : 'Setup is mixed and does not have enough confirmation yet.',
      strengths: outlook.strengths,
      risks: outlook.risks,
      keyLevelsToWatch
    },
    tradePlan,
    dataSources: [
      quote.source,
      technical.source,
      profile.source,
      news.source,
      earnings.source
    ].filter((value) => value && value !== 'Unavailable'),
    dataProvider: 'Yahoo Finance',
    lastUpdated: quote.timestamp || new Date().toISOString(),
    marketDataMayBeDelayed: true
  };
}

module.exports = {
  MarketDataServiceError,
  normalizeTicker,
  getQuote,
  getCompanyProfile,
  getTechnicalIndicators,
  getNews,
  getEarnings,
  analyzeStockOutlook
};
