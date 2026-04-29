const params = new URLSearchParams(window.location.search);
const ticker = String(params.get('ticker') || '').trim().toUpperCase();
let hasRunApiKeyTest = false;

function safeImportMetaEnv() {
  try {
    return (0, eval)('import.meta.env');
  } catch (_error) {
    return {};
  }
}

function resolveApiKey() {
  const viteEnv = safeImportMetaEnv();
  const apiKey = (typeof process !== 'undefined' && process?.env?.VITE_MARKET_API_KEY)
    || (typeof process !== 'undefined' && process?.env?.MARKET_API_KEY)
    || (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_MARKET_API_KEY)
    || (typeof process !== 'undefined' && process?.env?.REACT_APP_MARKET_API_KEY)
    || (typeof process !== 'undefined' && process?.env?.ALPHAVANTAGE_API_KEY)
    || viteEnv?.VITE_MARKET_API_KEY
    || 'XK10T6I58YPTGMWE';
  console.log('API KEY LOADED:', apiKey);
  return String(apiKey || '').trim();
}

function fmtNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 'Unavailable';
  }
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function fmtUsd(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 'Unavailable';
  }
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function fmtCompactUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 'Unavailable';
  }
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 2
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function proxyFetch(url) {
  const proxied = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxied);
  const wrapper = await res.json();
  if (!wrapper?.contents) {
    throw new Error('Empty proxy response');
  }
  return JSON.parse(wrapper.contents);
}

async function alphaFetch(url) {
  try {
    return await proxyFetch(url);
  } catch (proxyError) {
    // If proxy path fails, direct fetch is attempted for environments
    // where CORS is already allowed.
    const direct = await fetch(url);
    return direct.json();
  }
}

function latestSeriesPoint(series, field) {
  const keys = Object.keys(series || {}).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  if (!keys.length) {
    return null;
  }
  const key = keys[0];
  const value = Number(series[key]?.[field]);
  return Number.isFinite(value) ? value : null;
}

function latestMacdPoint(series) {
  const keys = Object.keys(series || {}).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  if (!keys.length) {
    return { macd: null, signal: null, hist: null, prevHist: null };
  }
  const current = series[keys[0]] || {};
  const previous = series[keys[1]] || {};
  const macd = Number(current.MACD);
  const signal = Number(current.MACD_Signal);
  const hist = Number(current.MACD_Hist);
  const prevHist = Number(previous.MACD_Hist);
  return {
    macd: Number.isFinite(macd) ? macd : null,
    signal: Number.isFinite(signal) ? signal : null,
    hist: Number.isFinite(hist) ? hist : null,
    prevHist: Number.isFinite(prevHist) ? prevHist : null
  };
}

