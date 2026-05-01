const AV_KEY = 'XK10T6I58YPTGMWE';
const FINNHUB_TOKEN = 'cqnbm59r01qhse25tlu0cqnbm59r01qhse25tlug';
const POLYGON_KEY = 'demo';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

async function fetchFromAllSources(ticker) {
  ticker = ticker.toUpperCase().trim();
  console.log('Fetching', ticker, 'from all sources...');

  const results = await Promise.allSettled([
    fetchYahooFinance(ticker),
    fetchAlphaVantage(ticker),
    fetchFinnhub(ticker),
    fetchPolygon(ticker),
    fetchStockAnalysis(ticker)
  ]);

  results.forEach((result, index) => {
    const names = ['Yahoo', 'AlphaVantage', 'Finnhub', 'Polygon', 'StockAnalysis'];
    if (result.status === 'fulfilled') {
      console.log(`✅ ${names[index]}:`, result.value);
      return;
    }
    console.warn(`❌ ${names[index]} failed:`, result.reason?.message || result.reason);
  });

  const [yahoo, av, finnhub, polygon, stockanalysis] = results.map((result) => (
    result.status === 'fulfilled' ? result.value : null
  ));

  const hasSomeData = [yahoo, av, finnhub, polygon, stockanalysis].some((entry) => entry?.price);
  if (!hasSomeData) {
    throw new Error(
      `No data found for "${ticker}". Check the ticker symbol is correct (e.g. AAPL, TSLA, MU, NVDA).`
    );
  }

  return mergeStockData(ticker, { yahoo, av, finnhub, polygon, stockanalysis });
}

async function fetchYahooFinance(ticker) {
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`
  ];

  for (const url of urls) {
    try {
      const proxied = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const res = await fetchWithTimeout(proxied, {}, 15000);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const wrapper = await res.json();
      const data = JSON.parse(wrapper.contents || '{}');
      const result = data?.chart?.result?.[0];
      if (!result) {
        continue;
      }

      const meta = result.meta || {};
      const quotes = result.indicators?.quote?.[0] || {};
      const closes = (quotes.close || []).filter(Boolean).map(Number);
      const highs = (quotes.high || []).filter(Boolean).map(Number);
      const lows = (quotes.low || []).filter(Boolean).map(Number);
      const vols = (quotes.volume || []).filter(Boolean).map(Number);
      if (!closes.length) {
        continue;
      }

      const price = Number(meta.regularMarketPrice || closes.at(-1));
      const prevClose = Number(meta.previousClose || closes.at(-2) || closes.at(-1));
      const change = price - prevClose;
      const changePercent = prevClose ? +((change / prevClose) * 100).toFixed(2) : 0;

      return {
        source: 'Yahoo Finance',
        price: +price.toFixed(2),
        prevClose: +prevClose.toFixed(2),
        change: +change.toFixed(2),
        changePercent,
        volume: Number(meta.regularMarketVolume || vols.at(-1) || 0),
        avgVolume: vols.length
          ? vols.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, vols.length)
          : 0,
        week52High: +(Math.max(...closes.slice(-252))).toFixed(2),
        week52Low: +(Math.min(...closes.slice(-252))).toFixed(2),
        sma20: closes.length >= 20 ? +(closes.slice(-20).reduce((a, b) => a + b, 0) / 20).toFixed(2) : null,
        sma50: closes.length >= 50 ? +(closes.slice(-50).reduce((a, b) => a + b, 0) / 50).toFixed(2) : null,
        sma200: closes.length >= 200 ? +(closes.slice(-200).reduce((a, b) => a + b, 0) / 200).toFixed(2) : null,
        rsi: +calculateRSI(closes, 14).toFixed(1),
        companyName: meta.longName || meta.shortName || ticker,
        marketCap: toNumber(meta.marketCap),
        rawCloses: closes,
        rawHighs: highs,
        rawLows: lows
      };
    } catch (error) {
      console.warn('Yahoo URL failed:', url, error?.message || error);
    }
  }
  throw new Error('Yahoo Finance unavailable');
}

async function fetchAlphaVantage(ticker) {
  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const quoteRes = await fetchWithTimeout(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${AV_KEY}`,
    {},
    15000
  );
  const quoteData = await quoteRes.json();
  if (quoteData.Information || quoteData.Note) {
    throw new Error('Alpha Vantage rate limited');
  }
  const q = quoteData['Global Quote'];
  if (!q || !q['05. price']) {
    throw new Error('No AV quote data');
  }

  const price = parseFloat(q['05. price']);
  const prevClose = parseFloat(q['08. previous close']);
  const change = parseFloat(q['09. change']);
  const changePercent = parseFloat(String(q['10. change percent'] || '').replace('%', '')) || 0;
  const volume = parseInt(q['06. volume'], 10) || 0;

  await delay(1200);
  let overview = {};
  try {
    const ovRes = await fetchWithTimeout(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${AV_KEY}`,
      {},
      15000
    );
    overview = await ovRes.json();
    await delay(1200);
  } catch (_error) {
    overview = {};
  }

  let rsi = null;
  try {
    const rsiRes = await fetchWithTimeout(
      `https://www.alphavantage.co/query?function=RSI&symbol=${ticker}&interval=daily&time_period=14&series_type=close&apikey=${AV_KEY}`,
      {},
      15000
    );
    const rsiData = await rsiRes.json();
    const values = rsiData['Technical Analysis: RSI'];
    if (values) {
      rsi = parseFloat(Object.values(values)[0].RSI);
    }
    await delay(1200);
  } catch (_error) {
    rsi = null;
  }

  let macd = null;
  let macdSignal = null;
  let macdHist = null;
  try {
    const macdRes = await fetchWithTimeout(
      `https://www.alphavantage.co/query?function=MACD&symbol=${ticker}&interval=daily&series_type=close&apikey=${AV_KEY}`,
      {},
      15000
    );
    const macdData = await macdRes.json();
    const values = macdData['Technical Analysis: MACD'];
    if (values) {
      const latest = Object.values(values)[0];
      macd = parseFloat(latest.MACD);
      macdSignal = parseFloat(latest.MACD_Signal);
      macdHist = parseFloat(latest.MACD_Hist);
    }
  } catch (_error) {
    macd = null;
  }

  return {
    source: 'Alpha Vantage',
    price,
    prevClose,
    change,
    changePercent,
    volume,
    week52High: parseFloat(overview['52WeekHigh']) || null,
    week52Low: parseFloat(overview['52WeekLow']) || null,
    rsi,
    macd,
    macdSignal,
    macdHist,
    pe: parseFloat(overview.PERatio) || null,
    eps: parseFloat(overview.EPS) || null,
    analystTarget: parseFloat(overview.AnalystTargetPrice) || null,
    sector: overview.Sector || null,
    industry: overview.Industry || null,
    companyName: overview.Name || ticker,
    marketCap: toNumber(overview.MarketCapitalization),
    beta: parseFloat(overview.Beta) || null,
    dividendYield: parseFloat(overview.DividendYield) || null,
    pegRatio: parseFloat(overview.PEGRatio) || null,
    priceToBook: parseFloat(overview.PriceToBookRatio) || null,
    revenueGrowth: overview.QuarterlyRevenueGrowthYOY || null,
    earningsGrowth: overview.QuarterlyEarningsGrowthYOY || null,
    description: overview.Description || null
  };
}

