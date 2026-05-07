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

let brokerModalInstance = null;

const SETUP_PROGRESS_AUTOPILOT_STARTED_KEY = 'dumbdollars_setup_autopilot_started_at';
let activeAccountPayload = null;

function markAutopilotProgress() {
  try {
    localStorage.setItem(SETUP_PROGRESS_AUTOPILOT_STARTED_KEY, new Date().toISOString());
  } catch (_error) {
    // Ignore storage failures.
  }
}

function setStatus(text, isError = false) {
  const node = document.getElementById('ai-account-status');
  if (!node) {
    return;
  }
  if (typeof window.clearSignInCallout === 'function') {
    window.clearSignInCallout('ai-account-status');
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function showSignInNeeded(message = 'Please log in to view the AI brokerage account.') {
  const nextPath = `${window.location.pathname || '/ai-bot-account.html'}${window.location.search || ''}${window.location.hash || ''}`;
  if (typeof window.showSignInCallout === 'function') {
    window.showSignInCallout({
      statusElementId: 'ai-account-status',
      message,
      nextPath,
      linkLabel: 'Sign in to continue'
    });
    return;
  }
  setStatus(message, true);
}

function fmtUsd(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '--';
  }
  return `$${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtRatio(value) {
  return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}x`;
}

function fmtPct(value) {
  return `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function setButtonBusy(button, busy, busyLabel = 'Working...') {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  if (!button.dataset.idleLabel) {
    button.dataset.idleLabel = button.textContent || '';
  }
  button.disabled = busy;
  button.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (busy) {
    button.classList.add('is-loading');
    button.textContent = busyLabel;
  } else {
    button.classList.remove('is-loading');
    button.textContent = button.dataset.idleLabel || '';
  }
}

function ensureBrokerModal() {
  if (brokerModalInstance || typeof window.createBrokerConnectionModal !== 'function') {
    return brokerModalInstance;
  }
  brokerModalInstance = window.createBrokerConnectionModal({
    authFetch: requestWithAuthRetry,
    onSaved: async () => {
      await loadAccountView().catch(() => {});
      await loadBrokerStatusWidget().catch(() => {});
    }
  });
  brokerModalInstance.mount();
  return brokerModalInstance;
}

function relativeTimeFromIso(isoValue) {
  const parsed = Date.parse(String(isoValue || ''));
  if (!Number.isFinite(parsed)) {
    return 'Never';
  }
  const diffMs = Date.now() - parsed;
  const minutes = Math.max(0, Math.floor(diffMs / (60 * 1000)));
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function setBrokerWarning(text = '', tone = 'warning') {
  const node = document.getElementById('broker-widget-warning');
  if (!node) {
    return;
  }
  const hasText = Boolean(String(text || '').trim());
  node.hidden = !hasText;
  node.textContent = hasText ? String(text) : '';
  node.className = tone === 'error' ? 'broker-warning-card broker-warning-card--error' : 'broker-warning-card';
}

async function loadBrokerStatusWidget() {
  const payload = await requestWithAuthRetry('/api/broker/status', { method: 'GET' });
  const refreshButton = document.getElementById('broker-widget-refresh');
  const changeButton = document.getElementById('broker-widget-change-keys');
  const switchButton = document.getElementById('broker-widget-switch-mode');
  const pill = document.getElementById('broker-widget-pill');
  const brokerName = document.getElementById('broker-widget-name');
  const modeNode = document.getElementById('broker-widget-mode');
  const accountNode = document.getElementById('broker-widget-account');
  const buyingPowerNode = document.getElementById('broker-widget-buying-power');
  const lastVerifiedNode = document.getElementById('broker-widget-last-verified');

  const status = String(payload?.status || 'disconnected').toLowerCase();
  const connected = Boolean(payload?.connected);
  const mode = String(payload?.trading_mode || 'paper').toLowerCase();
  const modeLabel = mode === 'live' ? 'Live Trading' : 'Paper Trading';
  const nextMode = mode === 'live' ? 'paper' : 'live';

  if (pill) {
    const statusLabel = connected ? 'Connected' : status === 'needs_attention' ? 'Needs attention' : 'Disconnected';
    pill.textContent = statusLabel;
    pill.className = connected
      ? 'broker-status-pill broker-status-pill--connected'
      : status === 'needs_attention'
        ? 'broker-status-pill broker-status-pill--attention'
        : 'broker-status-pill broker-status-pill--disconnected';
  }
  if (brokerName) {
    brokerName.textContent = payload?.broker ? String(payload.broker).toUpperCase() : 'Not connected';
  }
  if (modeNode) {
    modeNode.textContent = modeLabel;
  }
  if (accountNode) {
    accountNode.textContent = payload?.account_masked || '—';
  }
  if (buyingPowerNode) {
    buyingPowerNode.textContent = fmtUsd(payload?.buying_power || 0);
  }
  if (lastVerifiedNode) {
    lastVerifiedNode.textContent = relativeTimeFromIso(payload?.last_tested || '');
  }
  if (switchButton instanceof HTMLButtonElement) {
    switchButton.textContent = nextMode === 'live' ? 'Switch to Live' : 'Switch to Paper';
    switchButton.setAttribute('data-target-mode', nextMode);
  }
  if (refreshButton instanceof HTMLButtonElement) {
    refreshButton.textContent = connected ? 'Refresh Connection' : (status === 'needs_attention' ? 'Reconnect →' : 'Refresh Connection');
  }
  if (changeButton instanceof HTMLButtonElement) {
    changeButton.textContent = connected ? 'Change Keys' : 'Connect Broker Now →';
  }

  if (!connected && status === 'needs_attention') {
    setBrokerWarning('❌ Broker connection lost. The bot has been paused automatically. Check your API keys.', 'error');
  } else if (!connected) {
    setBrokerWarning('⚠ No broker connected — the bot cannot trade. Connect your broker API keys to enable automated trading.', 'warning');
  } else if (payload?.rotate_recommended) {
    setBrokerWarning('Your API keys are 90 days old. Consider rotating them for security.', 'warning');
  } else {
    setBrokerWarning('');
  }
  return payload;
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

function renderTradeHistorySection(rows, targetId, emptyText) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }
  const items = Array.isArray(rows) ? rows : [];
  target.innerHTML = '';
  if (!items.length) {
    target.innerHTML = `<div class="pro-lock">${escapeHtml(emptyText)}</div>`;
    return;
  }
  items.slice(0, 20).forEach((row) => {
    const card = document.createElement('article');
    card.className = 'bot-position-card';
    card.innerHTML = `
      <h4>${escapeHtml(row.ticker || '-')} • ${escapeHtml(String(row.direction || 'long').toUpperCase())}</h4>
      <p><strong>Status:</strong> ${escapeHtml(String(row.status || 'unknown').toUpperCase())}</p>
      <p><strong>Entry / Stop / Take:</strong> ${fmtUsd(row.entryPrice || row.entry)} / ${fmtUsd(row.stopLoss)} / ${fmtUsd(row.takeProfit)}</p>
      <p><strong>Max Loss:</strong> ${fmtUsd(row.maxLossUsd || row.riskUsd)} • <strong>Risk Level:</strong> ${escapeHtml(row.riskLevel || 'N/A')}</p>
      <p><strong>PnL:</strong> ${fmtUsd(row.pnlUsd || 0)} • <strong>Result:</strong> ${escapeHtml(String(row.result || '-').replace(/_/g, ' '))}</p>
      <p class="small-note">${escapeHtml(row.openedAt || row.closedAt || '-')}</p>
    `;
    target.appendChild(card);
  });
}

function renderTradeIdeas(execution) {
  const target = document.getElementById('ai-account-trade-ideas');
  if (!target) {
    return;
  }
  const ideas = Array.isArray(execution?.tradeIdeas) ? execution.tradeIdeas : [];
  target.innerHTML = '';
  if (!ideas.length) {
    target.innerHTML = '<div class="pro-lock">No pending AI trade ideas right now. Run a new AI cycle to generate ideas.</div>';
    return;
  }
  ideas.forEach((idea) => {
    const card = document.createElement('article');
    card.className = `bot-position-card ${idea?.riskCheck?.ok === false ? 'bot-position-card--warning' : ''}`;
    const blockedReasons = Array.isArray(idea?.riskCheck?.blocks) ? idea.riskCheck.blocks : [];
    const blockedHtml = blockedReasons.length
      ? `<p class="small-note auth-error"><strong>Blocked by Risk Manager:</strong> ${blockedReasons.map((code) => escapeHtml(String(code).replace(/_/g, ' '))).join(', ')}</p>`
      : '';
    card.innerHTML = `
      <h4>${escapeHtml(idea.symbol || idea.ticker || '-')} • ${escapeHtml(idea.directionLabel || idea.direction || 'Buy')}</h4>
      <p><strong>Entry:</strong> ${fmtUsd(idea.entry)} • <strong>Stop Loss:</strong> ${fmtUsd(idea.stopLoss)} • <strong>Take Profit:</strong> ${fmtUsd(idea.takeProfit)}</p>
      <p><strong>Max Loss:</strong> ${fmtUsd(idea.maxLoss || idea.maxLossUsd)} • <strong>Risk Level:</strong> ${escapeHtml(idea.riskLevel || 'N/A')}</p>
      <p><strong>Confidence Score:</strong> ${Number(idea.confidenceScore || 0)}%</p>
      <p><strong>Why AI Likes This:</strong> ${escapeHtml(idea.whyAiLikesThis || 'Signal alignment from market inputs and prompt controls.')}</p>
      ${blockedHtml}
      <div class="ai-bot-actions">
        <button type="button" class="btn-secondary" data-action="approve-trade-idea" data-ticket-id="${escapeHtml(idea.ticketId || '')}" ${idea?.riskCheck?.ok === false ? 'disabled' : ''}>Approve Trade</button>
        <button type="button" class="btn-secondary" data-action="cancel-trade-idea" data-ticket-id="${escapeHtml(idea.ticketId || '')}">Cancel Trade</button>
      </div>
    `;
    target.appendChild(card);
  });
}

async function approveTradeIdea(ticketId, button) {
  if (!ticketId) {
    return;
  }
  setButtonBusy(button, true, 'Approving...');
  try {
    await requestWithAuthRetry(`/api/market/auto-trader/trade-ideas/${encodeURIComponent(ticketId)}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    await loadAccountView();
    setStatus('Trade idea approved and moved into open trades.');
  } catch (error) {
    setStatus(error.message || 'Could not approve trade idea.', true);
  } finally {
    setButtonBusy(button, false);
  }
}

