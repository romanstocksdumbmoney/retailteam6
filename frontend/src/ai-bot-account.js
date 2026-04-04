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

function getAuthHeaders() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    return {};
  }
  return {
    authorization: `Bearer ${token}`
  };
}

function setStatus(text, isError = false) {
  const node = document.getElementById('ai-account-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function renderAccountSnapshot(payload) {
  const summaryTarget = document.getElementById('ai-account-summary');
  const portfolioTarget = document.getElementById('ai-account-portfolio');
  const safetyTarget = document.getElementById('ai-account-safety');
  if (!summaryTarget || !portfolioTarget || !safetyTarget) {
    return;
  }
  if (!payload) {
    summaryTarget.innerHTML = '<div class="pro-lock">No account data available.</div>';
    portfolioTarget.innerHTML = '<div class="pro-lock">No portfolio data available.</div>';
    safetyTarget.innerHTML = '<div class="pro-lock">No safety profile available.</div>';
    return;
  }
  const account = payload.account || {};
  const bot = payload.bot || {};
  const portfolio = payload.portfolio || {};
  summaryTarget.innerHTML = `
    <article class="bot-position-card">
      <h4>${String(account.broker || 'manual').toUpperCase()} • ${account.accountReference || 'AI-ACCOUNT'}</h4>
      <p><strong>Account Label:</strong> ${account.accountLabel || 'live-account'}</p>
      <p><strong>Status:</strong> ${String(account.status || 'not_funded').toUpperCase()}</p>
      <p><strong>Execution Mode:</strong> ${String(account.executionMode || 'manual_confirmed').replace(/_/g, ' ')}</p>
      <p><strong>Bot:</strong> ${(bot.tradingMode || 'paper').toUpperCase()} • ${bot.isActive ? 'ACTIVE' : 'PAUSED'}</p>
      <p><strong>Total Funded:</strong> ${fmtUsd(account.fundedUsd)}</p>
      <p><strong>Funded At:</strong> ${account.fundedAt || 'N/A'}</p>
    </article>
  `;
  portfolioTarget.innerHTML = `
    <article class="ai-account-tile-grid">
      <div class="ai-account-tile">
        <h4>Cash</h4>
        <p>${fmtUsd(portfolio.cashUsd)}</p>
      </div>
      <div class="ai-account-tile">
        <h4>Open Exposure</h4>
        <p>${fmtUsd(portfolio.openExposureUsd)}</p>
      </div>
      <div class="ai-account-tile">
        <h4>Equity</h4>
        <p>${fmtUsd(portfolio.equityUsd)}</p>
      </div>
      <div class="ai-account-tile">
        <h4>Realized PnL</h4>
        <p>${fmtUsd(portfolio.realizedPnlUsd)}</p>
      </div>
      <div class="ai-account-tile">
        <h4>Unrealized PnL</h4>
        <p>${fmtUsd(portfolio.unrealizedPnlUsd)}</p>
      </div>
      <div class="ai-account-tile">
        <h4>Open Positions</h4>
        <p>${Number(portfolio.openPositionsCount || 0).toLocaleString()}</p>
      </div>
    </article>
  `;
  safetyTarget.innerHTML = `
    <article class="bot-position-card bot-position-card--compact">
      <p><strong>Mode:</strong> ${String(payload.safety?.mode || bot.tradingMode || 'paper').replace(/_/g, ' ').toUpperCase()}</p>
      <p>${payload.safety?.disclaimer || 'Manual safety flow active.'}</p>
      <p class="small-note"><strong>Updated:</strong> ${bot.updatedAt || 'N/A'}</p>
    </article>
  `;
}

function renderOpenPositions(rows) {
  const target = document.getElementById('ai-account-open-positions');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  const positions = Array.isArray(rows) ? rows : [];
  if (!positions.length) {
    target.innerHTML = '<div class="pro-lock">No open positions right now.</div>';
    return;
  }
  positions.forEach((row) => {
    const card = document.createElement('article');
    card.className = 'bot-position-card';
    card.innerHTML = `
      <h4>${row.ticker} • ${String(row.direction || 'long').toUpperCase()}</h4>
      <p><strong>Shares:</strong> ${Number(row.shares || 0).toLocaleString()}</p>
      <p><strong>Entry:</strong> ${fmtUsd(row.entry)}</p>
      <p><strong>Mark:</strong> ${fmtUsd(row.markPrice)}</p>
      <p><strong>Market Value:</strong> ${fmtUsd(row.marketValueUsd)}</p>
      <p><strong>Unrealized:</strong> ${fmtUsd(row.unrealizedPnlUsd)}</p>
      <p><strong>Stop / Take:</strong> ${fmtUsd(row.stopLoss)} / ${fmtUsd(row.takeProfit)}</p>
      <p class="small-note">${row.sector || 'N/A'} • opened ${row.openedAt || 'N/A'}</p>
    `;
    target.appendChild(card);
  });
}

function renderFundingActivity(rows) {
  const target = document.getElementById('ai-account-funding-activity');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) {
    target.innerHTML = '<div class="pro-lock">No funding transactions yet.</div>';
    return;
  }
  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'bot-position-card';
    card.innerHTML = `
      <p><strong>${fmtUsd(item.amountUsd)}</strong> • ${String(item.status || 'completed').toUpperCase()}</p>
      <p><strong>Broker:</strong> ${item.broker || 'manual'} • <strong>Rail:</strong> ${item.paymentRail || 'bank_transfer'}</p>
      <p><strong>Reference:</strong> ${item.transactionId || '-'}</p>
      <p class="small-note">${item.fundedAt || '-'}</p>
    `;
    target.appendChild(card);
  });
}

