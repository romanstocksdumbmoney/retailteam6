const AV_KEY = 'XK10T6I58YPTGMWE';

function getTickerFromRoute() {
  const pathname = String(window.location.pathname || '');
  const parts = pathname.split('/stock/');
  if (parts[1]) {
    return decodeURIComponent(parts[1].split('/')[0]).trim().toUpperCase();
  }
  return '';
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeAverage(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((acc, item) => acc + item, 0) / values.length;
}

function calculateRSI(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) {
    return 50;
  }
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

async function fetchStockData(ticker) {
  const cleanTicker = ticker.toUpperCase().trim();

  try {
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(cleanTicker)}&apikey=${encodeURIComponent(AV_KEY)}`;
    const quoteData = await fetchJsonWithTimeout(quoteUrl, 12000);
    console.log('AV Quote response:', quoteData);
    if (quoteData?.['Global Quote']?.['05. price']) {
      return buildFullAnalysis(cleanTicker, quoteData);
    }
    console.warn('AV unavailable/rate limited, switching to Yahoo fallback');
    return fetchFromYahoo(cleanTicker);
  } catch (error) {
    console.error('AV fetch failed:', error);
    return fetchFromYahoo(cleanTicker);
  }
}

async function fetchFromYahoo(ticker) {
  try {
    const yahooUrl = encodeURIComponent(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`
    );
    const proxyUrl = `https://api.allorigins.win/get?url=${yahooUrl}`;
    const wrapper = await fetchJsonWithTimeout(proxyUrl, 12000);
    if (!wrapper?.contents) {
      throw new Error('Yahoo proxy returned empty content');
    }
    const yData = JSON.parse(wrapper.contents);
    console.log('Yahoo response:', yData);

    const result = yData?.chart?.result?.[0];
    if (!result) {
      throw new Error('Invalid ticker');
    }
    const meta = result.meta || {};
    const quotes = result.indicators?.quote?.[0] || {};
    const closes = Array.isArray(quotes.close) ? quotes.close.filter((item) => Number.isFinite(Number(item))).map(Number) : [];
    if (!closes.length) {
      throw new Error('Invalid ticker');
    }

    const latestClose = closes[closes.length - 1];
    const price = toNumber(meta.regularMarketPrice) ?? latestClose;
    const prevClose = toNumber(meta.previousClose) ?? toNumber(meta.chartPreviousClose) ?? closes[Math.max(0, closes.length - 2)];
    if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose === 0) {
      throw new Error('Invalid ticker');
    }
    const change = price - prevClose;
    const changePct = `${((change / prevClose) * 100).toFixed(2)}%`;

    const recent50 = closes.slice(-50);
    const sma20 = safeAverage(closes.slice(-20));
    const sma50 = safeAverage(recent50);
    const rsi = calculateRSI(recent50, 14);

    const window252 = closes.slice(-252);
    const week52High = window252.length ? Math.max(...window252) : null;
    const week52Low = window252.length ? Math.min(...window252) : null;

    return {
      ticker,
      companyName: meta.longName || meta.shortName || ticker,
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: changePct,
      volume: toNumber(meta.regularMarketVolume) || 0,
      prevClose: Number(prevClose.toFixed(2)),
      week52High: Number.isFinite(week52High) ? Number(week52High.toFixed(2)) : null,
      week52Low: Number.isFinite(week52Low) ? Number(week52Low.toFixed(2)) : null,
      sma20: Number.isFinite(sma20) ? Number(sma20.toFixed(2)) : null,
      sma50: Number.isFinite(sma50) ? Number(sma50.toFixed(2)) : null,
      rsi: Number.isFinite(rsi) ? Number(rsi.toFixed(1)) : 50,
      macd: null,
      pe: null,
      analystTarget: null,
      sector: 'N/A',
      marketCap: toNumber(meta.marketCap),
      dataSource: 'Yahoo Finance'
    };
  } catch (error) {
    console.error('Yahoo fallback failed:', error);
    if (String(error?.message || '').toLowerCase().includes('invalid ticker')) {
      throw new Error(`Ticker "${ticker}" not found. Check the symbol and try again.`);
    }
    throw new Error(`Could not load data for ${ticker}. Check the ticker symbol.`);
  }
}

