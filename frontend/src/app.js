const PLAN_FREE = 'free';
const PLAN_PRO = 'pro';

let activePlan = PLAN_FREE;
let activeTicker = 'AAPL';

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch (_error) {
      body = { message: 'Unknown API error' };
    }
    const error = new Error(body.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return response.json();
}

function headersWithPlan() {
  return { 'x-user-plan': activePlan };
}

function fmtPct(value) {
  return `${Number(value).toFixed(0)}%`;
}

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function renderStatus(text) {
  const status = document.getElementById('status');
  status.textContent = text;
}

function renderOutlook(payload) {
  const target = document.getElementById('stock-results');
  const outlook = payload.outlook;
  target.innerHTML = `
    <article class="prob-card">
      <h3>${payload.ticker} Outlook</h3>
      <p><strong>Day:</strong> ${fmtPct(outlook.day.up)} up / ${fmtPct(outlook.day.down)} down</p>
      <p><strong>Week:</strong> ${fmtPct(outlook.week.up)} up / ${fmtPct(outlook.week.down)} down</p>
      <p><strong>Month:</strong> ${fmtPct(outlook.month.up)} up / ${fmtPct(outlook.month.down)} down</p>
      <p><strong>Year:</strong> ${fmtPct(outlook.year.up)} up / ${fmtPct(outlook.year.down)} down</p>
      <p class="small-note">Analysts tracked: ${payload.coverage.analystsTracked.toLocaleString()}</p>
      <p class="small-note">Articles analyzed: ${payload.coverage.articlesAnalyzed.toLocaleString()}</p>
    </article>
  `;
}

function renderScanner(payload) {
  const target = document.getElementById('scan-results');
  const result = payload.result;
  let metrics = '';
  if (result.metrics) {
    metrics = `
      <p><strong>Market flow score:</strong> ${result.metrics.marketFlowScore}</p>
      <p><strong>Gamma exposure:</strong> ${fmtUsd(result.metrics.gammaExposureUsd)}</p>
      <p><strong>Call premium:</strong> ${fmtUsd(result.metrics.callPremiumUsd)}</p>
      <p><strong>Put premium:</strong> ${fmtUsd(result.metrics.putPremiumUsd)}</p>
      <p><strong>Put/Call ratio:</strong> ${result.metrics.putCallRatio}</p>
    `;
  }
  target.innerHTML = `
    <article class="stack-item">
      <p><strong>${result.ticker}</strong> (${result.method})</p>
      <p>${result.summary}</p>
      <p class="small-note">Source: ${result.source}</p>
      <p class="small-note">Last run: ${result.lastRunUtc}</p>
      ${metrics}
      ${result.isLimited ? '<p class="pro-lock">Free preview. Upgrade to Pro for full market flow detail.</p>' : ''}
    </article>
  `;
}

function renderOptions(payload) {
  const target = document.getElementById('options-results');
  target.innerHTML = `
    <article class="stack-item">
      <p><strong>${payload.ticker}</strong> ${payload.contract.type.toUpperCase()} ${payload.contract.strike}</p>
      <p><strong>Expiration:</strong> ${payload.contract.expiration}</p>
      <p><strong>Premium/contract:</strong> ${fmtUsd(payload.contract.premiumPerContractUsd)}</p>
      <p><strong>Call premium:</strong> ${fmtUsd(payload.premium.callPremiumUsd)}</p>
      <p><strong>Put premium:</strong> ${fmtUsd(payload.premium.putPremiumUsd)}</p>
      <p><strong>Net gamma exposure:</strong> ${fmtUsd(payload.gammaExposure.net)} (${payload.gammaExposure.signedDirection})</p>
    </article>
  `;
}

function renderOptionsLocked(message) {
  const target = document.getElementById('options-results');
  target.innerHTML = `<div class="pro-lock">${message}</div>`;
}

function renderUnusual(payload) {
  const target = document.getElementById('unusual-results');
  target.innerHTML = '';
  payload.data.forEach((move) => {
    const row = document.createElement('article');
    row.className = 'stack-item';
    row.innerHTML = `
      <p><strong>${move.ticker}</strong> ${move.size} (${move.sentiment})</p>
      <p>Premium: ${fmtUsd(move.premiumUsd)}</p>
      <p class="small-note">${move.detectedAt}</p>
    `;
    target.appendChild(row);
  });
}

function renderUnusualLocked(message) {
  const target = document.getElementById('unusual-results');
  target.innerHTML = `<div class="pro-lock">${message}</div>`;
}

function renderEarningsBoard(payload) {
  const target = document.getElementById('earnings-board');
  target.innerHTML = '';
  payload.items.forEach((item) => {
    const card = document.createElement('article');
    card.className = `earnings-card earnings-card--${item.direction}`;
    card.innerHTML = `
      <h3>${item.ticker}</h3>
      <p>${item.reportTimeLabel}</p>
      <p><strong>${fmtPct(item.predictedMove.up)} up</strong> / ${fmtPct(item.predictedMove.down)} down</p>
      <p class="small-note">${item.direction.toUpperCase()} bias</p>
    `;
    target.appendChild(card);
  });
}