function renderCycleActivity(rows) {
  const target = document.getElementById('ai-account-cycle-activity');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) {
    target.innerHTML = '<div class="pro-lock">No cycle activity yet.</div>';
    return;
  }
  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'bot-position-card';
    card.innerHTML = `
      <p><strong>Cycle:</strong> ${item.cycleId || '-'}</p>
      <p><strong>Mode:</strong> ${String(item.mode || 'paper').toUpperCase()}</p>
      <p><strong>Cash:</strong> ${fmtUsd(item.startedCashUsd)} → ${fmtUsd(item.endingCashUsd)}</p>
      <p><strong>Opened:</strong> ${Number(item.openedPositionsCount || 0)} • <strong>Closed:</strong> ${Number(item.closedPositionsCount || 0)}</p>
      <p><strong>Closed PnL:</strong> ${fmtUsd(item.closedPnlUsd)}</p>
      <p class="small-note">${item.executedAt || '-'}</p>
    `;
    target.appendChild(card);
  });
}

function renderExecutionCenter(execution) {
  const summaryTarget = document.getElementById('ai-account-execution-summary');
  const queueTarget = document.getElementById('ai-account-queued-ai-trades');
  if (!summaryTarget || !queueTarget) {
    return;
  }
  const brokerConnection = execution?.brokerConnection || {};
  const lastPlan = execution?.lastPlan || null;
  const snapshot = execution?.lastWebsiteSignalSnapshot || null;
  summaryTarget.innerHTML = `
    <article class="bot-position-card">
      <p><strong>Broker Bridge:</strong> ${brokerConnection.isConnected ? 'CONNECTED' : 'MANUAL / NOT CONNECTED'}</p>
      <p><strong>Broker:</strong> ${String(brokerConnection.broker || 'manual').toUpperCase()} • <strong>Mode:</strong> ${String(brokerConnection.bridgeMode || 'manual_confirmed').replace(/_/g, ' ')}</p>
      <p><strong>Last Plan:</strong> ${lastPlan?.generatedAt || 'N/A'}</p>
      <p><strong>Plan Tickets:</strong> ${Number(lastPlan?.orderTickets?.length || 0)} • <strong>Manual Action:</strong> ${lastPlan?.manualActionRequired ? 'Yes' : 'No'}</p>
      <p><strong>Website Inputs:</strong> AI queue ${Number(snapshot?.sources?.aiTradeQueue || 0)} • Trend ${Number(snapshot?.sources?.trendTrades || 0)} • High IV ${Number(snapshot?.sources?.highIvTracker || 0)}</p>
      <p class="small-note">Ranked symbols: ${(snapshot?.rankedSymbols || []).slice(0, 6).join(', ') || 'N/A'}</p>
    </article>
  `;

  const queued = Array.isArray(execution?.queuedAiTrades) ? execution.queuedAiTrades : [];
  queueTarget.innerHTML = '';
  if (!queued.length) {
    queueTarget.innerHTML = '<div class="pro-lock">No queued AI trade setups yet. Queue from AI Trade page.</div>';
    return;
  }
  queued.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'bot-position-card';
    card.innerHTML = `
      <h4>${item.symbol} • ${String(item.trend || 'bullish').toUpperCase()}</h4>
      <p><strong>Status:</strong> ${String(item.status || 'pending').toUpperCase()}</p>
      <p><strong>Confidence:</strong> ${Number(item.confidencePct || 0)}% • <strong>Timeframe:</strong> ${item.timeframe || 'intraday'}</p>
      <p><strong>Entry / Stop / Take:</strong> ${fmtUsd(item.entryPrice)} / ${fmtUsd(item.stopLoss)} / ${fmtUsd(item.takeProfit)}</p>
      <p class="small-note">Queued: ${item.queuedAt || 'N/A'}</p>
    `;
    queueTarget.appendChild(card);
  });
}

