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

function setStatus(text, isError = false) {
  const node = document.getElementById('portfolios-status');
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

function renderMoves(target, moves) {
  if (!target) {
    return;
  }
  target.innerHTML = '';
  const rows = Array.isArray(moves) ? moves : [];
  if (!rows.length) {
    target.innerHTML = '<div class="pro-lock">No recent portfolio trades detected.</div>';
    return;
  }
  rows.forEach((move) => {
    const side = String(move.side || '').toLowerCase() === 'buy' ? 'buy' : 'sell';
    const card = document.createElement('article');
    card.className = `insider-trade-card insider-trade-card--${side}`;
    card.innerHTML = `
      <h4>${move.symbol} • ${side.toUpperCase()}</h4>
      <p><strong>Shares:</strong> ${Number(move.shares || 0).toLocaleString()} @ ${fmtUsd(move.priceUsd)}</p>
      <p><strong>Notional:</strong> ${fmtUsd(move.notionalUsd)} • <strong>Weight:</strong> ${fmtPct(move.weightChangePct || 0)}</p>
      <p class="small-note">${move.executedAtLabel || 'Recent'} • ${move.rationale || ''}</p>
    `;
    target.appendChild(card);
  });
}

function renderPortfolios(payload) {
  const summaryTarget = document.getElementById('portfolios-summary');
  const boardTarget = document.getElementById('portfolios-board');
  if (!summaryTarget || !boardTarget) {
    return;
  }
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  summaryTarget.innerHTML = `
    <article class="ai-trade-consensus">
      <h3>Top Performing Portfolios</h3>
      <p><strong>Benchmarked universe:</strong> ${payload?.universe || 'Large-cap US equities'}</p>
      <p><strong>Data mode:</strong> ${payload?.dataNature || 'simulated'} • <strong>Generated:</strong> ${payload?.generatedAt ? new Date(payload.generatedAt).toLocaleString() : 'N/A'}</p>
      <p class="small-note">Feed auto-refreshes every 60 seconds to keep holdings and trade updates current.</p>
    </article>
  `;
  boardTarget.innerHTML = '';

  if (!rows.length) {
    boardTarget.innerHTML = '<div class="pro-lock">No portfolio entries available right now.</div>';
    return;
  }

  rows.forEach((portfolio) => {
    const card = document.createElement('article');
    card.className = 'ai-trade-consensus';
    const holdings = Array.isArray(portfolio.topHoldings) ? portfolio.topHoldings : [];
    const holdingsHtml = holdings.map((holding) => (
      `<li><strong>${holding.symbol}</strong> • ${fmtPct(holding.weightPct)} weight • ${fmtPct(holding.returnPct)} return</li>`
    )).join('');
    card.innerHTML = `
      <h3>${portfolio.managerName} • ${portfolio.firm}</h3>
      <p><strong>Style:</strong> ${portfolio.style} • <strong>AUM:</strong> ${fmtUsd(portfolio.assetsUnderManagementUsd)}</p>
      <p><strong>YTD:</strong> ${fmtPct(portfolio.performanceYtdPct)} • <strong>1Y:</strong> ${fmtPct(portfolio.performanceOneYearPct)} • <strong>Sharpe:</strong> ${Number(portfolio.sharpeRatio || 0).toFixed(2)}</p>
      <p><strong>Turnover:</strong> ${fmtPct(portfolio.turnoverPct)} • <strong>Last rebalance:</strong> ${portfolio.lastRebalanceDate || 'N/A'}</p>
      <p class="small-note">${portfolio.screenTag || 'High-conviction portfolio'}</p>
      <h4>Top Holdings</h4>
      <ul class="detail-list">${holdingsHtml || '<li>No holdings available.</li>'}</ul>
      <h4>Recent Trades</h4>
      <div class="stack" id="portfolio-moves-${portfolio.id}"></div>
    `;
    boardTarget.appendChild(card);
    const movesTarget = document.getElementById(`portfolio-moves-${portfolio.id}`);
    renderMoves(movesTarget, portfolio.recentTrades || []);
  });
}

function readFilters() {
  const manager = String(document.getElementById('portfolio-manager-filter')?.value || '').trim();
  const symbol = String(document.getElementById('portfolio-symbol-filter')?.value || '').trim().toUpperCase();
  const sortBy = String(document.getElementById('portfolio-sort-filter')?.value || 'performance_desc').trim().toLowerCase();
  return { manager, symbol, sortBy };
}

async function loadPortfolios() {
  const filters = readFilters();
  const params = new URLSearchParams({
    limit: '8',
    manager: filters.manager,
    symbol: filters.symbol,
    sortBy: filters.sortBy
  });
  const payload = await fetchJson(`/api/market/portfolios?${params.toString()}`);
  renderPortfolios(payload);
}

function setupFilters() {
  const form = document.getElementById('portfolios-filter-form');
  if (!form) {
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      setStatus('Loading portfolios...');
      await loadPortfolios();
      setStatus('Portfolio view updated.');
    } catch (error) {
      setStatus(error.message || 'Could not load portfolios.', true);
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
}

init();
