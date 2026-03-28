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
    throw error;
  }
  return response.json();
}

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function formatSortLabel(sortBy) {
  return String(sortBy || 'value_desc')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function setStatus(text, isError = false) {
  const node = document.getElementById('insider-page-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function readFilters() {
  const side = String(document.getElementById('insider-page-side')?.value || 'all').trim().toLowerCase();
  const symbol = String(document.getElementById('insider-page-symbol')?.value || '').trim().toUpperCase();
  const minValueRaw = Number(document.getElementById('insider-page-min-value')?.value || 0);
  const minValueUsd = Number.isFinite(minValueRaw) && minValueRaw > 0 ? Math.round(minValueRaw) : 0;
  const sortBy = String(document.getElementById('insider-page-sort')?.value || 'value_desc').trim().toLowerCase();
  return { side, symbol, minValueUsd, sortBy };
}

function renderInsiderTrades(payload) {
  const target = document.getElementById('insider-page-results');
  const summaryTarget = document.getElementById('insider-page-summary');
  if (!target || !summaryTarget) {
    return;
  }

  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const filters = payload?.filters || {};
  const total = Number(payload?.totalMatches || rows.length);

  summaryTarget.innerHTML = `
    <article class="ai-trade-consensus">
      <h3>Insider Trades Results</h3>
      <p><strong>Matches:</strong> ${total.toLocaleString()} • <strong>Side:</strong> ${String(filters.side || 'all').toUpperCase()} • <strong>Sort:</strong> ${formatSortLabel(filters.sortBy)}</p>
      <p><strong>Ticker filter:</strong> ${String(filters.symbol || 'ALL')} • <strong>Min value:</strong> ${fmtUsd(filters.minValueUsd || 0)}</p>
      <p class="small-note">Generated: ${payload.generatedAt ? new Date(payload.generatedAt).toLocaleString() : 'N/A'}</p>
    </article>
  `;

  target.innerHTML = '';
  rows.forEach((item) => {
    const side = String(item.side || '').toLowerCase() === 'buy' ? 'buy' : 'sell';
    const reactionPct = Number(item.stockReactionPct || 0);
    const reactionSign = reactionPct > 0 ? '+' : '';
    const reactionClass = reactionPct > 0 ? 'up' : reactionPct < 0 ? 'down' : 'flat';
    const role = item.role || 'N/A';
    const filedAtLabel = item.filedAt ? new Date(item.filedAt).toLocaleString() : 'Filed recently';
    const conviction = String(item.conviction || 'medium')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

    const card = document.createElement('article');
    card.className = `insider-trade-card insider-trade-card--${side}`;
    card.innerHTML = `
      <h4>${item.symbol} • ${side.toUpperCase()}</h4>
      <p><strong>Insider:</strong> ${item.insiderName || 'N/A'} (${role})</p>
      <p><strong>Shares:</strong> ${Number(item.shares || 0).toLocaleString()} • <strong>Avg price:</strong> ${fmtUsd(item.averagePriceUsd)}</p>
      <p><strong>Total trade:</strong> ${fmtUsd(item.valueUsd)} • <strong>Conviction:</strong> ${conviction}</p>
      <p><strong>Stock reaction:</strong> <span class="insider-trade-reaction insider-trade-reaction--${reactionClass}">${reactionSign}${reactionPct.toFixed(2)}%</span></p>
      <p class="small-note">${filedAtLabel} • Source: ${item.source || 'Insider feed'}</p>
      <p class="small-note">${item.details || ''}</p>
    `;
    target.appendChild(card);
  });

  if (!rows.length) {
    target.innerHTML = '<div class="pro-lock">No insider trades matched this filter. Try widening your criteria.</div>';
  }
}

async function loadInsiderTrades() {
  const filters = readFilters();
  const params = new URLSearchParams({
    limit: '30',
    side: filters.side,
    symbol: filters.symbol,
    minValueUsd: String(filters.minValueUsd),
    sortBy: filters.sortBy
  });
  const payload = await fetchJson(`/api/market/insider-trades?${params.toString()}`);
  renderInsiderTrades(payload);
}

function setupPage() {
  const form = document.getElementById('insider-page-form');
  const refreshButton = document.getElementById('insider-page-refresh');
  if (!form || !refreshButton) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      setStatus('Loading insider trades...');
      refreshButton.disabled = true;
      await loadInsiderTrades();
      setStatus('Insider trades updated.');
    } catch (error) {
      setStatus(error.message || 'Could not load insider trades.', true);
    } finally {
      refreshButton.disabled = false;
    }
  });

  refreshButton.addEventListener('click', async () => {
    try {
      setStatus('Refreshing insider trades...');
      refreshButton.disabled = true;
      await loadInsiderTrades();
      setStatus('Insider trades refreshed.');
    } catch (error) {
      setStatus(error.message || 'Could not refresh insider trades.', true);
    } finally {
      refreshButton.disabled = false;
    }
  });
}

async function init() {
  setupPage();
  try {
    setStatus('Loading insider trades...');
    await loadInsiderTrades();
    setStatus('Insider trades ready.');
  } catch (error) {
    setStatus(error.message || 'Could not load insider trades.', true);
  }
}

init();