async function loadOutlook(ticker) {
  const payload = await fetchJson(`/api/market/stock-outlook?ticker=${encodeURIComponent(ticker)}`, {
    headers: headersWithPlan()
  });
  renderOutlook(payload);
}

async function loadEarningsBoard() {
  const payload = await fetchJson('/api/market/earnings-gambling', {
    headers: headersWithPlan()
  });
  renderEarningsBoard(payload);
}

async function runScanner(query, method) {
  const payload = await fetchJson(
    `/api/market/scan-x?ticker=${encodeURIComponent(query)}&method=${encodeURIComponent(method)}`,
    { headers: headersWithPlan() }
  );
  renderScanner(payload);
}

async function loadUnusualFeed() {
  try {
    const payload = await fetchJson('/api/market/unusual-moves', { headers: headersWithPlan() });
    renderUnusual(payload);
  } catch (error) {
    if (error.status === 403) {
      renderUnusualLocked('Pro feature locked. Upgrade to access unusual moves feed.');
      return;
    }
    throw error;
  }
}

async function calculateOptions(formValues) {
  const query = new URLSearchParams({
    ticker: formValues.symbol,
    spot: formValues.spotPrice,
    strike: formValues.strikePrice,
    daysToExpiry: formValues.daysToExpiry,
    iv: formValues.impliedVolatility,
    type: formValues.contractType
  });
  try {
    const payload = await fetchJson(`/api/market/options?${query.toString()}`, {
      headers: headersWithPlan()
    });
    renderOptions(payload);
  } catch (error) {
    if (error.status === 403) {
      renderOptionsLocked('Pro feature locked. Upgrade to use options calculator and gamma exposure.');
      return;
    }
    throw error;
  }
}

async function refreshBaseline() {
  const health = await fetchJson('/health');
  renderStatus(`API status: ${health.status}`);
  await Promise.all([loadOutlook(activeTicker), loadEarningsBoard()]);
}

function setupPlanToggle() {
  const toggle = document.getElementById('plan-select');
  if (!toggle) {
    return;
  }
  toggle.addEventListener('change', async (event) => {
    activePlan = event.target.value === PLAN_PRO ? PLAN_PRO : PLAN_FREE;
    try {
      await Promise.all([loadUnusualFeed(), refreshBaseline()]);
    } catch (error) {
      console.error(error);
      renderStatus('Failed refreshing data after plan change.');
    }
  });
}

function setupStockForm() {
  const form = document.getElementById('stock-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('ticker-input');
    const next = (input.value || '').trim().toUpperCase();
    if (!next) {
      return;
    }
    activeTicker = next;
    try {
      await loadOutlook(activeTicker);
      await loadEarningsBoard();
    } catch (error) {
      console.error(error);
      renderStatus('Failed to load stock outlook.');
    }
  });
}

function setupScanForm() {
  const form = document.getElementById('scan-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const queryEl = document.getElementById('scan-query');
    const methodEl = document.getElementById('scan-method');
    const query = (queryEl.value || '').trim();
    if (!query) {
      return;
    }
    try {
      await runScanner(query, methodEl.value);
    } catch (error) {
      const target = document.getElementById('scan-results');
      if (error.status === 403) {
        target.innerHTML = `<div class="pro-lock">${error.message}</div>`;
      } else {
        target.innerHTML = '<div class="pro-lock">Scanner failed. Try again.</div>';
      }
    }
  });
}

function setupOptionsForm() {
  const form = document.getElementById('options-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      symbol: document.getElementById('option-symbol').value.trim().toUpperCase() || activeTicker,
      spotPrice: document.getElementById('spot-price').value,
      strikePrice: document.getElementById('strike-price').value,
      daysToExpiry: document.getElementById('days-to-expiry').value,
      impliedVolatility: document.getElementById('iv').value,
      contractType: document.getElementById('contract-type').value
    };
    try {
      await calculateOptions(values);
    } catch (error) {
      console.error(error);
      renderOptionsLocked('Failed to calculate options. Check inputs and retry.');
    }
  });
}

function setupUnusualRefresh() {
  const button = document.getElementById('refresh-unusual');
  button.addEventListener('click', async () => {
    try {
      await loadUnusualFeed();
    } catch (error) {
      console.error(error);
      renderUnusualLocked('Failed to refresh unusual moves feed.');
    }
  });
}

async function init() {
  setupPlanToggle();
  setupStockForm();
  setupScanForm();
  setupOptionsForm();
  setupUnusualRefresh();

  try {
    await refreshBaseline();
    await loadUnusualFeed();
    await runScanner(activeTicker, 'llm-sentiment');
  } catch (error) {
    console.error(error);
    renderStatus('Failed to initialize dashboard.');
  }
}

init();
