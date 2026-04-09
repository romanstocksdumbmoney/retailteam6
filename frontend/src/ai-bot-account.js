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

function getStoredToken() {
  return String(localStorage.getItem('dumbdollars_token') || '').trim();
}

function getAuthHeadersSafe() {
  if (typeof window.getAuthHeaders === 'function') {
    return window.getAuthHeaders();
  }
  const token = getStoredToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function tryRestoreSession() {
  if (typeof window.restoreSessionIfNeeded === 'function') {
    const restored = await window.restoreSessionIfNeeded();
    if (typeof restored === 'string') {
      return restored;
    }
    return String(restored?.token || '').trim();
  }
  return '';
}

async function requestWithAuthRetry(url, options = {}) {
  try {
    return await fetchJson(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...getAuthHeadersSafe()
      }
    });
  } catch (error) {
    if (error?.status !== 401) {
      throw error;
    }
    const restoredToken = await tryRestoreSession();
    if (!restoredToken) {
      throw error;
    }
    return fetchJson(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...getAuthHeadersSafe()
      }
    });
  }
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

function fmtRatio(value) {
  return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderExecutionCenter(execution) {
  const summaryTarget = document.getElementById('ai-account-execution-summary');
  const queueTarget = document.getElementById('ai-account-queued-ai-trades');
  const stepsTarget = document.getElementById('ai-account-broker-setup-steps');
  const ordersTarget = document.getElementById('ai-account-broker-orders');
  const proposalsTarget = document.getElementById('ai-account-trade-inbox');
  if (!summaryTarget || !queueTarget || !stepsTarget || !ordersTarget || !proposalsTarget) {
    return;
  }
  const brokerConnection = execution?.brokerConnection || {};
  const lastPlan = execution?.lastPlan || null;
  const lastBrokerExecution = execution?.lastBrokerExecution || null;
  const recentBrokerOrders = Array.isArray(execution?.recentBrokerOrders) ? execution.recentBrokerOrders : [];
  const snapshot = execution?.lastWebsiteSignalSnapshot || null;
  const setup = execution?.setup || {};
  const setupSteps = Array.isArray(setup.steps) ? setup.steps : [];
  const pendingSetupCount = setupSteps.filter((step) => !step.completed).length;
  const riskRewardGate = execution?.riskRewardGate || {};
  const proposals = Array.isArray(execution?.pendingTradeProposals) ? execution.pendingTradeProposals : [];
  const proposalsSummary = execution?.proposalsSummary || {};
  summaryTarget.innerHTML = `
    <article class="bot-position-card">
      <p><strong>Broker Bridge:</strong> ${brokerConnection.isConnected ? 'CONNECTED' : 'MANUAL / NOT CONNECTED'}</p>
      <p><strong>Broker:</strong> ${String(brokerConnection.broker || 'manual').toUpperCase()} • <strong>Mode:</strong> ${String(brokerConnection.bridgeMode || 'manual_confirmed').replace(/_/g, ' ')}</p>
      <p><strong>Hands-free live mode:</strong> ${lastPlan?.requiresApproval ? 'OFF (approval required)' : 'ON (AI auto-submit enabled)'}</p>
      <p><strong>Last Plan:</strong> ${lastPlan?.generatedAt || 'N/A'}</p>
      <p><strong>Plan Tickets:</strong> ${Number(lastPlan?.orderTickets?.length || 0)} • <strong>Manual Action:</strong> ${lastPlan?.manualActionRequired ? 'Yes' : 'No'}</p>
      <p><strong>Last Broker Submit:</strong> ${lastBrokerExecution?.submittedAt || 'N/A'} • <strong>Submitted:</strong> ${Number(lastBrokerExecution?.submittedCount || 0)} • <strong>Rejected:</strong> ${Number(lastBrokerExecution?.rejectedCount || 0)}</p>
      <p><strong>Website Inputs:</strong> AI queue ${Number(snapshot?.sources?.aiTradeQueue || 0)} • Trend ${Number(snapshot?.sources?.trendTrades || 0)} • High IV ${Number(snapshot?.sources?.highIvTracker || 0)}</p>
      <p><strong>Broker setup pending steps:</strong> ${pendingSetupCount}</p>
      <p><strong>Risk/Reward gate:</strong> min ${fmtRatio(riskRewardGate.minRewardRiskRatio || 0)} • pass ${Number(riskRewardGate.passed || 0)} / fail ${Number(riskRewardGate.rejected || 0)}</p>
      <p><strong>Pending trade proposals:</strong> ${Number(proposalsSummary.pending || proposals.length || 0)}</p>
      <p class="small-note">Setup docs: ${setup?.docsUrl ? `<a class="open-link" href="${setup.docsUrl}" target="_blank" rel="noopener noreferrer">${setup.docsUrl}</a>` : 'N/A'}</p>
      <p class="small-note">Ranked symbols: ${(snapshot?.rankedSymbols || []).slice(0, 6).join(', ') || 'N/A'}</p>
    </article>
  `;

  stepsTarget.innerHTML = '';
  if (!setupSteps.length) {
    stepsTarget.innerHTML = '<div class="pro-lock">No broker setup steps available.</div>';
  } else {
    setupSteps.forEach((step, index) => {
      const card = document.createElement('article');
      card.className = `bot-position-card ${step.completed ? 'bot-position-card--success' : 'bot-position-card--warning'}`;
      card.innerHTML = `
        <p><strong>Step ${index + 1}:</strong> ${step.title}</p>
        <p class="small-note">${step.description || ''}</p>
        <p class="small-note"><strong>Status:</strong> ${step.completed ? 'Complete' : 'Pending'}</p>
      `;
      stepsTarget.appendChild(card);
    });
  }

  ordersTarget.innerHTML = '';
  if (!recentBrokerOrders.length) {
    ordersTarget.innerHTML = '<div class="pro-lock">No broker order submissions yet. Run AI cycle, then execute broker tickets.</div>';
  } else {
    recentBrokerOrders.slice(0, 12).forEach((order) => {
      const card = document.createElement('article');
      card.className = `bot-position-card ${order.status === 'submitted' ? 'bot-position-card--success' : 'bot-position-card--warning'}`;
      card.innerHTML = `
        <p><strong>Ticket:</strong> ${order.ticketId || '-'}</p>
        <p><strong>Status:</strong> ${String(order.status || 'unknown').toUpperCase()} • <strong>Broker Order ID:</strong> ${order.brokerOrderId || 'N/A'}</p>
        <p><strong>Broker:</strong> ${String(order.broker || 'manual').toUpperCase()} • <strong>Symbol:</strong> ${order.orderPayload?.symbol || '-'}</p>
        <p><strong>Side/Qty:</strong> ${order.orderPayload?.side || '-'} / ${Number(order.orderPayload?.quantity || 0).toLocaleString()}</p>
        <p class="small-note">${order.submittedAt || 'N/A'}${order.reason ? ` • ${order.reason}` : ''}</p>
      `;
      ordersTarget.appendChild(card);
    });
  }

  proposalsTarget.innerHTML = '';
  if (!proposals.length) {
    proposalsTarget.innerHTML = '<div class="pro-lock">No pending trade proposals yet. Run AI cycle to generate risk/reward-filtered proposals.</div>';
  } else {
    const controls = document.createElement('article');
    controls.className = 'bot-position-card';
    controls.innerHTML = `
      <p><strong>Select proposals and submit:</strong> only selected rows are sent for broker execution.</p>
      <p class="small-note">AI already filtered proposals by your risk/reward rule.</p>
      <div class="ai-bot-actions">
        <button id="ai-account-select-all-proposals" class="btn-secondary" type="button">Select All</button>
        <button id="ai-account-clear-proposals" class="btn-secondary" type="button">Clear</button>
      </div>
    `;
    proposalsTarget.appendChild(controls);
    proposals.forEach((proposal, index) => {
      const row = document.createElement('article');
      row.className = 'bot-position-card';
      const ticketId = String(proposal.ticketId || '');
      const safeTicketId = escapeHtml(ticketId);
      const inputId = `trade-proposal-${index}`;
      row.innerHTML = `
        <label for="${inputId}" class="small-note">
          <input id="${inputId}" type="checkbox" class="trade-proposal-check" value="${safeTicketId}" />
          Take this trade
        </label>
        <h4>${proposal.ticker || '-'} • ${String(proposal.direction || 'long').toUpperCase()} <span class="chip">${proposal.sector || 'N/A'}</span></h4>
        <p><strong>Shares:</strong> ${Number(proposal.shares || 0).toLocaleString()} • <strong>Notional:</strong> ${fmtUsd(proposal.notionalUsd)}</p>
        <p><strong>Entry:</strong> ${fmtUsd(proposal.entry)} • <strong>Stop:</strong> ${fmtUsd(proposal.stopLoss)} • <strong>Take:</strong> ${fmtUsd(proposal.takeProfit)}</p>
        <p><strong>Risk/Reward:</strong> ${fmtRatio(proposal.rewardRiskRatio)} • <strong>Risk:</strong> ${fmtUsd(proposal.riskUsd)} • <strong>Reward:</strong> ${fmtUsd(proposal.potentialRewardUsd)}</p>
        <p class="small-note">Ticket: ${ticketId || '-'} • Proposed at: ${proposal.proposedAt || '-'}</p>
      `;
      proposalsTarget.appendChild(row);
    });
  }

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

function getSelectedProposalIds() {
  const selected = [];
  const checks = document.querySelectorAll('.trade-proposal-check');
  checks.forEach((node) => {
    if (node instanceof HTMLInputElement && node.checked) {
      const ticketId = String(node.value || '').trim();
      if (ticketId) {
        selected.push(ticketId);
      }
    }
  });
  return selected;
}

function setupProposalSelectionActions() {
  const selectAllButton = document.getElementById('ai-account-select-all-proposals');
  if (selectAllButton instanceof HTMLButtonElement) {
    selectAllButton.addEventListener('click', () => {
      const checks = document.querySelectorAll('.trade-proposal-check');
      checks.forEach((node) => {
        if (node instanceof HTMLInputElement) {
          node.checked = true;
        }
      });
    });
  }
  const clearButton = document.getElementById('ai-account-clear-proposals');
  if (clearButton instanceof HTMLButtonElement) {
    clearButton.addEventListener('click', () => {
      const checks = document.querySelectorAll('.trade-proposal-check');
      checks.forEach((node) => {
        if (node instanceof HTMLInputElement) {
          node.checked = false;
        }
      });
    });
  }
}

async function loadAccountView() {
  const payload = await requestWithAuthRetry('/api/market/auto-trader/account-view', {
    method: 'GET'
  });
  renderAccountSnapshot(payload);
  renderOpenPositions(payload.openPositions || []);
  renderExecutionCenter(payload.execution || null);
  setupProposalSelectionActions();
  renderFundingActivity(payload.activity?.recentFunding || []);
  renderCycleActivity(payload.activity?.recentCycles || []);
  return payload;
}

function setupActions() {
  const refreshButton = document.getElementById('ai-account-refresh');
  const runCycleButton = document.getElementById('ai-account-run-cycle');
  const executeOrdersButton = document.getElementById('ai-account-execute-orders');
  const executeSelectedButton = document.getElementById('ai-account-execute-selected');
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
        await requestWithAuthRetry('/api/market/auto-trader/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
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

  if (executeOrdersButton) {
    executeOrdersButton.addEventListener('click', async () => {
      try {
        executeOrdersButton.disabled = true;
        const selectedProposalIds = getSelectedProposalIds();
        setStatus(selectedProposalIds.length
          ? `Submitting ${selectedProposalIds.length} selected trade proposal(s)...`
          : 'Submitting all available broker tickets...');
        const payload = await requestWithAuthRetry('/api/market/auto-trader/execute-orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ticketIds: selectedProposalIds
          })
        });
        await loadAccountView();
        setStatus(`Broker submit complete. Submitted ${Number(payload.submittedCount || 0)} ticket(s), rejected ${Number(payload.rejectedCount || 0)}.`);
      } catch (error) {
        setStatus(error.message || 'Could not submit broker tickets.', true);
      } finally {
        executeOrdersButton.disabled = false;
      }
    });
  }

  if (executeSelectedButton) {
    executeSelectedButton.addEventListener('click', async () => {
      try {
        executeSelectedButton.disabled = true;
        const selectedProposalIds = getSelectedProposalIds();
        if (!selectedProposalIds.length) {
          setStatus('Select at least one trade proposal first.', true);
          return;
        }
        setStatus(`Submitting ${selectedProposalIds.length} selected trade proposal(s)...`);
        const payload = await requestWithAuthRetry('/api/market/auto-trader/execute-orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ticketIds: selectedProposalIds
          })
        });
        await loadAccountView();
        setStatus(`Selected trades submitted. Submitted ${Number(payload.submittedCount || 0)} ticket(s), rejected ${Number(payload.rejectedCount || 0)}.`);
      } catch (error) {
        setStatus(error.message || 'Could not submit selected trade proposals.', true);
      } finally {
        executeSelectedButton.disabled = false;
      }
    });
  }
}

async function init() {
  const token = getStoredToken() || await tryRestoreSession();
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
