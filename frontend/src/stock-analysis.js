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

async function fetchStockData(ticker) {
  ticker = ticker.toUpperCase().trim();
  console.log('Fetching data for:', ticker);

  try {
    const data = await fetchFromYahoo(ticker);
    console.log('Yahoo success:', data);
    return data;
  } catch (e) {
    console.warn('Yahoo failed:', e?.message || e);
  }

  try {
    const data = await fetchFromAlphaVantage(ticker);
    console.log('AV success:', data);
    return data;
  } catch (e) {
    console.warn('AV failed:', e?.message || e);
  }

  throw new Error(`Could not load data for ${ticker}. Try again in a moment.`);
}

async function fetchFromYahoo(ticker) {
  const yahooQuery1 = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
  const yahooQuery2 = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y`;
  const proxyOptions = [
    { kind: 'allorigins', url: `https://api.allorigins.win/get?url=${encodeURIComponent(yahooQuery1)}` },
    { kind: 'allorigins', url: `https://api.allorigins.win/get?url=${encodeURIComponent(yahooQuery2)}` },
    { kind: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(yahooQuery1)}` },
    { kind: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(yahooQuery2)}` }
  ];

  let yData = null;

  for (const proxyEntry of proxyOptions) {
    try {
      console.log('Trying proxy:', proxyEntry.url);
      const res = await fetchWithTimeout(proxyEntry.url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      }, 15000);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (proxyEntry.kind === 'allorigins') {
        const wrapper = await res.json();
        if (!wrapper.contents) throw new Error('No contents in proxy response');
        yData = JSON.parse(wrapper.contents);
      } else {
        const responseText = await res.text();
        yData = JSON.parse(responseText);
      }
      console.log('Raw Yahoo data:', yData);
      break;
    } catch (e) {
      console.warn('Proxy failed:', proxyEntry.url, e?.message || e);
    }
  }

  if (!yData) throw new Error('All Yahoo proxies failed');

  if (yData.chart?.error) {
    throw new Error(`Yahoo error: ${yData.chart.error.description || 'request failed'}`);
  }

  const result = yData?.chart?.result?.[0];
  if (!result) throw new Error(`No data found for ${ticker}`);

  const meta = result.meta || {};
  const quotes = result.indicators?.quote?.[0] || {};
  const closes = (quotes.close || []).filter((c) => c != null).map(Number);
  const vols = (quotes.volume || []).filter((v) => v != null).map(Number);

  if (closes.length === 0) throw new Error(`No price data for ${ticker}`);

  const price = Number(meta.regularMarketPrice || closes[closes.length - 1]);
  const prevClose = Number(meta.previousClose || meta.chartPreviousClose || closes[closes.length - 2] || closes[closes.length - 1]);
  const change = price - prevClose;
  const changePct = prevClose ? ((change / prevClose) * 100).toFixed(2) : '0.00';

  const last20 = closes.slice(-20);
  const last50 = closes.slice(-50);
  const last252 = closes.slice(-252);

  const sma20 = last20.length ? last20.reduce((a, b) => a + b, 0) / last20.length : null;
  const sma50 = last50.length ? last50.reduce((a, b) => a + b, 0) / last50.length : null;
  const rsi = closes.length >= 15 ? calculateRSI(closes, 14) : 50;

  const week52High = last252.length ? Math.max(...last252) : Math.max(...closes);
  const week52Low = last252.length ? Math.min(...last252) : Math.min(...closes);

  const avgVolume = vols.length
    ? vols.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, vols.length)
    : 0;

  return {
    ticker,
    companyName: meta.longName || meta.shortName || ticker,
    price: parseFloat(price.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    changePercent: `${changePct}%`,
    volume: Number(meta.regularMarketVolume) || vols[vols.length - 1] || 0,
    avgVolume: Math.round(avgVolume),
    prevClose: parseFloat((prevClose || 0).toFixed(2)),
    week52High: parseFloat(week52High.toFixed(2)),
    week52Low: parseFloat(week52Low.toFixed(2)),
    sma20: sma20 ? parseFloat(sma20.toFixed(2)) : null,
    sma50: sma50 ? parseFloat(sma50.toFixed(2)) : null,
    rsi: parseFloat(rsi.toFixed(1)),
    macd: null,
    pe: null,
    analystTarget: null,
    sector: 'N/A',
    marketCap: toNumber(meta.marketCap),
    dataSource: 'Yahoo Finance',
    rawCloses: closes
  };
}

async function fetchFromAlphaVantage(ticker) {
  const KEY = 'XK10T6I58YPTGMWE';
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${KEY}`;
  console.log('Trying Alpha Vantage:', url);

  const res = await fetchWithTimeout(url, {}, 12000);
  if (!res.ok) throw new Error(`AV HTTP ${res.status}`);

  const data = await res.json();
  console.log('AV raw response:', data);

  if (data.Information || data.Note) {
    throw new Error('Alpha Vantage rate limited');
  }

  const q = data['Global Quote'];
  if (!q || !q['05. price']) {
    throw new Error(`No AV data for ${ticker}`);
  }

  const price = parseFloat(q['05. price']);
  const prevClose = parseFloat(q['08. previous close']);
  const change = parseFloat(q['09. change']);
  const changePct = q['10. change percent'];
  const volume = parseInt(q['06. volume'], 10);

  return {
    ticker,
    companyName: ticker,
    price,
    change,
    changePercent: changePct,
    volume,
    avgVolume: 0,
    prevClose,
    week52High: parseFloat(q['03. high']) || null,
    week52Low: parseFloat(q['04. low']) || null,
    sma20: null,
    sma50: null,
    rsi: 50,
    macd: null,
    pe: null,
    analystTarget: null,
    sector: 'N/A',
    marketCap: null,
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

function showLoadingUI(ticker) {
  setText('stock-name', `Analyzing ${ticker}...`);
  const loading = document.getElementById('analysis-loading');
  const loadingText = document.getElementById('analysis-loading-text');
  const content = document.getElementById('analysis-content');
  const error = document.getElementById('error-box');
  if (loading) loading.hidden = false;
  if (loadingText) loadingText.textContent = `Analyzing ${ticker}...`;
  if (content) content.style.opacity = '0.45';
  if (error) {
    error.style.display = 'none';
    error.classList.add('hidden');
    error.textContent = '';
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
  hideLoadingUI();
}

async function loadAndDisplayStock(ticker) {
  try {
    showLoadingUI(ticker);
    const data = await fetchStockData(ticker);
    if (!data.price || Number.isNaN(Number(data.price))) {
      throw new Error(`Price data unavailable for ${ticker}`);
    }
    renderAnalysisPage(data);
  } catch (err) {
    console.error('Final error:', err);
    showErrorUI(ticker, err?.message || `Could not load ${ticker}. Try again in a moment.`);
  }
}

function showErrorUI(ticker, message) {
  const errEl = document.getElementById('error-box');
  if (!errEl) {
    hideLoadingUI();
    return;
  }
  errEl.style.display = 'block';
  errEl.classList.remove('hidden');
  errEl.innerHTML = `
    ⚠️ ${message}
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
