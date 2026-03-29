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

function fmtPct(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(1)}%`;
}

function formatSortLabel(sortBy) {
  return String(sortBy || 'value_desc')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function setStatus(text, isError = false) {
  const node = document.getElementById('insider-trades-page-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function readFilters() {
  const side = String(document.getElementById('insider-page-side-select')?.value || 'all').trim().toLowerCase();
  const symbol = String(document.getElementById('insider-page-symbol-input')?.value || '').trim().toUpperCase();
  const minValueRaw = Number(document.getElementById('insider-page-min-value-input')?.value || 0);
  const minValueUsd = Number.isFinite(minValueRaw) && minValueRaw > 0 ? Math.round(minValueRaw) : 0;
  const sortBy = String(document.getElementById('insider-page-sort-select')?.value || 'anomaly_desc').trim().toLowerCase();
  const unusualOnly = Boolean(document.getElementById('insider-page-unusual-only')?.checked);
  return { side, symbol, minValueUsd, sortBy, unusualOnly };
}

function renderInsiderTrades(payload) {
  const target = document.getElementById('insider-trades-page-results');
  if (!target) {
    return;
  }

  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const filters = payload?.filters || {};
  const total = Number(payload?.totalMatches || rows.length);
  const unusualCount = Number(payload?.unusualCount || 0);

  target.innerHTML = `
    <article class="ai-trade-consensus">
      <h3>Insider Anomaly Feed</h3>
      <p><strong>Matches:</strong> ${total.toLocaleString()} • <strong>Unusual:</strong> ${unusualCount.toLocaleString()} • <strong>Side:</strong> ${String(filters.side || 'all').toUpperCase()}</p>
      <p><strong>Sort:</strong> ${formatSortLabel(filters.sortBy)} • <strong>Ticker filter:</strong> ${String(filters.symbol || 'ALL')} • <strong>Min value:</strong> ${fmtUsd(filters.minValueUsd || 0)}</p>
      <p class="small-note">Generated: ${payload.generatedAt ? new Date(payload.generatedAt).toLocaleString() : 'N/A'}</p>
    </article>
  `;

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
    const anomalyScore = Number(item.anomalyScore || 0);
    const unusualMultiple = Number(item.unusualVolumeMultiple || 0);
    const biasLabel = String(item.biasSignal?.label || 'Neutral');
    const biasClass = String(item.biasSignal?.tone || 'neutral').toLowerCase();
    const biasPct = Number(item.biasSignal?.confidencePct || 50);
    const unusualSignals = Array.isArray(item.unusualSignals) ? item.unusualSignals : [];
    const anomalyTag = item.isUnusual ? 'UNUSUAL' : 'NORMAL';
    const anomalyClass = item.isUnusual ? 'insider-anomaly-chip--high' : 'insider-anomaly-chip--normal';

    const card = document.createElement('article');
    card.className = `insider-trade-card insider-trade-card--${side}`;
    card.innerHTML = `
      <h4>${item.symbol} • ${side.toUpperCase()}</h4>
      <p><span class="insider-anomaly-chip ${anomalyClass}">${anomalyTag}</span> <strong>Anomaly score:</strong> ${anomalyScore}/100 • <strong>Filing vs baseline:</strong> ${unusualMultiple.toFixed(2)}x</p>
      <p><strong>Insider:</strong> ${item.insiderName || 'N/A'} (${role})</p>
      <p><strong>Shares:</strong> ${Number(item.shares || 0).toLocaleString()} • <strong>Avg price:</strong> ${fmtUsd(item.averagePriceUsd)}</p>
      <p><strong>Total trade:</strong> ${fmtUsd(item.valueUsd)} • <strong>Conviction:</strong> ${conviction}</p>
      <p><strong>Bias:</strong> <span class="insider-bias-chip insider-bias-chip--${biasClass}">${biasLabel}</span> • <strong>Confidence:</strong> ${fmtPct(biasPct)}</p>
      <p><strong>Stock reaction:</strong> <span class="insider-trade-reaction insider-trade-reaction--${reactionClass}">${reactionSign}${reactionPct.toFixed(2)}%</span></p>
      <p><strong>Unusual signals:</strong> ${unusualSignals.join(' • ') || 'N/A'}</p>
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
    sortBy: filters.sortBy,
    unusualOnly: String(filters.unusualOnly)
  });
  const payload = await fetchJson(`/api/market/insider-trades?${params.toString()}`);
  renderInsiderTrades(payload);
}

function setupPage() {
  const form = document.getElementById('insider-trades-page-form');
  const applyButton = document.getElementById('insider-page-apply');
  const unusualOnly = document.getElementById('insider-page-unusual-only');
  if (!form || !applyButton) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      setStatus('Loading insider trades...');
      applyButton.disabled = true;
      await loadInsiderTrades();
      setStatus('Insider trades updated.');
    } catch (error) {
      setStatus(error.message || 'Could not load insider trades.', true);
    } finally {
      applyButton.disabled = false;
    }
  });

  if (unusualOnly) {
    unusualOnly.addEventListener('change', async () => {
      try {
        setStatus('Refreshing insider anomaly feed...');
        await loadInsiderTrades();
        setStatus('Insider anomaly feed updated.');
      } catch (error) {
        setStatus(error.message || 'Could not refresh insider anomaly feed.', true);
      }
    });
  }
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