async function buildFullAnalysis(ticker, quoteData) {
  const q = quoteData['Global Quote'] || {};
  const price = toNumber(q['05. price']);
  const prevClose = toNumber(q['08. previous close']);
  const change = toNumber(q['09. change']);
  const changePct = String(q['10. change percent'] || '').trim() || 'N/A';
  const volume = Number.parseInt(String(q['06. volume'] || '0'), 10) || 0;

  if (!Number.isFinite(price) || !Number.isFinite(prevClose)) {
    return fetchFromYahoo(ticker);
  }

  let overview = {};
  let rsi = 50;
  let sma50 = null;

  try {
    const ovUrl = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(AV_KEY)}`;
    overview = await fetchJsonWithTimeout(ovUrl, 12000);
  } catch (_error) {
    overview = {};
  }
  await delay(1200);

  try {
    const rsiUrl = `https://www.alphavantage.co/query?function=RSI&symbol=${encodeURIComponent(ticker)}&interval=daily&time_period=14&series_type=close&apikey=${encodeURIComponent(AV_KEY)}`;
    const rsiData = await fetchJsonWithTimeout(rsiUrl, 12000);
    const rsiVals = rsiData?.['Technical Analysis: RSI'];
    if (rsiVals) {
      const latestDate = Object.keys(rsiVals)[0];
      rsi = toNumber(rsiVals?.[latestDate]?.RSI) ?? 50;
    }
  } catch (_error) {
    rsi = 50;
  }
  await delay(1200);

  try {
    const smaUrl = `https://www.alphavantage.co/query?function=SMA&symbol=${encodeURIComponent(ticker)}&interval=daily&time_period=50&series_type=close&apikey=${encodeURIComponent(AV_KEY)}`;
    const smaData = await fetchJsonWithTimeout(smaUrl, 12000);
    const smaVals = smaData?.['Technical Analysis: SMA'];
    if (smaVals) {
      const latestDate = Object.keys(smaVals)[0];
      sma50 = toNumber(smaVals?.[latestDate]?.SMA);
    }
  } catch (_error) {
    sma50 = null;
  }

  return {
    ticker,
    companyName: overview.Name || ticker,
    price: Number(price.toFixed(2)),
    change: Number((change ?? (price - prevClose)).toFixed(2)),
    changePercent: changePct,
    volume,
    prevClose: Number(prevClose.toFixed(2)),
    week52High: toNumber(overview['52WeekHigh']),
    week52Low: toNumber(overview['52WeekLow']),
    sma20: null,
    sma50,
    rsi: Number(rsi.toFixed(1)),
    macd: null,
    pe: toNumber(overview.PERatio),
    analystTarget: toNumber(overview.AnalystTargetPrice),
    sector: overview.Sector || 'N/A',
    marketCap: toNumber(overview.MarketCapitalization),
    dataSource: 'Alpha Vantage'
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

function getRSISignal(rsi) {
  if (!Number.isFinite(Number(rsi))) return '—';
  if (rsi < 30) return '🟢 Oversold — potential buy';
  if (rsi < 45) return '🟡 Slightly oversold';
  if (rsi < 55) return '🟡 Neutral';
  if (rsi < 70) return '🟠 Slightly overbought';
  return '🔴 Overbought — caution';
}

function getDayTradeVerdict(score, data) {
  if (score >= 70) {
    return {
      text: 'Good day trade opportunity',
      reason: `RSI at ${Number(data.rsi || 50).toFixed(0)} with positive momentum suggests intraday movement. High risk — use tight stops.`
    };
  }
  if (score >= 50) {
    return {
      text: 'Neutral — trade with caution',
      reason: 'Mixed signals. Wait for a clear intraday trend before entering.'
    };
  }
  return {
    text: 'Avoid day trading today',
    reason: 'Weak momentum and unfavorable technicals. Risk outweighs reward.'
  };
}

function getSwingVerdict(score, data) {
  if (score >= 70) {
    return {
      text: 'Strong swing trade setup',
      reason: `Price ${data.sma50 && data.price > data.sma50 ? 'above' : 'below'} 50-day SMA. RSI at ${Number(data.rsi || 50).toFixed(0)} suggests momentum potential.`
    };
  }
  if (score >= 50) {
    return {
      text: 'Moderate swing potential',
      reason: 'Some positive signals but mixed overall. Size position conservatively.'
    };
  }
  return {
    text: 'Poor swing setup',
    reason: 'Technicals not aligned for a swing trade. Look elsewhere.'
  };
}

function getLongHoldVerdict(score, data) {
  const upside = data.analystTarget && data.price
    ? (((data.analystTarget - data.price) / data.price) * 100).toFixed(1)
    : null;
  if (score >= 70) {
    return {
      text: 'Strong long-term hold',
      reason: upside
        ? `Analyst target implies ${upside}% upside. Fundamentals support holding.`
        : 'Solid fundamentals and favorable valuation for long-term investors.'
    };
  }
  if (score >= 50) {
    return {
      text: 'Hold with modest expectations',
      reason: 'Decent fundamentals but limited near-term catalysts visible.'
    };
  }
  return {
    text: 'Risky at current valuation',
    reason: 'Valuation stretched or technicals weak. Consider waiting for pullback.'
  };
}

function renderTradingCard(cardId, score, verdict) {
  const card = document.getElementById(cardId);
  if (!card) return;

  let color = '#ff1744';
  if (score >= 70) color = '#00c853';
  else if (score >= 50) color = '#2979ff';
  else if (score >= 35) color = '#ff9100';

  const scoreEl = card.querySelector('.card-score');
  const verdictEl = card.querySelector('.card-verdict');
  const reasonEl = card.querySelector('.card-reason');
  if (scoreEl) {
    scoreEl.textContent = `${score}/100`;
    scoreEl.style.color = color;
  }
  if (verdictEl) verdictEl.textContent = verdict.text;
  if (reasonEl) reasonEl.textContent = verdict.reason;
  card.style.borderColor = color;
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
      value: data.dataSource || 'N/A',
      signal: '🔗'
    }
  ];

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td style="padding:10px 12px;font-weight:600;color:#e8eef4;">${row.label}</td>
      <td style="padding:10px 12px;font-family:monospace;color:#f4f7fb;">${row.value}</td>
      <td style="padding:10px 12px;color:#c7d1de;">${row.signal}</td>
    </tr>
  `).join('');
}

function showLoadingState(ticker) {
  setText('stock-name', `Analyzing ${ticker}...`);
  const loading = document.getElementById('analysis-loading');
  const loadingText = document.getElementById('analysis-loading-text');
  const content = document.getElementById('analysis-content');
  const error = document.getElementById('error-display');
  if (loading) loading.hidden = false;
  if (loadingText) loadingText.textContent = `Analyzing ${ticker}...`;
  if (content) content.style.opacity = '0.45';
  if (error) {
    error.classList.add('hidden');
    error.textContent = '';
  }
}

function hideLoadingState() {
  const loading = document.getElementById('analysis-loading');
  const content = document.getElementById('analysis-content');
  if (loading) loading.hidden = true;
  if (content) {
    content.style.opacity = '1';
    content.style.transition = 'opacity 0.35s ease';
  }
}

function showError(message) {
  const error = document.getElementById('error-display');
  if (error) {
    error.classList.remove('hidden');
    error.textContent = `⚠️ ${message}`;
  }
  hideLoadingState();
}

async function loadAnalysisPage(ticker) {
  showLoadingState(ticker);
  try {
    const data = await fetchStockData(ticker);
    const scores = calculateScores(data);

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
    renderTradingCard('day-trade-card', scores.dayTrade, getDayTradeVerdict(scores.dayTrade, data));
    renderTradingCard('swing-trade-card', scores.swingTrade, getSwingVerdict(scores.swingTrade, data));
    renderTradingCard('long-hold-card', scores.longHold, getLongHoldVerdict(scores.longHold, data));
    renderIndicators(data);
    hideLoadingState();
  } catch (error) {
    console.error('Stock analysis page failed:', error);
    showError(error?.message || 'Failed to load stock data');
  }
}

function wireBackButton() {
  const button = document.getElementById('analysis-back-button');
  if (!(button instanceof HTMLButtonElement)) return;
  button.addEventListener('click', () => {
    window.location.href = '/#stock-outlook-module';
  });
}

wireBackButton();
const ticker = getTickerFromRoute();
if (ticker) {
  loadAnalysisPage(ticker);
} else {
  showError('Ticker not found in URL.');
}