async function cancelTradeIdea(ticketId, button) {
  if (!ticketId) {
    return;
  }
  setButtonBusy(button, true, 'Cancelling...');
  try {
    await requestWithAuthRetry(`/api/market/auto-trader/trade-ideas/${encodeURIComponent(ticketId)}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    await loadAccountView();
    setStatus('Trade idea cancelled.');
  } catch (error) {
    setStatus(error.message || 'Could not cancel trade idea.', true);
  } finally {
    setButtonBusy(button, false);
  }
}

function renderExecutionCenter(execution) {
  const summaryTarget = document.getElementById('ai-account-execution-summary');
  const queueTarget = document.getElementById('ai-account-queued-ai-trades');
  const stepsTarget = document.getElementById('ai-account-broker-setup-steps');
  const ordersTarget = document.getElementById('ai-account-broker-orders');
  if (!summaryTarget || !queueTarget || !stepsTarget || !ordersTarget) {
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
  const sourceAudit = snapshot?.sourceAudit || {};
  const sourceAuditDetails = execution?.sourceAuditDetails || {};
  const auth = brokerConnection?.auth || {};
  const brokerExecutionPath = String(
    execution?.lastBrokerExecution?.executionPath
    || auth?.brokerApiMode
    || 'simulated'
  ).toLowerCase();
  const executionPathLabel = brokerExecutionPath === 'real_api' || brokerExecutionPath === 'real'
    ? 'REAL API'
    : 'SIMULATED';
  const amplifiedSources = [
    { label: 'AI Trade queue', count: Number(snapshot?.sources?.aiTradeQueue || 0), note: 'chart-upload setups with entry/stop/take levels' },
    { label: 'Trend Trades', count: Number(snapshot?.sources?.trendTrades || 0), note: 'social momentum and unusual attention signals' },
    { label: 'High IV Tracker', count: Number(snapshot?.sources?.highIvTracker || 0), note: 'elevated options-volatility context' }
  ];
  const amplifiedSummary = amplifiedSources
    .map((source) => `${source.label}: ${source.count}`)
    .join(' • ');
  summaryTarget.innerHTML = `
    <article class="bot-position-card">
      <p><strong>Broker Bridge:</strong> ${brokerConnection.isConnected ? 'CONNECTED' : 'MANUAL / NOT CONNECTED'}</p>
      <p><strong>Broker:</strong> ${String(brokerConnection.broker || 'manual').toUpperCase()} • <strong>Mode:</strong> ${String(brokerConnection.bridgeMode || 'manual_confirmed').replace(/_/g, ' ')}</p>
      <p><strong>Execution Path:</strong> ${executionPathLabel}${auth?.apiEndpoint ? ` • <strong>Endpoint:</strong> ${String(auth.apiEndpoint)}` : ''}</p>
      <p><strong>Broker API Status:</strong> ${auth?.accountStatus ? String(auth.accountStatus).toUpperCase() : 'N/A'}</p>
      <p><strong>Hands-free live mode:</strong> ${execution?.autopilot?.enabled ? 'ON (autonomous)' : 'OFF'}</p>
      <p><strong>Autopilot status:</strong> ${execution?.autopilot?.active ? 'RUNNING' : 'STOPPED'}${execution?.autopilot?.intervalMs ? ` • every ${Math.round(Number(execution.autopilot.intervalMs || 0) / 1000)}s` : ''}</p>
      <p><strong>Last Plan:</strong> ${lastPlan?.generatedAt || 'N/A'}</p>
      <p><strong>Plan Tickets:</strong> ${Number(lastPlan?.orderTickets?.length || 0)} • <strong>Manual Action:</strong> ${lastPlan?.manualActionRequired ? 'Yes' : 'No'}</p>
      <p><strong>Last Broker Submit:</strong> ${lastBrokerExecution?.submittedAt || 'N/A'} • <strong>Submitted:</strong> ${Number(lastBrokerExecution?.submittedCount || 0)} • <strong>Rejected:</strong> ${Number(lastBrokerExecution?.rejectedCount || 0)}</p>
      <p><strong>Website Inputs:</strong> ${amplifiedSummary}</p>
      <p><strong>Source Audit:</strong> Unique symbols ${Number(sourceAudit.uniqueSymbols || sourceAuditDetails.totalUniqueSignalSymbols || 0)} • Duplicates ${Number(sourceAudit.duplicateSignals || 0)} • Ranked ${Number(sourceAuditDetails.rankedSymbolsCount || (snapshot?.rankedSymbols || []).length || 0)}</p>
      <p class="small-note"><strong>Amplification logic:</strong> The AI increases priority for symbols with stronger combined input from AI queue, Trend Trades, and High IV. If one source is quiet, weighting shifts toward the active sources while risk/reward gate still blocks weak setups.</p>
      <p><strong>Broker setup pending steps:</strong> ${pendingSetupCount}</p>
      <p><strong>Risk/Reward gate:</strong> min ${fmtRatio(riskRewardGate.minRewardRiskRatio || 0)} • pass ${Number(riskRewardGate.passed || 0)} / fail ${Number(riskRewardGate.rejected || 0)}</p>
      <p class="small-note">Setup docs: ${setup?.docsUrl ? `<a class="open-link" href="${setup.docsUrl}" target="_blank" rel="noopener noreferrer">${setup.docsUrl}</a>` : 'N/A'}</p>
      <p class="small-note">Ranked symbols: ${(snapshot?.rankedSymbols || []).slice(0, 6).join(', ') || 'N/A'}</p>
    </article>
    <article class="bot-position-card">
      <h4>What AI is amplifying right now</h4>
      <ul class="detail-list">
        ${amplifiedSources.map((source) => `<li><strong>${source.label}:</strong> ${source.count} signal(s) • ${source.note}</li>`).join('')}
      </ul>
      <p class="small-note">These amplified inputs are then filtered by risk/reward rules, broker readiness, and autonomous live execution safeguards.</p>
    </article>
  `;

  stepsTarget.innerHTML = '';
  if (!setupSteps.length) {
    stepsTarget.innerHTML = '<div class="pro-lock">No broker setup steps available.</div>';
  } else {
    setupSteps.forEach((step, index) => {
      const card = document.createElement('article');
      card.className = `bot-position-card ${step.completed ? 'bot-position-card--success' : 'bot-position-card--warning'}`;
      const stepLink = String(step.navigateUrl || step.actionHref || step.actionUrl || '').trim();
      const linkTarget = step.actionExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      const stepTitle = stepLink
        ? `<a class="broker-step-link" href="${stepLink}"${linkTarget}><strong>Step ${index + 1}:</strong> ${step.title}</a>`
        : `<strong>Step ${index + 1}:</strong> ${step.title}`;
      const actionLine = stepLink
        ? `<p class="small-note"><a class="broker-step-action" href="${stepLink}"${linkTarget}>${step.actionLabel || 'Open step'}</a></p>`
        : '';
      card.innerHTML = `
        <p>${stepTitle}</p>
        <p class="small-note">${step.description || ''}</p>
        ${actionLine}
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
  renderTradeIdeas(execution);
}

async function loadAccountView() {
  const payload = await requestWithAuthRetry('/api/market/auto-trader/account-view', {
    method: 'GET'
  });
  activeAccountPayload = payload;
  if (payload?.execution?.autopilot?.active) {
    markAutopilotProgress();
  }
  renderAccountSnapshot(payload);
  renderOpenPositions(payload.openPositions || []);
  renderExecutionCenter(payload.execution || null);
  renderFundingActivity(payload.activity?.recentFunding || []);
  renderCycleActivity(payload.activity?.recentCycles || []);
  renderTradeHistorySection(payload.tradeHistory?.open || [], 'ai-account-open-trade-history', 'No open trade history yet.');
  renderTradeHistorySection(payload.tradeHistory?.closed || [], 'ai-account-closed-trade-history', 'No closed trade history yet.');
  return payload;
}

function setupActions() {
  const refreshButton = document.getElementById('ai-account-refresh');
  const startAutopilotButton = document.getElementById('ai-account-start-autopilot');
  const stopAutopilotButton = document.getElementById('ai-account-stop-autopilot');
  const openFundingButton = document.getElementById('ai-account-back-funding');
  const openBrokerOnboardingButton = document.getElementById('ai-account-open-brokerage');
  const tradeIdeasTarget = document.getElementById('ai-account-trade-ideas');
  const brokerRefreshButton = document.getElementById('broker-widget-refresh');
  const brokerChangeKeysButton = document.getElementById('broker-widget-change-keys');
  const brokerSwitchModeButton = document.getElementById('broker-widget-switch-mode');

  if (openFundingButton) {
    openFundingButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-funding.html';
    });
  }

  if (openBrokerOnboardingButton) {
    openBrokerOnboardingButton.addEventListener('click', () => {
      if (typeof window.createBrokerConnectionModal !== 'function') {
        window.location.href = '/settings/broker';
        return;
      }
      if (!brokerModalInstance) {
        brokerModalInstance = window.createBrokerConnectionModal({
          authFetch: requestWithAuthRetry,
          onSaved: async () => {
            await loadAccountView().catch(() => {});
          }
        });
        brokerModalInstance.mount();
      }
      brokerModalInstance.open();
    });
  }

  if (brokerRefreshButton instanceof HTMLButtonElement) {
    brokerRefreshButton.addEventListener('click', async () => {
      try {
        brokerRefreshButton.disabled = true;
        await requestWithAuthRetry('/api/broker/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        await loadBrokerStatusWidget();
        setStatus('Broker connection refreshed.');
      } catch (error) {
        setStatus(error.message || 'Could not refresh broker connection.', true);
      } finally {
        brokerRefreshButton.disabled = false;
      }
    });
  }

  if (brokerChangeKeysButton instanceof HTMLButtonElement) {
    brokerChangeKeysButton.addEventListener('click', () => {
      if (typeof window.createBrokerConnectionModal !== 'function') {
        window.location.href = '/settings/broker';
        return;
      }
      if (!brokerModalInstance) {
        brokerModalInstance = window.createBrokerConnectionModal({
          authFetch: requestWithAuthRetry,
          onSaved: async () => {
            await Promise.all([loadBrokerStatusWidget(), loadAccountView()]).catch(() => {});
          }
        });
        brokerModalInstance.mount();
      }
      brokerModalInstance.open();
    });
  }

  if (brokerSwitchModeButton instanceof HTMLButtonElement) {
    brokerSwitchModeButton.addEventListener('click', async () => {
      const targetMode = String(brokerSwitchModeButton.getAttribute('data-target-mode') || '').trim().toLowerCase();
      if (!(targetMode === 'paper' || targetMode === 'live')) {
        return;
      }
      const confirmMessage = targetMode === 'live'
        ? 'Switch to Live Trading? This uses real money.'
        : 'Switch to Paper Trading?';
      if (!window.confirm(confirmMessage)) {
        return;
      }
      try {
        brokerSwitchModeButton.disabled = true;
        const refreshed = await requestWithAuthRetry('/api/broker/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trading_mode: targetMode })
        });
        if (!refreshed?.success) {
          throw new Error(refreshed?.message || 'Could not switch broker trading mode.');
        }
        await loadBrokerStatusWidget();
        setStatus(`Broker mode switched to ${targetMode === 'live' ? 'Live Trading' : 'Paper Trading'}.`);
      } catch (error) {
        setStatus(error.message || 'Could not switch broker mode.', true);
      } finally {
        brokerSwitchModeButton.disabled = false;
      }
    });
  }

  if (tradeIdeasTarget instanceof HTMLElement) {
    tradeIdeasTarget.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const actionButton = target.closest('button[data-action]');
      if (!(actionButton instanceof HTMLButtonElement)) {
        return;
      }
      const action = String(actionButton.dataset.action || '').trim();
      const ticketId = String(actionButton.dataset.ticketId || '').trim();
      if (!ticketId) {
        return;
      }
      if (action === 'approve-trade-idea') {
        await approveTradeIdea(ticketId, actionButton);
        return;
      }
      if (action === 'cancel-trade-idea') {
        await cancelTradeIdea(ticketId, actionButton);
      }
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

  if (startAutopilotButton) {
    startAutopilotButton.addEventListener('click', async () => {
      try {
        startAutopilotButton.disabled = true;
        setStatus('Starting autonomous live trading...');
        await requestWithAuthRetry('/api/market/auto-trader/autopilot/start', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ intervalMs: 30000 })
        });
        markAutopilotProgress();
        await loadAccountView();
        setStatus('Hands-free AI trading is ON. AI will run and place broker orders automatically.');
      } catch (error) {
        setStatus(error.message || 'Could not start autonomous live trading.', true);
      } finally {
        startAutopilotButton.disabled = false;
      }
    });
  }

  if (stopAutopilotButton) {
    stopAutopilotButton.addEventListener('click', async () => {
      try {
        stopAutopilotButton.disabled = true;
        setStatus('Stopping autonomous live trading...');
        await requestWithAuthRetry('/api/market/auto-trader/autopilot/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        await loadAccountView();
        setStatus('Hands-free AI trading stopped.');
      } catch (error) {
        setStatus(error.message || 'Could not stop autonomous live trading.', true);
      } finally {
        stopAutopilotButton.disabled = false;
      }
    });
  }
}

async function init() {
  const token = getStoredToken() || await tryRestoreSession();
  if (!token) {
    showSignInNeeded('Please log in to view the AI brokerage account.');
    if (typeof window.redirectToSignIn === 'function') {
      window.redirectToSignIn(`${window.location.pathname || '/ai-bot-account.html'}${window.location.search || ''}${window.location.hash || ''}`);
    }
    return;
  }
  setupActions();
  try {
    await loadAccountView();
    await loadBrokerStatusWidget().catch(() => {});
    setStatus('AI brokerage account view ready.');
  } catch (error) {
    if (error?.status === 401) {
      showSignInNeeded('Please log in to view the AI brokerage account.');
      return;
    }
    setStatus(error.message || 'Could not load AI brokerage account view.', true);
  }
}

init();
