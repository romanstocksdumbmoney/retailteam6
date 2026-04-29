const params = new URLSearchParams(window.location.search);
const ticker = String(params.get('ticker') || '').trim().toUpperCase();
let hasRunApiKeyProbe = false;

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

function setLoading(state, label = '') {
  const loading = document.getElementById('analysis-loading');
  const loadingText = document.getElementById('analysis-loading-text');
  if (loading) {
    loading.hidden = !state;
  }
  if (state && loadingText) {
    loadingText.textContent = label || 'Analyzing...';
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
  if (score >= 80) {
    return 'positive';
  }
  if (score >= 60) {
    return 'warning';
  }
  if (score >= 40) {
    return 'warning';
  }
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

  if (title) {
    title.textContent = payload.ticker || ticker;
  }
  if (subtitle) {
    subtitle.textContent = payload.companyName || 'Company name unavailable';
  }

  if (priceBlock) {
    const change = Number(quote.dailyChange);
    const changePct = Number(quote.dailyChangePercent);
    const up = Number.isFinite(change) ? change >= 0 : false;
    const changeClass = up ? 'analysis-move--up' : 'analysis-move--down';
    const changeText = Number.isFinite(change)
      ? `${change >= 0 ? '+' : ''}${fmtNumber(change, 2)}`
      : 'Unavailable';
    const pctText = Number.isFinite(changePct)
      ? `${changePct >= 0 ? '+' : ''}${fmtNumber(changePct, 2)}%`
      : 'Unavailable';

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

  if (rangeLow) {
    rangeLow.textContent = fmtUsd(overview.fiftyTwoWeekLow);
  }
  if (rangeHigh) {
    rangeHigh.textContent = fmtUsd(overview.fiftyTwoWeekHigh);
  }
  if (rangeMarker) {
    const pct = Number(payload.rangePositionPercent);
    rangeMarker.style.left = Number.isFinite(pct) ? `${Math.max(0, Math.min(100, pct))}%` : '0%';
  }
}

function renderTradeCards(payload) {
  const container = document.getElementById('analysis-trade-cards');
  if (!container) {
    return;
  }
  const styles = payload.styles || payload.tradingStyles || {};
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
  if (!table) {
    return;
  }
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
  if (!ticker) {
    setError('Ticker not found');
    return;
  }
  setLoading(true, `Analyzing ${ticker}...`);
  setError('');
  try {
    const response = await fetch(`/api/market/stock-analysis?ticker=${encodeURIComponent(ticker)}`);
    const payload = await response.json();
    if (!response.ok) {
      if (String(payload?.error || '').toLowerCase() === 'invalid_ticker') {
        throw new Error('Ticker not found');
      }
      throw new Error(payload?.message || 'Could not fetch market data right now. Try again.');
    }
    renderData(payload);
  } catch (error) {
    setError(error?.message || 'Could not fetch market data right now. Try again.');
  } finally {
    setLoading(false);
  }
}

fetchAnalysis();
