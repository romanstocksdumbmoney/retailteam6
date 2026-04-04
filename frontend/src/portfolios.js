async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch (_error) {
      body = { message: `Request failed (${response.status})` };
    }
    const error = new Error(body.message || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function setStatus(text, isError = false) {
  const node = document.getElementById('portfolios-page-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(value) {
  const numeric = Number(value || 0);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(2)}%`;
}

function formatSortLabel(sortBy) {
  const key = String(sortBy || 'score_desc').trim().toLowerCase();
  const map = {
    score_desc: 'Top Score',
    ytd_desc: 'Top YTD',
    aum_desc: 'Largest AUM',
    activity_desc: 'Most Active'
  };
  return map[key] || key.replaceAll('_', ' ');
}

function mapSortForApi(rawSort) {
  const normalized = String(rawSort || '').trim().toLowerCase();
  if (normalized === 'performance_desc') {
    return 'ytd_desc';
  }
  if (normalized === 'aum_desc' || normalized === 'activity_desc' || normalized === 'score_desc' || normalized === 'ytd_desc') {
    return normalized;
  }
  return 'score_desc';
}

function renderRecentTrades(target, trades) {
  if (!target) {
    return;
  }
  const rows = Array.isArray(trades) ? trades : [];
  if (!rows.length) {
    target.innerHTML = '<div class="pro-lock">No recent trades reported.</div>';
    return;
  }
  target.innerHTML = rows.map((trade) => `
    <article class="stack-item">
      <p><strong>${trade.symbol}</strong> • ${String(trade.action || '').toUpperCase()} • ${fmtUsd(trade.notionalUsd)}</p>
      <p class="small-note">${trade.theme || 'Trade theme unavailable'} • ${trade.executedAt ? new Date(trade.executedAt).toLocaleString() : 'Recent'}</p>
    </article>
  `).join('');
}

function renderPortfolios(payload, appliedFilters) {
  const summaryTarget = document.getElementById('portfolios-page-summary');
  const boardTarget = document.getElementById('portfolios-page-results');
  if (!summaryTarget || !boardTarget) {
    return;
  }

  const allRows = Array.isArray(payload?.items) ? payload.items : [];
  const minPerformance = Number(appliedFilters.minPerformancePct || 0);
  const minAumUsd = Number(appliedFilters.minAumBillions || 0) * 1_000_000_000;
  const rows = allRows.filter((row) => {
    const ytd = Number(row?.performance?.ytdPct || 0);
    const aum = Number(row?.aumUsd || 0);
    return ytd >= minPerformance && aum >= minAumUsd;
  });

  summaryTarget.innerHTML = `
    <article class="ai-trade-consensus">
      <h3>Top Performing Portfolios</h3>
      <p><strong>Matches:</strong> ${rows.length} / ${allRows.length} • <strong>Sort:</strong> ${formatSortLabel(payload?.filters?.sortBy || appliedFilters.sortBy)}</p>
      <p><strong>Min YTD:</strong> ${minPerformance.toFixed(0)}% • <strong>Min AUM:</strong> ${appliedFilters.minAumBillions.toFixed(0)}B • <strong>Manager query:</strong> ${appliedFilters.manager || 'All'}</p>
      <p class="small-note">Generated: ${payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString() : 'N/A'} • Auto-refresh every ${Number(payload?.refreshCadenceSeconds || 60)}s</p>
    </article>
  `;

  boardTarget.innerHTML = '';
  if (!rows.length) {
    boardTarget.innerHTML = '<div class="pro-lock">No portfolios match your current filters. Lower the minimums and press Apply.</div>';
    return;
  }

  const topSignals = Array.isArray(payload?.topSignals) ? payload.topSignals : [];
  if (topSignals.length) {
    const signalsCard = document.createElement('article');
    signalsCard.className = 'ai-trade-consensus';
    signalsCard.innerHTML = `
      <h3>Top Trade Signals</h3>
      <ul class="detail-list">
        ${topSignals.slice(0, 6).map((signal) => `<li><strong>${signal.manager}</strong> • ${signal.symbol} ${String(signal.action || '').toUpperCase()} • ${fmtUsd(signal.notionalUsd)}</li>`).join('')}
      </ul>
    `;
    boardTarget.appendChild(signalsCard);
  }

  rows.forEach((portfolio) => {
    const card = document.createElement('article');
    card.className = 'ai-trade-consensus';
    const holdings = Array.isArray(portfolio.topHoldings) ? portfolio.topHoldings : [];
    const holdingsHtml = holdings.map((holding) => (
      `<li><strong>${holding.symbol}</strong> • ${fmtPct(holding.weightPct)} weight • ${fmtUsd(holding.positionValueUsd)} • ${fmtPct(holding.dayMovePct)} today</li>`
    )).join('');
    card.innerHTML = `
      <h3>${portfolio.manager} • ${portfolio.firm}</h3>
      <p><strong>Style:</strong> ${portfolio.style} • <strong>AUM:</strong> ${fmtUsd(portfolio.aumUsd)}</p>
      <p><strong>YTD:</strong> ${fmtPct(portfolio.performance?.ytdPct)} • <strong>1Y:</strong> ${fmtPct(portfolio.performance?.oneYearPct)} • <strong>Sharpe:</strong> ${Number(portfolio.performance?.sharpeRatio || 0).toFixed(2)}</p>
      <p><strong>Max DD:</strong> ${fmtPct(portfolio.performance?.maxDrawdownPct)} • <strong>24h Trades:</strong> ${Number(portfolio.activity?.trades24h || 0)}</p>
      <p class="small-note"><strong>Score:</strong> ${Number(portfolio.qualityScore || 0)} / 100 • Last trade ${portfolio.activity?.latestTradeAt ? new Date(portfolio.activity.latestTradeAt).toLocaleString() : 'N/A'}</p>
      <h4>Top Holdings</h4>
      <ul class="detail-list">${holdingsHtml || '<li>No holdings available.</li>'}</ul>
      <h4>Recent Trades</h4>
      <div class="stack" id="portfolio-moves-${portfolio.id}"></div>
    `;
    boardTarget.appendChild(card);
    renderRecentTrades(document.getElementById(`portfolio-moves-${portfolio.id}`), portfolio.recentTrades || []);
  });
}

function readFilters() {
  const manager = String(document.getElementById('portfolios-manager-input')?.value || '').trim();
  const minPerformanceRaw = Number(document.getElementById('portfolios-min-performance-input')?.value || 0);
  const minAumRaw = Number(document.getElementById('portfolios-min-aum-input')?.value || 0);
  const sortByRaw = String(document.getElementById('portfolios-sort-select')?.value || 'score_desc').trim().toLowerCase();
  return {
    manager,
    minPerformancePct: Number.isFinite(minPerformanceRaw) ? Math.max(0, minPerformanceRaw) : 0,
    minAumBillions: Number.isFinite(minAumRaw) ? Math.max(0, minAumRaw) : 0,
    sortBy: mapSortForApi(sortByRaw)
  };
}

async function loadPortfolios() {
  const filters = readFilters();
  const params = new URLSearchParams({
    limit: '12',
    manager: filters.manager,
    sortBy: filters.sortBy
  });
  let payload;
  try {
    payload = await fetchJson(`/api/market/top-portfolios?${params.toString()}`);
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
    // Backward-compatible fallback if a stale server build still exposes legacy route naming.
    payload = await fetchJson(`/api/market/portfolio-tracker?${params.toString()}`);
  }
  renderPortfolios(payload, filters);
}

function setupFilters() {
  const form = document.getElementById('portfolios-page-form');
  const applyButton = document.getElementById('portfolios-apply');
  if (!form) {
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      if (applyButton) {
        applyButton.disabled = true;
      }
      setStatus('Loading portfolios...');
      await loadPortfolios();
      setStatus('Portfolio view updated.');
    } catch (error) {
      setStatus(error.message || 'Could not load portfolios.', true);
    } finally {
      if (applyButton) {
        applyButton.disabled = false;
      }
    }
  });
}

async function init() {
  setupFilters();
  try {
    setStatus('Loading portfolios...');
    await loadPortfolios();
    setStatus('Top portfolios loaded.');
  } catch (error) {
    setStatus(error.message || 'Could not load portfolios.', true);
  }

  window.setInterval(() => {
    loadPortfolios().catch((error) => {
      setStatus(error.message || 'Auto-refresh failed.', true);
    });
  }, 60_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    loadPortfolios().catch((_error) => {
      // Auto-refresh errors are surfaced in the periodic loop/status.
    });
  });
}

init();
