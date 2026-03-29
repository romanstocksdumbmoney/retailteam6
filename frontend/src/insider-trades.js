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
  return `${sign}${numeric.toFixed(2)}%`;
}

function fmtWholePct(value) {
  return `${Math.max(0, Math.round(Number(value || 0)))}%`;
}

function setStatus(text, isError = false) {
  const node = document.getElementById('insider-page-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function getToneClass(label) {
  const normalized = String(label || '').toLowerCase();
  if (normalized === 'bullish') {
    return 'bullish';
  }
  if (normalized === 'bearish') {
    return 'bearish';
  }
  return 'neutral';
}

function buildLeaderboard(rows) {
  if (!rows.length) {
    return [];
  }
  const highestVolume = rows.reduce((best, row) => (
    Number(row.unusualVolumeMultiple || 0) > Number(best.unusualVolumeMultiple || 0) ? row : best
  ), rows[0]);
  const lowestVolume = rows.reduce((best, row) => (
    Number(row.unusualVolumeMultiple || 0) < Number(best.unusualVolumeMultiple || 0) ? row : best
  ), rows[0]);
  const largestTrade = rows.reduce((best, row) => (
    Number(row.valueUsd || 0) > Number(best.valueUsd || 0) ? row : best
  ), rows[0]);
  const smallestTrade = rows.reduce((best, row) => (
    Number(row.valueUsd || 0) < Number(best.valueUsd || 0) ? row : best
  ), rows[0]);
  return [
    {
      label: 'Highest Volume',
      value: `${highestVolume.symbol} • ${Number(highestVolume.unusualVolumeMultiple || 0).toFixed(2)}x`
    },
    {
      label: 'Lowest Volume',
      value: `${lowestVolume.symbol} • ${Number(lowestVolume.unusualVolumeMultiple || 0).toFixed(2)}x`
    },
    {
      label: 'Biggest Trade',
      value: `${largestTrade.symbol} • ${fmtUsd(largestTrade.valueUsd)}`
    },
    {
      label: 'Smallest Trade',
      value: `${smallestTrade.symbol} • ${fmtUsd(smallestTrade.valueUsd)}`
    }
  ];
}

function renderPage(payload) {
  const summaryTarget = document.getElementById('insider-page-summary');
  const leaderboardTarget = document.getElementById('insider-page-leaderboard');
  const listTarget = document.getElementById('insider-page-results');
  if (!summaryTarget || !leaderboardTarget || !listTarget) {
    return;
  }

  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const unusualCount = Number(payload?.unusualCount || 0);
  summaryTarget.innerHTML = `
    <article class="ai-trade-consensus">
      <h3>Insider Trade List</h3>
      <p><strong>Total trades:</strong> ${rows.length.toLocaleString()} • <strong>Unusual:</strong> ${unusualCount.toLocaleString()}</p>
      <p class="small-note">Auto-loaded. Updated ${payload.generatedAt ? new Date(payload.generatedAt).toLocaleString() : 'N/A'}</p>
    </article>
  `;

  const leaderboard = buildLeaderboard(rows);
  leaderboardTarget.innerHTML = leaderboard.length
    ? `
      <article class="ai-trade-consensus">
        <h3>Quick Leaders</h3>
        <div class="insider-trade-leader-grid">
          ${leaderboard.map((item) => `
            <div class="insider-trade-leader-chip">
              <p class="insider-trade-leader-chip__label">${item.label}</p>
              <p class="insider-trade-leader-chip__value">${item.value}</p>
            </div>
          `).join('')}
        </div>
      </article>
    `
    : '';

  listTarget.innerHTML = '';
  rows.forEach((item) => {
    const bias = item.directionalBias || {};
    const toneClass = getToneClass(bias.label);
    const confidencePct = Math.max(0, Math.min(100, Number(bias.confidencePct || 0)));
    const side = String(item.side || '').toLowerCase() === 'buy' ? 'BUY' : 'SELL';
    const filedAtLabel = item.filedAt ? new Date(item.filedAt).toLocaleString() : 'Filed recently';
    const reactionPct = Number(item.stockReactionPct || 0);

    const card = document.createElement('article');
    card.className = `insider-trade-list-row insider-trade-list-row--${toneClass}`;
    card.innerHTML = `
      <div class="insider-trade-list-row__head">
        <h4>${item.symbol} • ${side}</h4>
        <span class="insider-bias-chip insider-bias-chip--${toneClass}">${String(bias.label || 'neutral').toUpperCase()}</span>
      </div>
      <div class="insider-trade-list-row__bar">
        <span class="insider-trade-list-row__bar-fill insider-trade-list-row__bar-fill--${toneClass}" style="width:${confidencePct}%"></span>
      </div>
      <p><strong>${item.insiderName || 'N/A'}</strong> (${item.role || 'N/A'})</p>
      <p><strong>Trade size:</strong> ${fmtUsd(item.valueUsd)} • <strong>Volume:</strong> ${Number(item.unusualVolumeMultiple || 0).toFixed(2)}x • <strong>Shares:</strong> ${Number(item.shares || 0).toLocaleString()}</p>
      <p><strong>Bias %:</strong> Bullish ${fmtWholePct(bias.bullishPct)} • Bearish ${fmtWholePct(bias.bearishPct)} • Neutral ${fmtWholePct(bias.neutralPct)}</p>
      <p class="small-note">Reaction ${fmtPct(reactionPct)} • ${filedAtLabel}</p>
    `;
    listTarget.appendChild(card);
  });

  if (!rows.length) {
    listTarget.innerHTML = '<div class="pro-lock">No insider trades available right now.</div>';
  }
}

async function loadInsiderTrades() {
  const params = new URLSearchParams({
    limit: '30',
    sortBy: 'anomaly_desc',
    unusualOnly: 'false'
  });
  const payload = await fetchJson(`/api/market/insider-trades?${params.toString()}`);
  renderPage(payload);
}

function setupPage() {
  const refreshButton = document.getElementById('insider-page-refresh');
  if (!refreshButton) {
    return;
  }
  refreshButton.addEventListener('click', async () => {
    try {
      refreshButton.disabled = true;
      setStatus('Refreshing insider list...');
      await loadInsiderTrades();
      setStatus('Insider list updated.');
    } catch (error) {
      setStatus(error.message || 'Could not refresh insider list.', true);
    } finally {
      refreshButton.disabled = false;
    }
  });
}

async function init() {
  setupPage();
  try {
    setStatus('Loading insider list...');
    await loadInsiderTrades();
    setStatus('Insider list ready.');
  } catch (error) {
    setStatus(error.message || 'Could not load insider list.', true);
  }

  window.setInterval(() => {
    loadInsiderTrades().catch((_error) => {
      // Status text handles explicit refresh failures.
    });
  }, 60_000);
}

init();