function parsePercent(value) {
  const parsed = Number(String(value || '').replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

async function testAPIKey() {
  if (hasRunApiKeyTest) {
    return;
  }
  hasRunApiKeyTest = true;
  const testUrl = 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=XK10T6I58YPTGMWE';
  try {
    const res = await fetch(testUrl);
    const data = await res.json();
    console.log('RAW API RESPONSE:', data);
  } catch (e) {
    console.error('RAW FETCH FAILED:', e);
  }
}

async function fetchFromYahoo(tickerSymbol) {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(
    `https://query1.finance.yahoo.com/v8/finance/chart/${tickerSymbol}?interval=1d&range=5d`
  )}`;

  const res = await fetch(proxyUrl);
  const wrapper = await res.json();
  const data = JSON.parse(wrapper.contents);

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('Invalid ticker');

  const meta = result.meta || {};
  const price = Number(meta.regularMarketPrice);
  const prevClose = Number(meta.previousClose || meta.chartPreviousClose);
  if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose === 0) {
    throw new Error('Invalid ticker');
  }

  const change = price - prevClose;
  const changePercent = `${((change / prevClose) * 100).toFixed(2)}%`;

  return {
    ticker: tickerSymbol,
    price,
    change,
    changePercent,
    volume: Number(meta.regularMarketVolume) || 0,
    previousClose: prevClose,
    latestTradingDay: meta.regularMarketTime
      ? new Date(Number(meta.regularMarketTime) * 1000).toISOString().slice(0, 10)
      : null,
    rsi: 50,
    macd: 0,
    macdSignal: 0,
    macdHist: 0,
    macdPrevHist: 0,
    sma50: 0,
    sma200: 0,
    bbUpper: null,
    bbMiddle: null,
    bbLower: null,
    pe: null,
    eps: null,
    analystTarget: null,
    companyName: meta.longName || meta.shortName || tickerSymbol,
    sector: 'Unknown',
    marketCap: null,
    averageVolume: null,
    week52High: Number(meta.fiftyTwoWeekHigh) || null,
    week52Low: Number(meta.fiftyTwoWeekLow) || null,
    source: 'Yahoo fallback (allorigins)'
  };
}

async function fetchStockAnalysis(tickerSymbol) {
  const KEY = resolveApiKey();
  const BASE = 'https://www.alphavantage.co/query';

  const quoteData = await alphaFetch(
    `${BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(tickerSymbol)}&apikey=${encodeURIComponent(KEY)}`
  );

  if (!quoteData['Global Quote'] || !quoteData['Global Quote']['05. price']) {
    return fetchFromYahoo(tickerSymbol);
  }

  const quote = quoteData['Global Quote'];
  await delay(1200);

  const rsiData = await alphaFetch(
    `${BASE}?function=RSI&symbol=${encodeURIComponent(tickerSymbol)}&interval=daily&time_period=14&series_type=close&apikey=${encodeURIComponent(KEY)}`
  );
  await delay(1200);

  const macdData = await alphaFetch(
    `${BASE}?function=MACD&symbol=${encodeURIComponent(tickerSymbol)}&interval=daily&series_type=close&apikey=${encodeURIComponent(KEY)}`
  );
  await delay(1200);

  const sma50Data = await alphaFetch(
    `${BASE}?function=SMA&symbol=${encodeURIComponent(tickerSymbol)}&interval=daily&time_period=50&series_type=close&apikey=${encodeURIComponent(KEY)}`
  );
  await delay(1200);

  const sma200Data = await alphaFetch(
    `${BASE}?function=SMA&symbol=${encodeURIComponent(tickerSymbol)}&interval=daily&time_period=200&series_type=close&apikey=${encodeURIComponent(KEY)}`
  );
  await delay(1200);

  const bbData = await alphaFetch(
    `${BASE}?function=BBANDS&symbol=${encodeURIComponent(tickerSymbol)}&interval=daily&time_period=20&series_type=close&apikey=${encodeURIComponent(KEY)}`
  );
  await delay(1200);

  const overview = await alphaFetch(
    `${BASE}?function=OVERVIEW&symbol=${encodeURIComponent(tickerSymbol)}&apikey=${encodeURIComponent(KEY)}`
  );

  const rsi = latestSeriesPoint(rsiData['Technical Analysis: RSI'], 'RSI') ?? 50;
  const macdPoints = latestMacdPoint(macdData['Technical Analysis: MACD']);
  const sma50 = latestSeriesPoint(sma50Data['Technical Analysis: SMA'], 'SMA') ?? 0;
  const sma200 = latestSeriesPoint(sma200Data['Technical Analysis: SMA'], 'SMA') ?? 0;
  const bbUpper = latestSeriesPoint(bbData['Technical Analysis: BBANDS'], 'Real Upper Band');
  const bbMiddle = latestSeriesPoint(bbData['Technical Analysis: BBANDS'], 'Real Middle Band');
  const bbLower = latestSeriesPoint(bbData['Technical Analysis: BBANDS'], 'Real Lower Band');

  return {
    ticker: tickerSymbol,
    price: Number(quote['05. price']),
    change: Number(quote['09. change']),
    changePercent: quote['10. change percent'],
    volume: Number(quote['06. volume']),
    previousClose: Number(quote['08. previous close']),
    latestTradingDay: quote['07. latest trading day'] || null,
    rsi,
    macd: macdPoints.macd ?? 0,
    macdSignal: macdPoints.signal ?? 0,
    macdHist: macdPoints.hist ?? 0,
    macdPrevHist: macdPoints.prevHist ?? 0,
    sma50,
    sma200,
    bbUpper,
    bbMiddle,
    bbLower,
    pe: Number(overview.PERatio) || null,
    eps: Number(overview.EPS) || null,
    analystTarget: Number(overview.AnalystTargetPrice) || null,
    companyName: overview.Name || tickerSymbol,
    sector: overview.Sector || 'Unknown',
    marketCap: Number(overview.MarketCapitalization) || null,
    averageVolume: Number(overview.AverageVolume) || null,
    week52High: Number(overview['52WeekHigh']) || null,
    week52Low: Number(overview['52WeekLow']) || null,
    source: 'Alpha Vantage'
  };
}

function scoreRSI(rsi) {
  if (rsi < 30) return 85;
  if (rsi < 45) return 70;
  if (rsi <= 55) return 50;
  if (rsi <= 70) return 40;
  return 20;
}

function scoreMACD(macd, signal, hist, prevHist) {
  const histGrowing = hist > prevHist;
  if (macd > signal && histGrowing) return 80;
  if (macd > signal && !histGrowing) return 55;
  if (macd < signal && !histGrowing) return 25;
  return 45;
}

function scoreSMA(price, sma50, sma200) {
  if (price > sma50 && sma50 > sma200) return 85;
  if (price > sma50 && sma50 < sma200) return 55;
  if (price < sma50 && sma50 > sma200) return 40;
  return 20;
}

function scoreBB(price, lower, middle, upper) {
  if (![price, lower, middle, upper].every(Number.isFinite) || upper <= lower) {
    return 50;
  }
  const position = (price - lower) / (upper - lower);
  if (position <= 0.33) return 75;
  if (position >= 0.67) return 30;
  return 50;
}

function scoreValuation(pe) {
  if (!Number.isFinite(pe)) return 50;
  if (pe < 15) return 80;
  if (pe <= 25) return 65;
  if (pe <= 40) return 45;
  return 25;
}

function overallLabel(score) {
  if (score >= 80) return 'STRONG BUY';
  if (score >= 60) return 'GOOD';
  if (score >= 40) return 'NEUTRAL';
  return 'WEAK';
}

function riskLevel(score) {
  if (score >= 70) return 'LOW';
  if (score >= 45) return 'MEDIUM';
  return 'HIGH';
}

function buildModel(raw) {
  const changePercentNumber = parsePercent(raw.changePercent);
  const volumeRatio = Number.isFinite(raw.averageVolume) && raw.averageVolume > 0
    ? raw.volume / raw.averageVolume
    : null;

  const rsiScore = scoreRSI(raw.rsi);
  const macdScore = scoreMACD(raw.macd, raw.macdSignal, raw.macdHist, raw.macdPrevHist);
  const smaScore = scoreSMA(raw.price, raw.sma50, raw.sma200);
  const bbScore = scoreBB(raw.price, raw.bbLower, raw.bbMiddle, raw.bbUpper);
  const valuationScore = scoreValuation(raw.pe);

  const overallScore = Math.round((rsiScore * 0.2) + (macdScore * 0.25) + (smaScore * 0.25) + (bbScore * 0.15) + (valuationScore * 0.15));

  const dayScore = Math.round((rsiScore * 0.3) + (macdScore * 0.35) + (bbScore * 0.2) + ((volumeRatio && volumeRatio >= 1.2 ? 75 : volumeRatio && volumeRatio < 0.8 ? 35 : 50) * 0.15));
  const swingScore = Math.round((macdScore * 0.35) + ((raw.price > raw.sma50 ? 70 : 35) * 0.3) + ((raw.rsi >= 40 && raw.rsi <= 60 ? 68 : 50) * 0.2) + (50 * 0.15));
  const longScore = Math.round((((raw.price > raw.sma200) ? 75 : 30) * 0.35) + (valuationScore * 0.25) + ((raw.eps && raw.eps > 0 ? 70 : 50) * 0.2) + ((raw.analystTarget && raw.price > 0 ? Math.min(80, Math.max(35, ((raw.analystTarget - raw.price) / raw.price) * 100)) : 50) * 0.2));

  const bbPosition = Number.isFinite(raw.bbLower) && Number.isFinite(raw.bbUpper) && raw.bbUpper > raw.bbLower
    ? (raw.price - raw.bbLower) / (raw.bbUpper - raw.bbLower)
    : null;

  const indicatorRows = [
    { label: 'RSI (14)', value: raw.rsi, signal: raw.rsi < 30 ? 'Oversold opportunity' : raw.rsi > 70 ? 'Overbought risk' : 'Neutral', tone: raw.rsi < 45 ? 'bullish' : raw.rsi > 70 ? 'bearish' : 'neutral' },
    { label: 'MACD', value: raw.macd, signal: raw.macd > raw.macdSignal ? 'Bullish crossover' : 'Bearish crossover', tone: raw.macd > raw.macdSignal ? 'bullish' : 'bearish' },
    { label: 'SMA 50', value: raw.sma50, signal: raw.price > raw.sma50 ? 'Above (bullish)' : 'Below (bearish)', tone: raw.price > raw.sma50 ? 'bullish' : 'bearish' },
    { label: 'SMA 200', value: raw.sma200, signal: raw.price > raw.sma200 ? 'Above (bullish)' : 'Below (bearish)', tone: raw.price > raw.sma200 ? 'bullish' : 'bearish' },
    { label: 'Bollinger Band', value: bbPosition === null ? 'Unavailable' : bbPosition <= 0.33 ? 'lower' : bbPosition >= 0.67 ? 'upper' : 'middle', signal: bbPosition === null ? 'Unavailable' : bbPosition <= 0.33 ? 'Near lower band' : bbPosition >= 0.67 ? 'Near upper band' : 'Near middle', tone: bbPosition === null ? 'neutral' : bbPosition <= 0.33 ? 'bullish' : bbPosition >= 0.67 ? 'bearish' : 'neutral' },
    { label: 'Volume', value: volumeRatio ? `${fmtNumber(volumeRatio, 2)}x avg` : null, signal: volumeRatio ? (volumeRatio >= 1.2 ? 'Above average' : volumeRatio < 0.8 ? 'Below average' : 'Normal') : 'Unavailable', tone: volumeRatio ? (volumeRatio >= 1.2 ? 'bullish' : volumeRatio < 0.8 ? 'bearish' : 'neutral') : 'neutral' }
  ];

  const upside = Number.isFinite(raw.analystTarget) && raw.price > 0
    ? ((raw.analystTarget - raw.price) / raw.price) * 100
    : null;

  const rangePct = Number.isFinite(raw.week52Low) && Number.isFinite(raw.week52High) && raw.week52High > raw.week52Low
    ? ((raw.price - raw.week52Low) / (raw.week52High - raw.week52Low)) * 100
    : null;

  return {
    ticker: raw.ticker,
    companyName: raw.companyName,
    quote: {
      currentPrice: raw.price,
      dailyChange: raw.change,
      dailyChangePercent: changePercentNumber,
      volume: raw.volume,
      previousClose: raw.previousClose,
      latestTradingDay: raw.latestTradingDay
    },
    overview: {
      marketCap: raw.marketCap,
      sector: raw.sector,
      peRatio: raw.pe,
      eps: raw.eps,
      fiftyTwoWeekHigh: raw.week52High,
      fiftyTwoWeekLow: raw.week52Low,
      analystTargetPrice: raw.analystTarget,
      averageVolume: raw.averageVolume
    },
    scores: {
      overallScore,
      overallLabel: overallLabel(overallScore)
    },
    styles: {
      dayTrade: {
        score: dayScore,
        verdict: dayScore >= 65 ? 'Good for day trading today' : dayScore < 40 ? 'Avoid day trading' : 'Neutral',
        reason: `RSI ${fmtNumber(raw.rsi, 1)} and MACD ${raw.macd > raw.macdSignal ? 'bullish' : 'bearish'} with volume ${volumeRatio ? fmtNumber(volumeRatio, 2) : 'Unavailable'}x average.`,
        riskLevel: riskLevel(dayScore)
      },
      swingTrade: {
        score: swingScore,
        verdict: swingScore >= 65 ? 'Favorable swing setup' : swingScore < 40 ? 'Weak swing setup' : 'Neutral swing setup',
        reason: `Price is ${raw.price > raw.sma50 ? 'above' : 'below'} SMA50 (${fmtUsd(raw.sma50)}) with RSI ${fmtNumber(raw.rsi, 1)}.`,
        entrySuggestion: Number.isFinite(raw.bbLower) ? raw.bbLower : raw.sma50,
        targetSuggestion: Number.isFinite(raw.bbUpper) ? raw.bbUpper : (raw.price * 1.05),
        riskLevel: riskLevel(swingScore)
      },
      longHold: {
        score: longScore,
        verdict: longScore >= 70 ? 'Strong long-term hold' : longScore < 40 ? 'Risky at current valuation' : 'Moderate long-term hold',
        reason: Number.isFinite(upside)
          ? `Analyst target implies ${fmtNumber(upside, 2)}% upside from current price.`
          : 'Analyst target unavailable; relying on trend and valuation context.',
        analystUpsidePercent: Number.isFinite(upside) ? upside : null,
        riskLevel: riskLevel(longScore),
        fundamentalHealth: `${Number.isFinite(raw.pe) ? `P/E ${fmtNumber(raw.pe, 2)}` : 'P/E unavailable'}. ${raw.marketCap ? 'Market cap available.' : 'Market cap unavailable.'}`
      }
    },
    indicatorRows,
    rangePositionPercent: Number.isFinite(rangePct) ? rangePct : null,
    source: {
      quoteSource: raw.source
    }
  };
}

function setLoading(state, label = '') {
  const loading = document.getElementById('analysis-loading');
  const loadingText = document.getElementById('analysis-loading-text');
  const tradeCards = document.getElementById('analysis-trade-cards');
  const indicatorTable = document.getElementById('analysis-indicator-table');

  if (loading) {
    loading.hidden = !state;
  }
  if (state && loadingText) {
    loadingText.textContent = label || 'Analyzing...';
  }
  if (state && tradeCards) {
    tradeCards.innerHTML = '<div class="analysis-skeleton-grid"><div class="analysis-skeleton-block"></div><div class="analysis-skeleton-block"></div><div class="analysis-skeleton-block"></div></div>';
  }
  if (state && indicatorTable) {
    indicatorTable.innerHTML = '<div class="analysis-skeleton-list"><div class="analysis-skeleton-line"></div><div class="analysis-skeleton-line"></div><div class="analysis-skeleton-line"></div><div class="analysis-skeleton-line"></div></div>';
  }
}

function setError(message) {
  const el = document.getElementById('analysis-error');
  if (!el) {
    return;
  }
  const hasMessage = Boolean(message);
  el.hidden = !hasMessage;
  el.classList.toggle('hidden', !hasMessage);
  el.textContent = message || '';
}

function countUp(element, endValue, formatter) {
  if (!element) {
    return;
  }
  const numeric = Number(endValue);
  if (!Number.isFinite(numeric)) {
    element.textContent = formatter ? formatter(endValue) : 'Unavailable';
    return;
  }
  const durationMs = 700;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / durationMs);
    const current = numeric * t;
    element.textContent = formatter ? formatter(current) : String(current);
    if (t < 1) {
      requestAnimationFrame(tick);
      return;
    }
    element.textContent = formatter ? formatter(numeric) : String(numeric);
  }
  requestAnimationFrame(tick);
}

function scoreTone(score) {
  if (!Number.isFinite(score)) {
    return 'warning';
  }
  if (score >= 80) return 'positive';
  if (score >= 60) return 'warning';
  if (score >= 40) return 'warning';
  return 'negative';
}

function applyGauge(score, labelText) {
  const progress = document.getElementById('analysis-gauge-progress');
  const valueEl = document.getElementById('analysis-overall-score');
  const labelEl = document.getElementById('analysis-overall-label');
  if (!progress || !valueEl || !labelEl) {
    return;
  }

  const clamped = Math.max(0, Math.min(100, Number(score || 0)));
  const circumference = 2 * Math.PI * 64;
  progress.style.strokeDasharray = String(circumference);
  progress.style.strokeDashoffset = String(circumference);
  progress.getBoundingClientRect();
  progress.style.strokeDashoffset = String(circumference - ((clamped / 100) * circumference));

  progress.classList.remove('score-gauge-fill--weak', 'score-gauge-fill--neutral', 'score-gauge-fill--good', 'score-gauge-fill--strong');
  if (clamped >= 80) {
    progress.classList.add('score-gauge-fill--strong');
  } else if (clamped >= 60) {
    progress.classList.add('score-gauge-fill--good');
  } else if (clamped >= 40) {
    progress.classList.add('score-gauge-fill--neutral');
  } else {
    progress.classList.add('score-gauge-fill--weak');
  }

  countUp(valueEl, clamped, (value) => `${Math.round(value)}`);
  labelEl.textContent = labelText || (clamped >= 80 ? 'STRONG BUY' : clamped >= 60 ? 'GOOD' : clamped >= 40 ? 'NEUTRAL' : 'WEAK');
}

function renderHeader(payload) {
  const title = document.getElementById('analysis-title');
  const subtitle = document.getElementById('analysis-subtitle');
  const priceBlock = document.getElementById('analysis-price-block');
  const chipRow = document.getElementById('analysis-stat-row');
  const rangeLow = document.getElementById('analysis-range-low');
  const rangeHigh = document.getElementById('analysis-range-high');
  const rangeMarker = document.getElementById('analysis-range-marker');

  const quote = payload.quote || {};
  const overview = payload.overview || {};

  if (title) title.textContent = payload.ticker || ticker;
  if (subtitle) subtitle.textContent = payload.companyName || 'Company name unavailable';

  if (priceBlock) {
    const change = Number(quote.dailyChange);
    const changePct = Number(quote.dailyChangePercent);
    const up = Number.isFinite(change) ? change >= 0 : false;
    const changeClass = up ? 'analysis-move--up' : 'analysis-move--down';
    const changeText = Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${fmtNumber(change, 2)}` : 'Unavailable';
    const pctText = Number.isFinite(changePct) ? `${changePct >= 0 ? '+' : ''}${fmtNumber(changePct, 2)}%` : 'Unavailable';

    priceBlock.innerHTML = `
      <p class="analysis-price-line" id="analysis-price-line">${fmtUsd(quote.currentPrice)}</p>
      <p class="analysis-price-change ${changeClass}">${changeText} (${pctText})</p>
      <p class="small-note">Latest trading day: ${quote.latestTradingDay || 'Unavailable'}</p>
    `;

    const priceLine = document.getElementById('analysis-price-line');
    countUp(priceLine, quote.currentPrice, (value) => fmtUsd(value));
  }

  if (chipRow) {
    chipRow.innerHTML = [
      `Market Cap: ${fmtCompactUsd(overview.marketCap)}`,
      `Sector: ${overview.sector || 'Unavailable'}`,
      `P/E: ${fmtNumber(overview.peRatio, 2)}`,
      `EPS: ${fmtNumber(overview.eps, 2)}`
    ].map((item) => `<span class="analysis-chip">${item}</span>`).join('');
  }

  if (rangeLow) rangeLow.textContent = fmtUsd(overview.fiftyTwoWeekLow);
  if (rangeHigh) rangeHigh.textContent = fmtUsd(overview.fiftyTwoWeekHigh);
  if (rangeMarker) {
    const pct = Number(payload.rangePositionPercent);
    rangeMarker.style.left = Number.isFinite(pct) ? `${Math.max(0, Math.min(100, pct))}%` : '0%';
  }
}