async function loadAccountView() {
  const payload = await fetchJson('/api/market/auto-trader/account-view', {
    headers: getAuthHeaders()
  });
  renderAccountSnapshot(payload);
  renderOpenPositions(payload.openPositions || []);
  renderExecutionCenter(payload.execution || null);
  renderFundingActivity(payload.activity?.recentFunding || []);
  renderCycleActivity(payload.activity?.recentCycles || []);
  return payload;
}

function setupActions() {
  const refreshButton = document.getElementById('ai-account-refresh');
  const runCycleButton = document.getElementById('ai-account-run-cycle');
  const openFundingButton = document.getElementById('ai-account-back-funding');
  const openBrokerOnboardingButton = document.getElementById('ai-account-open-brokerage');

  if (openFundingButton) {
    openFundingButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-funding.html';
    });
  }

  if (openBrokerOnboardingButton) {
    openBrokerOnboardingButton.addEventListener('click', () => {
      window.location.href = '/brokerage-onboarding.html';
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      try {
        refreshButton.disabled = true;
        setStatus('Refreshing account view...');
        await loadAccountView();
        setStatus('Account view refreshed.');
      } catch (error) {
        setStatus(error.message || 'Could not refresh account view.', true);
      } finally {
        refreshButton.disabled = false;
      }
    });
  }

  if (runCycleButton) {
    runCycleButton.addEventListener('click', async () => {
      try {
        runCycleButton.disabled = true;
        setStatus('Running AI cycle...');
        await fetchJson('/api/market/auto-trader/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({})
        });
        await loadAccountView();
        setStatus('Cycle complete. Account view updated.');
      } catch (error) {
        setStatus(error.message || 'Could not run AI cycle.', true);
      } finally {
        runCycleButton.disabled = false;
      }
    });
  }
}

async function init() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    setStatus('Please log in to view the AI brokerage account.', true);
    return;
  }
  setupActions();
  try {
    await loadAccountView();
    setStatus('AI brokerage account view ready.');
  } catch (error) {
    setStatus(error.message || 'Could not load AI brokerage account view.', true);
  }
}

init();