async function fetchFinnhub(ticker) {
  const base = 'https://finnhub.io/api/v1';
  const token = FINNHUB_TOKEN;

  const [quoteRes, profileRes, recommendRes, metricsRes] = await Promise.allSettled([
    fetchWithTimeout(`${base}/quote?symbol=${ticker}&token=${token}`, {}, 12000),
    fetchWithTimeout(`${base}/stock/profile2?symbol=${ticker}&token=${token}`, {}, 12000),
    fetchWithTimeout(`${base}/stock/recommendation?symbol=${ticker}&token=${token}`, {}, 12000),
    fetchWithTimeout(`${base}/stock/metric?symbol=${ticker}&metric=all&token=${token}`, {}, 12000)
  ]);

  const quote = quoteRes.status === 'fulfilled' ? await quoteRes.value.json() : null;
  const profile = profileRes.status === 'fulfilled' ? await profileRes.value.json() : null;
  const recs = recommendRes.status === 'fulfilled' ? await recommendRes.value.json() : null;
  const metrics = metricsRes.status === 'fulfilled' ? await metricsRes.value.json() : null;

  if (!quote || !quote.c) {
    throw new Error('Finnhub no quote data');
  }

  let analystRec = null;
  if (Array.isArray(recs) && recs.length) {
    const latest = recs[0];
    analystRec = {
      strongBuy: latest.strongBuy || 0,
      buy: latest.buy || 0,
      hold: latest.hold || 0,
      sell: latest.sell || 0,
      strongSell: latest.strongSell || 0,
      period: latest.period || ''
    };
  }

  const metric = metrics?.metric || {};
  return {
    source: 'Finnhub',
    price: toNumber(quote.c),
    prevClose: toNumber(quote.pc),
    change: toNumber(quote.c - quote.pc),
    changePercent: quote.pc ? +(((quote.c - quote.pc) / quote.pc) * 100).toFixed(2) : 0,
    dayHigh: toNumber(quote.h),
    dayLow: toNumber(quote.l),
    companyName: profile?.name || ticker,
    sector: profile?.finnhubIndustry || null,
    country: profile?.country || null,
    exchange: profile?.exchange || null,
    ipo: profile?.ipo || null,
    website: profile?.weburl || null,
    logo: profile?.logo || null,
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

async function fetchPolygon(ticker) {
  try {
    const [tickerRes, prevRes] = await Promise.allSettled([
      fetchWithTimeout(`https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${POLYGON_KEY}`, {}, 12000),
      fetchWithTimeout(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_KEY}`, {}, 12000)
    ]);

    const tickerData = tickerRes.status === 'fulfilled' ? await tickerRes.value.json() : null;
    const prevData = prevRes.status === 'fulfilled' ? await prevRes.value.json() : null;
    const details = tickerData?.results || {};
    const prev = prevData?.results?.[0] || {};
    if (!prev.c) {
      throw new Error('Polygon no price data');
    }

    return {
      source: 'Polygon.io',
      price: toNumber(prev.c),
      prevClose: toNumber(prev.o),
      dayHigh: toNumber(prev.h),
      dayLow: toNumber(prev.l),
      volume: toNumber(prev.v),
      vwap: toNumber(prev.vw),
      companyName: details.name || ticker,
      description: details.description || null,
      sector: details.sic_description || null,
      employees: details.total_employees || null,
      website: details.homepage_url || null,
      listDate: details.list_date || null,
      locale: details.locale || null,
      currency: details.currency_name || 'USD'
    };
  } catch (error) {
    throw new Error(`Polygon unavailable: ${error?.message || error}`);
  }
}

async function fetchStockAnalysis(ticker) {
  try {
    const url = `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/`;
    const proxied = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetchWithTimeout(proxied, {}, 15000);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const wrapper = await res.json();
    const html = wrapper.contents;
    if (!html) {
      throw new Error('No content from StockAnalysis');
    }
    const revenueMatch = html.match(/Revenue[^$]*\$([0-9.]+[BMT])/i);
    const forwardPeMatch = html.match(/Forward P\/E[^0-9]*([0-9.]+)/i);
    const analystCountMatch = html.match(/([0-9]+)\s*analyst/i);

    return {
      source: 'StockAnalysis',
      forwardPE: forwardPeMatch ? parseFloat(forwardPeMatch[1]) : null,
      revenue: revenueMatch ? revenueMatch[1] : null,
      analystCount: analystCountMatch ? parseInt(analystCountMatch[1], 10) : null
    };
  } catch (error) {
    throw new Error(`StockAnalysis scrape failed: ${error?.message || error}`);
  }
}

function mergeStockData(ticker, { yahoo, av, finnhub, polygon, stockanalysis }) {
  const price = finnhub?.price || yahoo?.price || av?.price || polygon?.price;
  const prevClose = finnhub?.prevClose || yahoo?.prevClose || av?.prevClose || polygon?.prevClose;
  const change = (price && prevClose)
    ? +((price - prevClose).toFixed(2))
    : (av?.change || 0);
  const changePct = prevClose ? +(((change / prevClose) * 100).toFixed(2)) : 0;

  return {
    ticker,
    price,
    prevClose,
    change,
    changePercent: `${changePct}%`,
    changeFloat: changePct,
    dayHigh: finnhub?.dayHigh || polygon?.dayHigh || null,
    dayLow: finnhub?.dayLow || polygon?.dayLow || null,
    volume: yahoo?.volume || finnhub?.volume || av?.volume || polygon?.volume || 0,
    avgVolume: yahoo?.avgVolume || null,
    vwap: polygon?.vwap || null,
    companyName: av?.companyName || finnhub?.companyName || yahoo?.companyName || polygon?.companyName || ticker,
    sector: av?.sector || finnhub?.sector || polygon?.sector || 'N/A',
    industry: av?.industry || null,
    description: av?.description || polygon?.description || null,
    website: finnhub?.website || polygon?.website || null,
    employees: polygon?.employees || null,
    country: finnhub?.country || null,
    exchange: finnhub?.exchange || null,
    ipo: finnhub?.ipo || polygon?.listDate || null,
    week52High: av?.week52High || finnhub?.week52High || yahoo?.week52High || null,
    week52Low: av?.week52Low || finnhub?.week52Low || yahoo?.week52Low || null,
    sma20: yahoo?.sma20 || null,
    sma50: yahoo?.sma50 || null,
    sma200: yahoo?.sma200 || null,
    rsi: av?.rsi || yahoo?.rsi || null,
    macd: av?.macd || null,
    macdSignal: av?.macdSignal || null,
    macdHist: av?.macdHist || null,
    pe: av?.pe || finnhub?.pe || null,
    forwardPE: stockanalysis?.forwardPE || null,
    eps: av?.eps || finnhub?.eps || null,
    beta: av?.beta || finnhub?.beta || null,
    marketCap: av?.marketCap || yahoo?.marketCap || null,
    dividendYield: av?.dividendYield || null,
    pegRatio: av?.pegRatio || null,
    priceToBook: av?.priceToBook || null,
    roa: finnhub?.roa || null,
    roe: finnhub?.roe || null,
    grossMargin: finnhub?.grossMargin || null,
    netMargin: finnhub?.netMargin || null,
    revenueGrowth: av?.revenueGrowth || finnhub?.revenueGrowth || null,
    earningsGrowth: av?.earningsGrowth || null,
    debtToEquity: finnhub?.debtToEquity || null,
    currentRatio: finnhub?.currentRatio || null,
    analystTarget: av?.analystTarget || null,
    analystRec: finnhub?.analystRec || null,
    analystCount: stockanalysis?.analystCount || null,
    rawCloses: yahoo?.rawCloses || [],
    sources: [
      yahoo ? 'Yahoo Finance' : null,
      av ? 'Alpha Vantage' : null,
      finnhub ? 'Finnhub' : null,
      polygon ? 'Polygon.io' : null,
      stockanalysis ? 'StockAnalysis' : null
    ].filter(Boolean),
    dataSource: ([
      yahoo ? 'Yahoo Finance' : null,
      av ? 'Alpha Vantage' : null,
      finnhub ? 'Finnhub' : null,
      polygon ? 'Polygon.io' : null,
      stockanalysis ? 'StockAnalysis' : null
    ].filter(Boolean).join(' + '))
  };
}

function calculateScores(data) {
  let rsiScore = 50;
  const rsi = data.rsi || 50;
  if (rsi < 30) rsiScore = 85;
  else if (rsi < 45) rsiScore = 70;
  else if (rsi < 55) rsiScore = 50;
  else if (rsi < 70) rsiScore = 35;
  else rsiScore = 20;

  let trendScore = 50;
  if (data.sma50 && data.price) {
    const pctAboveSma = ((data.price - data.sma50) / data.sma50) * 100;
    if (pctAboveSma > 10) trendScore = 80;
    else if (pctAboveSma > 3) trendScore = 65;
    else if (pctAboveSma > -3) trendScore = 50;
    else if (pctAboveSma > -10) trendScore = 35;
    else trendScore = 20;
  }

  let valScore = 50;
  if (data.pe) {
    if (data.pe < 15) valScore = 80;
    else if (data.pe < 25) valScore = 65;
    else if (data.pe < 35) valScore = 45;
    else if (data.pe < 50) valScore = 30;
    else valScore = 15;
  }

  let momentumScore = 50;
  if (data.change && data.prevClose) {
    const pctChange = (data.change / data.prevClose) * 100;
    if (pctChange > 3) momentumScore = 75;
    else if (pctChange > 1) momentumScore = 62;
    else if (pctChange > -1) momentumScore = 50;
    else if (pctChange > -3) momentumScore = 38;
    else momentumScore = 25;
  }

  let rangeScore = 50;
  if (data.week52High && data.week52Low && data.price) {
    const range = data.week52High - data.week52Low;
    if (range > 0) {
      const position = (data.price - data.week52Low) / range;
      if (position < 0.25) rangeScore = 80;
      else if (position < 0.45) rangeScore = 65;
      else if (position < 0.65) rangeScore = 50;
      else if (position < 0.80) rangeScore = 38;
      else rangeScore = 25;
    }
  }

  const overall = Math.round(
    (rsiScore * 0.25)
    + (trendScore * 0.25)
    + (momentumScore * 0.20)
    + (rangeScore * 0.15)
    + (valScore * 0.15)
  );
  const dayTrade = Math.round((momentumScore * 0.45) + (rsiScore * 0.35) + (trendScore * 0.20));
  const swingTrade = Math.round((trendScore * 0.40) + (rsiScore * 0.35) + (momentumScore * 0.25));
  const longHold = Math.round((valScore * 0.40) + (trendScore * 0.35) + (rangeScore * 0.25));

  return {
    overall,
    dayTrade,
    swingTrade,
    longHold,
    rsiScore,
    trendScore,
    momentumScore,
    rangeScore,
    valScore
  };
}

function getMACDExplanation(macd, signal, hist) {
  if (macd === null || macd === undefined) return 'MACD data unavailable.';
  const cross = macd > signal ? 'above' : 'below';
  const histDir = hist > 0 ? 'positive' : 'negative';
  return `MACD line (${Number(macd).toFixed(3)}) is ${cross} the signal line (${Number(signal || 0).toFixed(3)}) — a ${macd > signal ? 'bullish' : 'bearish'} signal. The histogram is ${histDir} (${Number(hist || 0).toFixed(3)}), meaning momentum is ${Math.abs(Number(hist || 0)) > 0.1 ? 'accelerating' : 'weakening'} ${macd > signal ? 'upward' : 'downward'}. MACD crossovers are one of the most widely watched technical signals.`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value || 'N/A';
  }
}

function formatMoney(value, digits = 2) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return 'N/A';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function getScoreColor(score) {
  if (score >= 75) return '#00c853';
  if (score >= 55) return '#2979ff';
  if (score >= 40) return '#ff9100';
  return '#ff1744';
}

function renderScore(score) {
  const numericScore = Math.max(0, Math.min(100, Number(score || 0)));
  const el = document.getElementById('score-number');
  const labelEl = document.getElementById('score-label');
  const fillEl = document.getElementById('score-bar-fill');

  let color = '#ff9100';
  let label = 'NEUTRAL';
  if (numericScore >= 75) {
    color = '#00c853';
    label = 'STRONG BUY';
  } else if (numericScore >= 55) {
    color = '#2979ff';
    label = 'GOOD';
  } else if (numericScore < 40) {
    color = '#ff1744';
    label = 'WEAK';
  }

  if (el) {
    el.textContent = String(Math.round(numericScore));
    el.style.color = color;
  }
  if (labelEl) {
    labelEl.textContent = label;
    labelEl.style.color = color;
  }
  if (fillEl) {
    fillEl.style.background = color;
    fillEl.style.width = `${numericScore}%`;
  }
}

function getRSIExplanation(rsi) {
  if (!rsi && rsi !== 0) return 'RSI data unavailable.';
  const r = parseFloat(rsi);
  if (r < 25) return `RSI is ${r.toFixed(1)} — extremely oversold territory. This means the stock has been heavily sold off and statistically tends to bounce. Strong potential buy signal but confirm with other indicators.`;
  if (r < 30) return `RSI is ${r.toFixed(1)} — oversold. Sellers have dominated recently and the stock may be due for a reversal upward. Often seen as a buying opportunity by technical traders.`;
  if (r < 40) return `RSI is ${r.toFixed(1)} — slightly oversold, recovering. Selling pressure is easing. Watch for a cross above 40 as a bullish signal.`;
  if (r < 50) return `RSI is ${r.toFixed(1)} — below neutral (50). Slight bearish bias but no extreme reading. Market is indecisive.`;
  if (r < 55) return `RSI is ${r.toFixed(1)} — neutral. Neither overbought nor oversold. No strong directional signal from RSI alone.`;
  if (r < 65) return `RSI is ${r.toFixed(1)} — slightly elevated but healthy. Buyers are in control without the stock being overextended. Often seen during steady uptrends.`;
  if (r < 70) return `RSI is ${r.toFixed(1)} — approaching overbought. Strong buying momentum but getting extended. New buyers take on more risk at this level.`;
  if (r < 80) return `RSI is ${r.toFixed(1)} — overbought. Stock has run up quickly and may be due for a pullback or consolidation. Risky entry point for new positions.`;
  return `RSI is ${r.toFixed(1)} — extremely overbought. Historically, readings this high often precede short-term pullbacks. Not a good time to chase this stock.`;
}

function getTrendExplanation(price, sma50, sma20) {
  if (!price) return 'Price data unavailable.';
  let explanation = '';
  if (sma50) {
    const pctVsSma50 = ((price - sma50) / sma50) * 100;
    const direction = price > sma50 ? 'above' : 'below';
    explanation += `Price (${formatMoney(price)}) is ${Math.abs(pctVsSma50).toFixed(1)}% ${direction} the 50-day moving average (${formatMoney(sma50)}). `;
    if (price > sma50 * 1.10) {
      explanation += 'Being more than 10% above the 50-day SMA means the stock is extended — it may pull back to the average before continuing higher.';
    } else if (price > sma50) {
      explanation += 'Trading above the 50-day SMA is a bullish sign — it means the medium-term trend is upward and buyers are in control.';
    } else if (price > sma50 * 0.95) {
      explanation += 'Just below the 50-day SMA. A move back above would be a bullish breakout signal. Currently in a neutral zone.';
    } else {
      explanation += 'Trading below the 50-day SMA indicates a bearish medium-term trend. The average acts as overhead resistance.';
    }
  }
  if (sma20 && sma50) {
    explanation += ` The 20-day SMA (${formatMoney(sma20)}) is ${sma20 > sma50 ? 'above' : 'below'} the 50-day SMA — this is a ${sma20 > sma50 ? 'golden cross (bullish)' : 'death cross (bearish)'} signal.`;
  }
  if (!sma50 && !sma20) {
    explanation = 'Insufficient historical data to calculate moving averages. Need at least 50 days of price history.';
  }
  return explanation;
}

function getMomentumExplanation(change, prevClose) {
  if (change === null || change === undefined) return 'Change data unavailable.';
  const pct = prevClose ? ((change / prevClose) * 100) : 0;
  const direction = change >= 0 ? 'up' : 'down';
  const absChange = Math.abs(change).toFixed(2);
  const absPct = Math.abs(pct);

  let explanation = `The stock moved ${direction} $${absChange} (${absPct.toFixed(2)}%) today. `;
  if (absPct >= 5) {
    explanation += change > 0
      ? 'A move of 5%+ in a single day indicates very strong buying interest — could be earnings, news, or a breakout. Verify what caused the move before chasing.'
      : 'A drop of 5%+ in one day signals serious selling pressure. Check for negative news or earnings miss before considering a buy.';
  } else if (absPct >= 2) {
    explanation += change > 0
      ? 'A 2-5% gain is a strong daily move — above average volume likely accompanied this. Shows active buyer interest.'
      : 'A 2-5% drop is a significant single-day decline. Watch if it holds support or continues lower.';
  } else if (absPct >= 0.5) {
    explanation += change > 0
      ? 'A modest gain — normal daily fluctuation. Slight positive bias but nothing significant on its own.'
      : 'A modest decline — normal daily fluctuation. Slight negative bias but not alarming on its own.';
  } else {
    explanation += 'Very small movement — the stock is essentially flat today. Low volatility session, likely waiting for a catalyst.';
  }
  return explanation;
}

function getRangeExplanation(price, high52, low52) {
  if (!high52 || !low52 || !price) return '52-week range data unavailable.';
  const range = high52 - low52;
  if (range <= 0) return '52-week range data unavailable.';
  const position = ((price - low52) / range) * 100;
  const toHigh = ((high52 - price) / price) * 100;
  const fromLow = ((price - low52) / low52) * 100;

  let explanation = `At ${formatMoney(price)}, the stock is ${position.toFixed(1)}% through its 52-week range (${formatMoney(low52)} low → ${formatMoney(high52)} high). `;
  if (position <= 15) {
    explanation += `Trading near the 52-week LOW. This could mean the stock is deeply discounted — a potential value opportunity IF the business is healthy. It is ${fromLow.toFixed(1)}% above its yearly low. Contrarian buyers often look here.`;
  } else if (position <= 30) {
    explanation += `In the lower portion of its yearly range — down significantly from its highs. Has ${toHigh.toFixed(1)}% upside to reach the 52-week high. Could be recovering from a selloff.`;
  } else if (position <= 55) {
    explanation += `In the middle of its 52-week range — balanced between high and low. No extreme positioning. ${toHigh.toFixed(1)}% away from the 52-week high.`;
  } else if (position <= 75) {
    explanation += `In the upper half of its yearly range — showing relative strength. Only ${toHigh.toFixed(1)}% from the 52-week high. Momentum is on its side.`;
  } else if (position <= 90) {
    explanation += `Near the 52-week HIGH — the stock is performing very well relative to the past year. Only ${toHigh.toFixed(1)}% from the yearly high. Breakouts above 52-week highs can signal powerful new uptrends.`;
  } else {
    explanation += `AT or NEAR the 52-week HIGH (${formatMoney(high52)}). The stock is at peak annual performance. Breakouts to new highs are bullish but also mean you are buying at the top of the recent range — risk/reward is less favorable for new entries.`;
  }
  return explanation;
}

function getValuationExplanation(pe) {
  if (!pe || Number.isNaN(Number(pe))) {
    return 'P/E ratio not available. This could mean the company has negative earnings (not yet profitable), or the data source does not have this information. For unprofitable companies, look at Price/Sales or Price/Book ratios instead.';
  }

  const p = parseFloat(pe);
  let explanation = `The P/E ratio is ${p.toFixed(1)}. This means investors are paying $${p.toFixed(1)} for every $1 of the company\'s earnings. `;
  if (p < 0) {
    explanation += 'A negative P/E means the company is currently losing money. Valuation must be assessed differently — look at growth rate and path to profitability.';
  } else if (p < 10) {
    explanation += 'Under 10x earnings is generally considered very cheap — either a deep value opportunity OR the market expects earnings to decline. Research WHY it is this cheap before assuming it is a bargain.';
  } else if (p < 18) {
    explanation += '10-18x earnings is historically reasonable for most industries. The S&P 500 average P/E is typically around 15-20x. This suggests fair to slightly cheap valuation.';
  } else if (p < 25) {
    explanation += '18-25x earnings is slightly above historical averages but acceptable for quality companies with steady growth. Common for established blue-chip stocks.';
  } else if (p < 40) {
    explanation += '25-40x earnings is elevated — the market expects significant future earnings growth to justify this price. If growth slows, the stock could re-rate lower quickly.';
  } else if (p < 60) {
    explanation += '40-60x earnings is high — you are paying a premium for expected future growth. These valuations work in bull markets but can compress sharply if growth disappoints.';
  } else {
    explanation += 'Over 60x earnings is very expensive by historical standards. The stock is priced for perfection — any earnings miss or slowdown could cause a significant decline. High risk, high reward profile.';
  }
  return explanation;
}

function renderScoreBreakdown(data, scores) {
  const breakdown = document.getElementById('score-breakdown');
  if (!breakdown) return;

  const items = [
    {
      label: 'RSI Momentum',
      score: scores.rsiScore,
      weight: '25%',
      value: Number.isFinite(Number(data.rsi)) ? Number(data.rsi).toFixed(1) : 'N/A',
      explanation: getRSIExplanation(data.rsi)
    },
    {
      label: 'Price Trend (vs SMA)',
      score: scores.trendScore,
      weight: '25%',
      value: data.sma50 ? `${formatMoney(data.price)} vs SMA50 ${formatMoney(data.sma50)}` : 'N/A',
      explanation: getTrendExplanation(data.price, data.sma50, data.sma20)
    },
    {
      label: 'Recent Momentum',
      score: scores.momentumScore,
      weight: '20%',
      value: `${data.change >= 0 ? '+' : ''}${Number(data.change || 0).toFixed(2)} (${data.changePercent || 'N/A'})`,
      explanation: getMomentumExplanation(data.change, data.prevClose)
    },
    {
      label: '52-Week Position',
      score: scores.rangeScore,
      weight: '15%',
      value: (data.week52High && data.week52Low) ? `${formatMoney(data.week52Low)} — ${formatMoney(data.week52High)}` : 'N/A',
      explanation: getRangeExplanation(data.price, data.week52High, data.week52Low)
    },
    {
      label: 'Valuation (P/E)',
      score: scores.valScore,
      weight: '15%',
      value: data.pe ? `P/E ${Number(data.pe).toFixed(1)}` : 'No P/E data',
      explanation: getValuationExplanation(data.pe)
    }
  ];

  breakdown.innerHTML = items.map((item) => `
    <div style="
      display:flex; align-items:flex-start; gap:12px;
      padding:12px 0; border-bottom:1px solid #2a2a4a;
    ">
      <div style="
        min-width:48px; height:48px; border-radius:50%;
        background:${getScoreColor(item.score)};
        display:flex; align-items:center; justify-content:center;
        font-weight:900; font-size:14px; color:#fff; flex-shrink:0;
      ">${item.score}</div>
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
          <span style="color:#e8eef4; font-weight:700; font-size:13px;">${item.label}</span>
          <span style="color:#8892a6; font-size:11px;">${item.weight} weight</span>
        </div>
        <div style="color:#f0a500; font-size:12px; font-family:monospace; margin-bottom:4px;">
          ${item.value}
        </div>
        <div style="color:#aab; font-size:12px; line-height:1.5;">
          ${item.explanation}
        </div>
      </div>
    </div>
  `).join('');
}

function getRSISignal(rsi) {
  if (!Number.isFinite(Number(rsi))) return '—';
  if (rsi < 30) return '🟢 Oversold — potential buy';
  if (rsi < 45) return '🟡 Slightly oversold';
  if (rsi < 55) return '🟡 Neutral';
  if (rsi < 70) return '🟠 Slightly overbought';
  return '🔴 Overbought — caution';
}

function getDayTradeVerdict(score, data) {
  const rsiStr = data.rsi ? `RSI at ${data.rsi.toFixed(0)}` : 'RSI unavailable';
  const changeStr = (data.change || data.change === 0)
    ? `${data.change >= 0 ? 'up' : 'down'} ${Math.abs(data.change).toFixed(2)} today`
    : 'price change unavailable';

  if (score >= 70) {
    return {
      text: '✅ Good Day Trade Setup',
      reason: `${rsiStr} shows ${data.rsi < 50 ? 'oversold conditions — potential bounce' : 'bullish momentum'}. Stock is ${changeStr}. Volume and momentum suggest intraday movement is likely. Use tight stop-loss (1-2% below entry). Best for experienced traders only.`,
      risk: 'HIGH RISK',
      riskColor: '#ff9100'
    };
  }
  if (score >= 55) {
    return {
      text: '⚠️ Neutral Day Trade',
      reason: `Mixed signals for day trading. ${rsiStr} is in neutral territory. Stock is ${changeStr} — not enough momentum for a high-conviction trade. Wait for a clearer intraday trend or catalyst before entering.`,
      risk: 'MEDIUM RISK',
      riskColor: '#ffcc00'
    };
  }
  return {
    text: '❌ Avoid Day Trading Today',
    reason: `${rsiStr} — ${data.rsi > 70 ? 'overbought, risk of reversal downward' : 'weak momentum, no clear direction'}. Stock is ${changeStr}. Risk outweighs potential reward for an intraday trade. Better opportunities elsewhere today.`,
    risk: 'HIGH RISK',
    riskColor: '#ff4444'
  };
}

function getSwingVerdict(score, data) {
  const smaStr = data.sma50
    ? `Price (${formatMoney(data.price)}) is ${data.price > data.sma50 ? 'above' : 'below'} the 50-day SMA (${formatMoney(data.sma50)})`
    : 'SMA data unavailable';
  const rsiStr = data.rsi ? `RSI at ${data.rsi.toFixed(0)}` : 'RSI unavailable';

  if (score >= 70) {
    return {
      text: '✅ Strong Swing Trade Setup',
      reason: `${smaStr} — a bullish positioning. ${rsiStr} supports the move. Look for an entry on a small pullback toward ${formatMoney(data.sma20 || data.sma50)}. Target the upper Bollinger Band or recent resistance. Typical swing hold: 3-10 trading days. Set stop below the 50-day SMA.`,
      risk: 'MEDIUM RISK',
      riskColor: '#ff9100'
    };
  }
  if (score >= 50) {
    return {
      text: '⚠️ Possible Swing — Use Caution',
      reason: `${smaStr}. ${rsiStr}. Some positive signals but not a clean setup. If you enter, keep position size smaller than normal and use a tighter stop-loss. Wait for price to confirm direction before adding to position.`,
      risk: 'MEDIUM RISK',
      riskColor: '#ffcc00'
    };
  }
  return {
    text: '❌ Poor Swing Trade Setup',
    reason: `${smaStr} — bearish positioning. ${rsiStr} does not suggest a reversal is imminent. The technical trend is working against you. A swing trade here means fighting the trend — low probability of success. Wait for the stock to reclaim the 50-day SMA before considering a swing.`,
    risk: 'HIGH RISK',
    riskColor: '#ff4444'
  };
}

function getLongHoldVerdict(score, data) {
  const targetStr = data.analystTarget
    ? `Analyst consensus target is ${formatMoney(data.analystTarget)} — ${(((data.analystTarget - data.price) / data.price) * 100).toFixed(1)}% ${data.analystTarget > data.price ? 'upside' : 'downside'} from current price. `
    : '';
  const peStr = data.pe
    ? `P/E of ${data.pe.toFixed(1)} is ${data.pe < 20 ? 'reasonable for a long-term hold' : data.pe < 35 ? 'moderate — acceptable if growth is strong' : 'elevated — requires strong earnings growth to justify'}. `
    : '';
  const rangeStr = data.week52High && data.week52Low
    ? `Currently ${(((data.price - data.week52Low) / (data.week52High - data.week52Low)) * 100).toFixed(0)}% through its 52-week range. `
    : '';

  if (score >= 70) {
    return {
      text: '✅ Strong Long-Term Hold',
      reason: `${targetStr}${peStr}${rangeStr}Fundamentals support holding this position for months or years. Suitable for a core portfolio position. Continue to monitor quarterly earnings for changes in the thesis.`,
      risk: 'LOWER RISK',
      riskColor: '#00c853'
    };
  }
  if (score >= 50) {
    return {
      text: '⚠️ Hold With Modest Expectations',
      reason: `${targetStr}${peStr}${rangeStr}Decent fundamentals but limited near-term catalysts visible in the data. Suitable for a small portfolio allocation. Review again after next earnings report.`,
      risk: 'MEDIUM RISK',
      riskColor: '#ffcc00'
    };
  }
  return {
    text: '❌ Risky Long-Term Hold',
    reason: `${targetStr}${peStr}${rangeStr}Current valuation or technicals do not support a long-term position at this price. You may be buying near a top or into a declining trend. Consider waiting for a pullback of 10-15% before initiating a long position.`,
    risk: 'HIGH RISK',
    riskColor: '#ff4444'
  };
}

function renderTradingCard(cardId, score, verdict) {
  const card = document.getElementById(cardId);
  if (!card) return;

  let borderColor;
  if (score >= 70) borderColor = '#00c853';
  else if (score >= 50) borderColor = '#2979ff';
  else if (score >= 35) borderColor = '#ff9100';
  else borderColor = '#ff4444';

  card.style.borderColor = borderColor;
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
      <h3 style="color:#f0a500;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0;">
        ${card.dataset.title || ''}
      </h3>
      <div style="
        background:${borderColor};color:#fff;
        font-size:18px;font-weight:900;
        padding:4px 10px;border-radius:8px;min-width:52px;text-align:center;
      ">${score}</div>
    </div>
    <div style="color:#e8eef4;font-size:13px;font-weight:700;margin-bottom:6px;">
      ${verdict.text}
    </div>
    <div style="color:#aab;font-size:12px;line-height:1.6;margin-bottom:10px;">
      ${verdict.reason}
    </div>
    <div style="
      display:inline-block;
      background:${verdict.riskColor}22;
      border:1px solid ${verdict.riskColor};
      color:${verdict.riskColor};
      font-size:10px;font-weight:700;letter-spacing:1px;
      padding:3px 8px;border-radius:4px;
    ">${verdict.risk}</div>
  `;
}

function renderDataFooter(data) {
  const footer = document.getElementById('data-footer');
  if (!footer) return;
  const sourceText = Array.isArray(data.sources) && data.sources.length
    ? data.sources.join(', ')
    : (data.dataSource || 'Unknown source');
  footer.innerHTML = `
    <div style="color:#555;font-size:11px;padding:16px 0;border-top:1px solid #2a2a4a;margin-top:16px;">
      📡 Data from <strong style="color:#888;">${sourceText}</strong> ·
      Analyzed at ${new Date().toLocaleTimeString()} ·
      Prices may be delayed 15-20 minutes ·
      <em>Not financial advice — always do your own research</em>
    </div>
  `;
}

function renderSourceBadges(sources) {
  const container = document.getElementById('source-badges');
  if (!container || !Array.isArray(sources) || !sources.length) {
    if (container) {
      container.innerHTML = '';
    }
    return;
  }

  container.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
      <span style="color:#555;font-size:11px;align-self:center;">
        Data from:
      </span>
      ${sources.map((source) => `
        <span style="
          background:#1a2a1a; border:1px solid #2a4a2a;
          color:#4caf50; font-size:10px; font-weight:700;
          padding:3px 8px; border-radius:4px;
        ">✓ ${source}</span>
      `).join('')}
    </div>
  `;
}

function renderAnalystRecs(rec, count) {
  if (!rec) return '';
  const total = Number(rec.strongBuy || 0)
    + Number(rec.buy || 0)
    + Number(rec.hold || 0)
    + Number(rec.sell || 0)
    + Number(rec.strongSell || 0);
  if (!total) return '';

  const buyPct = Math.round((((Number(rec.strongBuy) || 0) + (Number(rec.buy) || 0)) / total) * 100);
  const sellPct = Math.round((((Number(rec.sell) || 0) + (Number(rec.strongSell) || 0)) / total) * 100);
  const consensus = buyPct > 60 ? 'STRONG BUY'
    : buyPct > 40 ? 'BUY'
      : sellPct > 40 ? 'SELL'
        : 'HOLD';
  const consensusColor = buyPct > 60 ? '#00c853'
    : buyPct > 40 ? '#69f0ae'
      : sellPct > 40 ? '#ff4444'
        : '#ffcc00';

  return `
    <div style="background:#162030;border-radius:12px;padding:16px;margin-bottom:16px;">
      <h3 style="color:#f0a500;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">
        📊 Analyst Consensus ${count ? `(${count} analysts)` : ''}
      </h3>

      <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
        <div style="font-size:22px;font-weight:900;color:${consensusColor};">
          ${consensus}
        </div>
        <div style="font-size:12px;color:#888;">
          as of ${rec.period || 'latest'}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:80px 1fr 30px;gap:4px 8px;align-items:center;font-size:11px;">
        <span style="color:#00c853;">Strong Buy</span>
        <div style="background:#333;border-radius:3px;height:8px;"><div style="background:#00c853;width:${((Number(rec.strongBuy || 0) / total) * 100).toFixed(1)}%;height:100%;border-radius:3px;"></div></div>
        <span style="color:#aaa;text-align:right;">${Number(rec.strongBuy || 0)}</span>

        <span style="color:#69f0ae;">Buy</span>
        <div style="background:#333;border-radius:3px;height:8px;"><div style="background:#69f0ae;width:${((Number(rec.buy || 0) / total) * 100).toFixed(1)}%;height:100%;border-radius:3px;"></div></div>
        <span style="color:#aaa;text-align:right;">${Number(rec.buy || 0)}</span>

        <span style="color:#ffcc00;">Hold</span>
        <div style="background:#333;border-radius:3px;height:8px;"><div style="background:#ffcc00;width:${((Number(rec.hold || 0) / total) * 100).toFixed(1)}%;height:100%;border-radius:3px;"></div></div>
        <span style="color:#aaa;text-align:right;">${Number(rec.hold || 0)}</span>

        <span style="color:#ff9100;">Sell</span>
        <div style="background:#333;border-radius:3px;height:8px;"><div style="background:#ff9100;width:${((Number(rec.sell || 0) / total) * 100).toFixed(1)}%;height:100%;border-radius:3px;"></div></div>
        <span style="color:#aaa;text-align:right;">${Number(rec.sell || 0)}</span>

        <span style="color:#ff4444;">Strong Sell</span>
        <div style="background:#333;border-radius:3px;height:8px;"><div style="background:#ff4444;width:${((Number(rec.strongSell || 0) / total) * 100).toFixed(1)}%;height:100%;border-radius:3px;"></div></div>
        <span style="color:#aaa;text-align:right;">${Number(rec.strongSell || 0)}</span>
      </div>
    </div>
  `;
}

function renderIndicators(data) {
  const tbody = document.getElementById('indicators-tbody');
  if (!tbody) return;

  const rows = [
    {
      label: 'RSI (14)',
      value: Number.isFinite(Number(data.rsi)) ? Number(data.rsi).toFixed(1) : 'N/A',
      signal: getRSISignal(data.rsi)
    },
    {
      label: 'SMA 50',
      value: Number.isFinite(Number(data.sma50)) ? formatMoney(data.sma50) : 'N/A',
      signal: data.sma50 && data.price > data.sma50 ? '🟢 Above (bullish)' : '🔴 Below (bearish)'
    },
    {
      label: 'Price vs 52W High',
      value: data.week52High ? `${((data.price / data.week52High) * 100).toFixed(1)}% of high` : 'N/A',
      signal: data.week52High && data.price > data.week52High * 0.9 ? '🟠 Near high' : '🟢 Room to run'
    },
    { label: '52W High', value: data.week52High ? formatMoney(data.week52High) : 'N/A', signal: '📊' },
    { label: '52W Low', value: data.week52Low ? formatMoney(data.week52Low) : 'N/A', signal: '📊' },
    {
      label: 'Analyst Target',
      value: data.analystTarget ? formatMoney(data.analystTarget) : 'N/A',
      signal: data.analystTarget && data.price
        ? (data.analystTarget > data.price
          ? `🟢 +${(((data.analystTarget - data.price) / data.price) * 100).toFixed(1)}% upside`
          : '🔴 Below current price')
        : '—'
    },
    {
      label: 'P/E Ratio',
      value: data.pe ? Number(data.pe).toFixed(1) : 'N/A',
      signal: data.pe
        ? (data.pe < 20 ? '🟢 Reasonable' : data.pe < 35 ? '🟡 Moderate' : '🔴 High')
        : '—'
    },
    {
      label: 'Data Source',
      value: Array.isArray(data.sources) && data.sources.length ? data.sources.join(', ') : (data.dataSource || 'N/A'),
      signal: '🔗'
    }
  ];

  if (data.macd !== null && data.macd !== undefined) {
    rows.push({
      label: 'MACD',
      value: Number(data.macd).toFixed(3),
      signal: data.macd > data.macdSignal
        ? '🟢 Bullish (above signal line)'
        : '🔴 Bearish (below signal line)',
      explanation: getMACDExplanation(data.macd, data.macdSignal, data.macdHist)
    });
  }

  if (data.beta) {
    rows.push({
      label: 'Beta',
      value: Number(data.beta).toFixed(2),
      signal: data.beta > 1.5 ? '🔴 Very volatile'
        : data.beta > 1.0 ? '🟠 More volatile than market'
          : data.beta > 0.5 ? '🟢 Less volatile than market'
            : '🟢 Low volatility',
      explanation: `Beta of ${Number(data.beta).toFixed(2)} means the stock moves ${data.beta > 1 ? `${((data.beta - 1) * 100).toFixed(0)}% more than` : `${((1 - data.beta) * 100).toFixed(0)}% less than`} the overall market. ${data.beta > 1.5 ? 'High beta stocks are risky but can deliver bigger gains.' : data.beta < 0.8 ? 'Low beta stocks are more stable — good for conservative investors.' : 'Moderate beta — moves roughly in line with the market.'}`
    });
  }

  if (data.roe) {
    rows.push({
      label: 'Return on Equity',
      value: `${(Number(data.roe) * 100).toFixed(1)}%`,
      signal: data.roe > 0.20 ? '🟢 Excellent'
        : data.roe > 0.10 ? '🟡 Good'
          : data.roe > 0 ? '🟠 Below average'
            : '🔴 Negative',
      explanation: `ROE of ${(Number(data.roe) * 100).toFixed(1)}% means the company generates $${(Number(data.roe) * 100).toFixed(1)} of profit for every $100 of shareholder equity. ${data.roe > 0.15 ? 'Above 15% is generally considered strong — the company uses shareholder money efficiently.' : data.roe < 0 ? 'Negative ROE means the company is losing money.' : 'Below 15% suggests the company could be more efficient with capital.'}`
    });
  }

  if (data.netMargin) {
    rows.push({
      label: 'Net Profit Margin',
      value: `${(Number(data.netMargin) * 100).toFixed(1)}%`,
      signal: data.netMargin > 0.20 ? '🟢 Excellent'
        : data.netMargin > 0.10 ? '🟡 Good'
          : data.netMargin > 0 ? '🟠 Thin margin'
            : '🔴 Unprofitable',
      explanation: `For every $100 in revenue, the company keeps $${(Number(data.netMargin) * 100).toFixed(1)} as profit after all expenses. ${data.netMargin > 0.20 ? 'Excellent margins — highly profitable business.' : data.netMargin > 0.10 ? 'Solid margins for most industries.' : data.netMargin > 0 ? 'Thin margins — vulnerable to cost increases.' : 'Company is not yet profitable — burning cash.'}`
    });
  }

  if (data.debtToEquity) {
    rows.push({
      label: 'Debt / Equity',
      value: `${Number(data.debtToEquity).toFixed(2)}x`,
      signal: data.debtToEquity < 0.5 ? '🟢 Low debt'
        : data.debtToEquity < 1.5 ? '🟡 Moderate debt'
          : data.debtToEquity < 3.0 ? '🟠 High debt'
            : '🔴 Very high debt',
      explanation: `Debt-to-equity ratio of ${Number(data.debtToEquity).toFixed(2)} means the company has $${Number(data.debtToEquity).toFixed(2)} of debt for every $1 of equity. ${data.debtToEquity < 0.5 ? 'Very conservative balance sheet — financially strong.' : data.debtToEquity < 1.5 ? 'Manageable debt levels for most industries.' : data.debtToEquity < 3 ? 'Elevated debt — monitor for refinancing risk.' : 'High debt load — risky if interest rates rise or earnings fall.'}`
    });
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td style="padding:10px 12px;font-weight:600;color:#e8eef4;">${row.label}</td>
      <td style="padding:10px 12px;font-family:monospace;color:#f4f7fb;">${row.value}</td>
      <td style="padding:10px 12px;color:#c7d1de;">
        <div>${row.signal}</div>
        ${row.explanation ? `<div style="margin-top:4px;font-size:11px;color:#9aa7bb;line-height:1.4;">${row.explanation}</div>` : ''}
      </td>
    </tr>
  `).join('');
}

function showLoadingUI(ticker) {
  setText('stock-name', `Analyzing ${ticker}...`);
  const loading = document.getElementById('analysis-loading');
  const loadingText = document.getElementById('analysis-loading-text');
  const content = document.getElementById('analysis-content');
  const error = document.getElementById('error-box');
  const analyst = document.getElementById('analyst-consensus');
  const scoreBreakdown = document.getElementById('score-breakdown');
  const indicatorsTbody = document.getElementById('indicators-tbody');
  const cards = document.getElementById('trading-cards');
  if (loading) loading.hidden = false;
  if (loadingText) loadingText.textContent = `Analyzing ${ticker}...`;
  if (content) content.style.opacity = '0.45';
  if (error) {
    error.style.display = 'none';
    error.classList.add('hidden');
    error.textContent = '';
  }
  renderSourceBadges([]);
  if (analyst) {
    analyst.innerHTML = '';
  }
  if (scoreBreakdown) {
    scoreBreakdown.innerHTML = `
      <div class="analysis-skeleton-list">
        <div class="analysis-skeleton-line"></div>
        <div class="analysis-skeleton-line"></div>
        <div class="analysis-skeleton-line"></div>
      </div>
    `;
  }
  if (cards) {
    cards.innerHTML = `
      <div class="analysis-skeleton-grid">
        <div class="analysis-skeleton-block"></div>
        <div class="analysis-skeleton-block"></div>
        <div class="analysis-skeleton-block"></div>
      </div>
    `;
  }
  if (indicatorsTbody) {
    indicatorsTbody.innerHTML = `
      <tr><td colspan="3">
        <div class="analysis-skeleton-list">
          <div class="analysis-skeleton-line"></div>
          <div class="analysis-skeleton-line"></div>
          <div class="analysis-skeleton-line"></div>
          <div class="analysis-skeleton-line"></div>
        </div>
      </td></tr>
    `;
  }
}

function hideLoadingUI() {
  const loading = document.getElementById('analysis-loading');
  const content = document.getElementById('analysis-content');
  if (loading) loading.hidden = true;
  if (content) {
    content.style.opacity = '1';
    content.style.transition = 'opacity 0.35s ease';
  }
}

function renderAnalysisPage(data) {
  const scores = calculateScores(data);
  renderSourceBadges(data.sources);
  setText('stock-name', `${data.ticker} — ${data.companyName}`);
  setText('stock-price', formatMoney(data.price));

  const changeEl = document.getElementById('stock-change');
  if (changeEl) {
    const isUp = Number(data.change) >= 0;
    changeEl.textContent = `${isUp ? '+' : ''}${Number(data.change).toFixed(2)} (${data.changePercent})`;
    changeEl.style.color = isUp ? '#00c853' : '#ff1744';
  }

  setText('stock-sector', data.sector || 'N/A');
  setText('stock-pe', data.pe ? Number(data.pe).toFixed(1) : 'N/A');
  setText('stock-volume', data.volume ? `${(Number(data.volume) / 1000000).toFixed(2)}M` : 'N/A');
  setText('stock-market-cap', data.marketCap ? `$${(Number(data.marketCap) / 1e9).toFixed(1)}B` : 'N/A');

  setText('week52-high', data.week52High ? formatMoney(data.week52High) : 'N/A');
  setText('week52-low', data.week52Low ? formatMoney(data.week52Low) : 'N/A');
  const marker = document.getElementById('week52-marker');
  if (marker && data.week52High && data.week52Low && data.price && data.week52High > data.week52Low) {
    const pct = ((data.price - data.week52Low) / (data.week52High - data.week52Low)) * 100;
    marker.style.left = `${Math.min(95, Math.max(5, pct))}%`;
  } else if (marker) {
    marker.style.left = '50%';
  }

  renderScore(scores.overall);
  renderScoreBreakdown(data, scores);
  renderTradingCard('day-trade-card', scores.dayTrade, getDayTradeVerdict(scores.dayTrade, data));
  renderTradingCard('swing-trade-card', scores.swingTrade, getSwingVerdict(scores.swingTrade, data));
  renderTradingCard('long-hold-card', scores.longHold, getLongHoldVerdict(scores.longHold, data));
  const analystContainer = document.getElementById('analyst-consensus');
  if (analystContainer) {
    analystContainer.innerHTML = renderAnalystRecs(data.analystRec, data.analystCount);
  }
  renderIndicators(data);
  renderDataFooter(data);
  hideLoadingUI();
}

async function loadAndDisplayStock(ticker) {
  try {
    showLoadingUI(ticker);
    const response = await fetch(`/api/market/stock-analysis?ticker=${encodeURIComponent(ticker)}`, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.message || `Could not load ${ticker}. Try again in a moment.`);
      error.code = payload?.error || 'stock_research_failed';
      error.suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
      throw error;
    }
    const data = payload || {};
    if (!data.price || Number.isNaN(Number(data.price))) {
      throw new Error(`Price data unavailable for ${ticker}`);
    }
    renderAnalysisPage(data);
  } catch (err) {
    console.error('Final error:', err);
    showErrorUI(ticker, err?.message || `Could not load ${ticker}. Try again in a moment.`, err);
  }
}

function renderSuggestionsMarkup(suggestions) {
  const list = Array.isArray(suggestions) ? suggestions : [];
  if (!list.length) {
    return '';
  }
  return `
    <div style="margin-top:10px;">
      <div style="font-size:12px;color:#c7d1de;margin-bottom:6px;">Closest matches:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${list.map((item) => `
          <button
            type="button"
            onclick="loadAndDisplayStock('${String(item?.symbol || '').replace(/'/g, '\\\'')}')"
            style="background:#1f2c3d;border:1px solid #2d4866;color:#9bd0ff;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;"
            title="${String(item?.name || '').replace(/"/g, '&quot;')}"
          >${item?.symbol || ''}</button>
        `).join('')}
      </div>
    </div>
  `;
}

function showErrorUI(ticker, message, error = {}) {
  const errEl = document.getElementById('error-box');
  if (!errEl) {
    hideLoadingUI();
    return;
  }
  let headline = message;
  if (error?.code === 'invalid_ticker') {
    headline = message || `'${ticker}' is not a recognized US stock ticker. Please enter a valid symbol like AAPL, TSLA, MU, NVDA.`;
  } else if (error?.code === 'data_temporarily_unavailable') {
    headline = `Data temporarily unavailable for ${ticker}. Please try again.`;
  } else if (error?.code === 'api_rate_limited') {
    headline = `Data providers are rate limited for ${ticker}. Please try again shortly.`;
  } else if (error?.code === 'network_error') {
    headline = `Network error while fetching ${ticker}. Check your connection and retry.`;
  }

  errEl.style.display = 'block';
  errEl.classList.remove('hidden');
  errEl.innerHTML = `
    ⚠️ ${headline}
    ${renderSuggestionsMarkup(error?.suggestions)}
    <br><br>
    <button onclick="loadAndDisplayStock('${ticker}')" style="
      background:#f0a500; color:#000; border:none;
      padding:8px 16px; border-radius:6px; cursor:pointer;
      font-weight:bold; margin-top:8px;
    ">↺ Try Again</button>
  `;
  hideLoadingUI();
}

function wireBackButton() {
  const button = document.getElementById('analysis-back-button');
  if (!(button instanceof HTMLButtonElement)) return;
  button.addEventListener('click', () => {
    window.location.href = '/#stock-outlook-module';
  });
}

window.loadAndDisplayStock = loadAndDisplayStock;
wireBackButton();
window.addEventListener('DOMContentLoaded', () => {
  const pathParts = window.location.pathname.split('/');
  const ticker = String(pathParts[pathParts.length - 1] || '').toUpperCase().trim();

  console.log('Page loaded, ticker from URL:', ticker);

  if (ticker && ticker.length > 0 && ticker !== 'STOCK') {
    loadAndDisplayStock(ticker);
  } else {
    showErrorUI('', 'No ticker provided. Go back and search for a stock.');
  }
});