function renderTradeCards(payload) {
  const container = document.getElementById('analysis-trade-cards');
  if (!container) return;
  const styles = payload.styles || {};

  const cards = [
    {
      title: 'DAY TRADE',
      data: styles.dayTrade || {},
      extra: (entry) => `<p class="small-note">Risk: <span class="analysis-risk-pill">${entry.riskLevel || 'MEDIUM'}</span></p>`
    },
    {
      title: 'SWING TRADE',
      data: styles.swingTrade || {},
      extra: (entry) => `<p class="small-note">Entry: ${fmtUsd(entry.entrySuggestion)} • Target: ${fmtUsd(entry.targetSuggestion)}</p><p class="small-note">Risk: <span class="analysis-risk-pill">${entry.riskLevel || 'MEDIUM'}</span></p>`
    },
    {
      title: 'LONG HOLD',
      data: styles.longHold || {},
      extra: (entry) => `<p class="small-note">Analyst upside: ${Number.isFinite(Number(entry.analystUpsidePercent)) ? `${fmtNumber(entry.analystUpsidePercent, 2)}%` : 'Unavailable'}</p><p class="small-note">${entry.fundamentalHealth || 'Fundamental health unavailable.'}</p><p class="small-note">Risk: <span class="analysis-risk-pill">${entry.riskLevel || 'MEDIUM'}</span></p>`
    }
  ];

  container.innerHTML = cards.map((card) => {
    const score = Number(card.data.score);
    const tone = scoreTone(score);
    return `
      <article class="analysis-style-card analysis-style-card--${tone}">
        <div class="analysis-style-head">
          <h3>${card.title}</h3>
          <span class="analysis-score-pill">${Number.isFinite(score) ? Math.round(score) : 'N/A'}/100</span>
        </div>
        <p><strong>${card.data.verdict || 'Neutral'}</strong></p>
        <p>${card.data.reason || 'No reasoning available.'}</p>
        ${card.extra(card.data)}
      </article>
    `;
  }).join('');
}

function renderIndicatorRows(payload) {
  const table = document.getElementById('analysis-indicator-table');
  if (!table) return;
  const rows = Array.isArray(payload.indicatorRows) ? payload.indicatorRows : [];

  table.innerHTML = rows.map((row) => {
    const tone = row.tone === 'bullish' ? 'bullish' : row.tone === 'bearish' ? 'bearish' : 'neutral';
    const emoji = tone === 'bullish' ? '🟢' : tone === 'bearish' ? '🔴' : '🟡';
    let value = row.value;
    if (row.label.includes('SMA')) {
      value = fmtUsd(value);
    } else if (row.label.includes('RSI')) {
      value = fmtNumber(value, 2);
    } else if (row.label === 'MACD') {
      value = Number.isFinite(Number(value)) ? fmtNumber(value, 2) : 'Unavailable';
    } else if (row.label === 'Bollinger Band') {
      value = String(value || 'Unavailable').replace(/^./, (x) => x.toUpperCase());
    }
    return `
      <div class="analysis-tech-row">
        <div><strong>${row.label}</strong></div>
        <div>${value ?? 'Unavailable'}</div>
        <div class="analysis-signal analysis-signal--${tone}">${emoji} ${row.signal || 'Unavailable'}</div>
      </div>
    `;
  }).join('');
}

function renderData(payload) {
  const content = document.getElementById('analysis-content');
  if (content) {
    content.hidden = false;
    content.classList.remove('hidden');
  }
  renderHeader(payload);
  applyGauge(payload?.scores?.overallScore || 0, payload?.scores?.overallLabel || 'NEUTRAL');
  renderTradeCards(payload);
  renderIndicatorRows(payload);
}

function wireBackButton() {
  const button = document.getElementById('analysis-back-button');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  button.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = '/#stock-outlook-module';
  });
}

async function fetchAnalysis() {
  wireBackButton();
  await testAPIKey();

  if (!ticker) {
    setError('Ticker not found');
    return;
  }

  setLoading(true, `Analyzing ${ticker}...`);
  setError('');

  try {
    const raw = await fetchStockAnalysis(ticker);
    const payload = buildModel(raw);
    renderData(payload);
  } catch (error) {
    console.error('Stock fetch error:', error);
    if (error?.message === 'Invalid ticker') {
      setError(`Ticker "${ticker}" not found. Check the symbol and try again.`);
    } else if (String(error?.message || '').toLowerCase().includes('fetch')) {
      setError('Network error. Check your internet connection.');
    } else {
      setError(`Error: ${error?.message || 'Unknown error'}`);
    }
  } finally {
    setLoading(false);
  }
}

fetchAnalysis();
