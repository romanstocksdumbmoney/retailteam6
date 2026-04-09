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

let currentControlLink = '';

function setStatus(text, isError = false) {
  const statusNode = document.getElementById('ai-bot-status');
  if (!statusNode) {
    return;
  }
  statusNode.textContent = text;
  statusNode.className = isError ? 'small-note auth-error' : 'small-note';
}

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function collectSelectedSectors() {
  const selected = [];
  const checkboxes = document.querySelectorAll('fieldset.ai-bot-sectors input[type="checkbox"]');
  checkboxes.forEach((node) => {
    if (node instanceof HTMLInputElement && node.checked) {
      selected.push(node.value);
    }
  });
  return selected;
}

function getNumberInputValue(id, fallback = 0) {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLInputElement)) {
    return fallback;
  }
  const value = Number(node.value);
  return Number.isFinite(value) ? value : fallback;
}

function getSelectedTradingMode() {
  const selected = document.getElementById('ai-bot-trading-mode');
  if (!(selected instanceof HTMLSelectElement)) {
    return 'paper';
  }
  return String(selected.value || 'paper').trim().toLowerCase() === 'live' ? 'live' : 'paper';
}

function applyConfigToForm(config = {}) {
  const setInput = (id, value) => {
    const node = document.getElementById(id);
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      node.value = String(value ?? '');
    }
  };
  const setSelect = (id, value) => {
    const node = document.getElementById(id);
    if (node instanceof HTMLSelectElement && value) {
      node.value = String(value);
    }
  };
  setInput('ai-bot-prompt', config.prompt || '');
  setInput('ai-bot-risk-pct', config.riskPerTradePct ?? 1.5);
  setInput('ai-bot-target-return-pct', config.targetReturnPct ?? 12);
  setInput('ai-bot-max-sector-exposure-pct', config.maxSectorExposurePct ?? 35);
  setInput('ai-bot-max-gross-exposure-pct', config.maxGrossExposurePct ?? 100);
  setInput('ai-bot-target-holdings', config.maxPositions ?? 4);
  setSelect('ai-bot-timeframe', config.timeframe || 'intraday');

  const selectedSectors = new Set(Array.isArray(config.sectors) ? config.sectors : []);
  const checkboxes = document.querySelectorAll('fieldset.ai-bot-sectors input[type="checkbox"]');
  checkboxes.forEach((node) => {
    if (node instanceof HTMLInputElement) {
      node.checked = selectedSectors.size ? selectedSectors.has(node.value) : node.checked;
    }
  });
}

function renderBotSummary(payload) {
  const target = document.getElementById('ai-bot-summary');
  if (!target) {
    return;
  }
  if (!payload) {
    target.innerHTML = '<div class="pro-lock">No bot configured yet.</div>';
    return;
  }
  const brokerConnection = payload.execution?.brokerConnection || {};
  const brokerStatus = brokerConnection.isConnected ? 'CONNECTED' : 'NOT CONNECTED';
  target.innerHTML = `
    <article class="bot-position-card">
      <h4>Status: ${(payload.isActive ? 'active' : 'paused').toUpperCase()}</h4>
      <p><strong>Mode:</strong> ${String(payload.tradingMode || 'paper').toUpperCase()}</p>
      <p><strong>Cash:</strong> ${fmtUsd(payload.cashUsd)}</p>
      <p><strong>Total Deposited:</strong> ${fmtUsd(payload.totalDepositedUsd)}</p>
      <p><strong>Broker Connection:</strong> ${brokerStatus} (${String(brokerConnection.broker || 'manual').toUpperCase()})</p>
      <p><strong>Updated:</strong> ${payload.updatedAt || 'N/A'}</p>
    </article>
  `;
}

function renderPlan(payload) {
  const target = document.getElementById('ai-bot-plan');
  if (!target) {
    return;
  }
  if (!payload) {
    target.innerHTML = '<div class="pro-lock">No plan available.</div>';
    return;
  }
  const cfg = payload.config || {};
  target.innerHTML = `
    <article class="bot-position-card">
      <p><strong>Prompt:</strong> ${cfg.prompt || ''}</p>
      <p><strong>Target Return %:</strong> ${cfg.targetReturnPct || 0}%</p>
      <p><strong>Risk/trade %:</strong> ${cfg.riskPerTradePct || 0}%</p>
      <p><strong>Allocation/trade %:</strong> ${cfg.allocationPerTradePct || 0}%</p>
      <p><strong>Max sector exposure %:</strong> ${cfg.maxSectorExposurePct || 0}%</p>
      <p><strong>Max gross exposure %:</strong> ${cfg.maxGrossExposurePct || 0}%</p>
      <p><strong>Max positions:</strong> ${cfg.maxPositions || 0}</p>
      <p><strong>Stop Loss %:</strong> ${cfg.stopLossPct || 0}%</p>
      <p><strong>Take Profit %:</strong> ${cfg.takeProfitPct || 0}%</p>
      <p><strong>Sectors:</strong> ${(cfg.sectors || []).join(', ') || 'N/A'}</p>
    </article>
  `;
}

function renderOrders(cycle) {
  const target = document.getElementById('ai-bot-orders');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  const trades = cycle?.plannedTrades || [];
  if (!trades.length) {
    target.innerHTML = '<div class="pro-lock">No new orders in the latest cycle.</div>';
    return;
  }
  trades.forEach((trade) => {
    const links = (trade.links || [])
      .map((link) => `<a class="open-link" href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>`)
      .join(' • ');
    const reasons = Array.isArray(trade.promptAlignment?.reasons)
      ? trade.promptAlignment.reasons.join(', ')
      : 'N/A';
    const card = document.createElement('article');
    card.className = 'bot-position-card';
    card.innerHTML = `
      <h4>${trade.ticker} <span class="chip">${trade.sector}</span> <span class="chip ${trade.direction === 'long' ? 'pro' : ''}">${trade.direction.toUpperCase()}</span></h4>
      <p><strong>Shares:</strong> ${trade.shares} • <strong>Notional:</strong> ${fmtUsd(trade.notionalUsd)}</p>
      <p><strong>Entry:</strong> ${fmtUsd(trade.entry)} • <strong>Chase:</strong> ${fmtUsd(trade.chasePrice)}</p>
      <p><strong>Stop:</strong> ${fmtUsd(trade.stopLoss)} • <strong>Take:</strong> ${fmtUsd(trade.takeProfit)}</p>
      <p><strong>Prompt Alignment:</strong> ${Number(trade.promptAlignment?.score || 0)} / 100 • ${reasons}</p>
      <p><strong>Execution Ticket:</strong> ${trade.executionTicket?.ticketId || 'N/A'} • ${trade.executionTicket?.readyForBrokerApi ? 'Broker API Ready' : 'Manual Confirm Required'}</p>
      <p class="small-note">${links}</p>
    `;
    target.appendChild(card);
  });
}

function renderLogs(cycle) {
  const target = document.getElementById('ai-bot-logs');
  if (!target) {
    return;
  }
  if (!cycle) {
    target.innerHTML = '<div class="pro-lock">No cycle logs yet.</div>';
    return;
  }
  const closedRows = (cycle.closedPositions || [])
    .map((row) => `<li>${row.ticker} ${row.direction.toUpperCase()} • ${row.result} • PnL ${fmtUsd(row.pnlUsd)}</li>`)
    .join('');
  const adherence = cycle.promptAdherence || {};
  target.innerHTML = `
    <article class="bot-position-card">
      <p><strong>Executed:</strong> ${cycle.executedAt || 'N/A'}</p>
      <p><strong>Starting Cash:</strong> ${fmtUsd(cycle.startedCashUsd)}</p>
      <p><strong>Ending Cash:</strong> ${fmtUsd(cycle.endingCashUsd)}</p>
      <p><strong>Prompt adherence:</strong> ${Number(adherence.score || 0)}/100 • ${adherence.note || 'N/A'}</p>
      <p><strong>Signal Inputs:</strong> AI queue ${Number(cycle.websiteSignals?.sourceCounts?.aiTradeQueue || 0)} • Trend ${Number(cycle.websiteSignals?.sourceCounts?.trendTrades || 0)} • High IV ${Number(cycle.websiteSignals?.sourceCounts?.highIvTracker || 0)}</p>
      <ul class="detail-list">${closedRows || '<li>No positions closed in this cycle.</li>'}</ul>
    </article>
  `;
}

function renderControlCenter(payload) {
  const target = document.getElementById('ai-control-following');
  const linkNode = document.getElementById('ai-control-link-value');
  const copyButton = document.getElementById('ai-control-copy-link');
  const openButton = document.getElementById('ai-control-open-link');
  if (!target || !linkNode) {
    return;
  }
  const execution = payload?.execution || {};
  const controlCenter = execution.controlCenter || {};
  const promptControl = execution.promptControl || controlCenter.promptControl || {};
  const promptActivity = Array.isArray(execution.promptActivity)
    ? execution.promptActivity
    : (Array.isArray(controlCenter.promptActivity) ? controlCenter.promptActivity : []);
  const lastPlan = execution.lastPlan || {};
  const lastCycle = payload?.lastCycle || {};
  const directLink = String(controlCenter.directControlLink || '/ai-bot-trader.html').trim();

  currentControlLink = directLink;
  linkNode.textContent = `Control link: ${directLink}`;
  if (copyButton instanceof HTMLButtonElement) {
    copyButton.disabled = !directLink;
  }
  if (openButton instanceof HTMLButtonElement) {
    openButton.disabled = !directLink;
  }

  const guidance = Array.isArray(promptControl.guidance) ? promptControl.guidance : [];
  const recent = promptActivity.slice(0, 8);
  const adherence = lastCycle.promptAdherence || lastPlan.promptAdherence || {};
  const preferredTickers = Array.isArray(promptControl.preferredTickers) ? promptControl.preferredTickers : [];
  const avoidTickers = Array.isArray(promptControl.avoidTickers) ? promptControl.avoidTickers : [];
  const preferredSectors = Array.isArray(promptControl.preferredSectors) ? promptControl.preferredSectors : [];

  target.innerHTML = `
    <article class="bot-position-card">
      <h4>What AI is following right now</h4>
      <p><strong>Direction:</strong> ${String(promptControl.directionPreference || 'neutral').toUpperCase()}</p>
      <p><strong>Preferred symbols:</strong> ${preferredTickers.join(', ') || 'None specified'}</p>
      <p><strong>Avoid symbols:</strong> ${avoidTickers.join(', ') || 'None specified'}</p>
      <p><strong>Preferred sectors:</strong> ${preferredSectors.join(', ') || 'None specified'}</p>
      <p><strong>Latest adherence:</strong> ${Number(adherence.score || 0)}/100 • ${adherence.note || 'No cycle run yet.'}</p>
      <ul class="detail-list">${(guidance.length ? guidance : ['No guidance parsed from prompt yet.']).map((item) => `<li>${item}</li>`).join('')}</ul>
    </article>
    <article class="bot-position-card">
      <h4>How to prompt better</h4>
      <ul class="detail-list">
        <li>Say direction clearly: "long only" or "short bias".</li>
        <li>Name sectors and tickers: "Technology, NVDA, MSFT".</li>
        <li>Add exclusions: "avoid TSLA, avoid earnings this week".</li>
        <li>Add constraints: "max 3 positions, keep risk 1% per trade".</li>
      </ul>
    </article>
    <article class="bot-position-card">
      <h4>Recent AI prompt activity</h4>
      <ul class="detail-list">
        ${recent.length ? recent.map((row) => `<li>${row.at || 'N/A'} • ${row.action || 'event'} • ${row.prompt || '-'}</li>`).join('') : '<li>No prompt activity yet.</li>'}
      </ul>
    </article>
  `;
}

function renderState(payload) {
  if (!payload) {
    renderBotSummary(null);
    renderPlan(null);
    renderOrders(null);
    renderLogs(null);
    renderControlCenter(null);
    return;
  }
  renderBotSummary(payload);
  renderPlan(payload);
  renderOrders(payload.lastCycle || null);
  renderLogs(payload.lastCycle || null);
  renderControlCenter(payload);
  applyConfigToForm(payload.config || {});
}

async function loadBotState() {
  const payload = await requestWithAuthRetry('/api/market/auto-trader/bot', {
    method: 'GET'
  });
  renderState(payload);
  return payload;
}

async function saveBotConfig() {
  const promptNode = document.getElementById('ai-bot-prompt');
  const timeframeNode = document.getElementById('ai-bot-timeframe');
  const prompt = promptNode instanceof HTMLTextAreaElement ? promptNode.value.trim() : '';
  const timeframe = timeframeNode instanceof HTMLSelectElement ? timeframeNode.value : 'intraday';
  const selectedMode = getSelectedTradingMode();
  const riskPerTradePct = getNumberInputValue('ai-bot-risk-pct', 1.5);
  const targetHoldings = getNumberInputValue('ai-bot-target-holdings', 6);

  const payload = {
    prompt,
    capitalUsd: getNumberInputValue('ai-bot-capital', 10000),
    riskPct: riskPerTradePct,
    chasePct: 0.8,
    allocationPerTradePct: Math.max(4, Math.min(60, Math.round(100 / Math.max(1, targetHoldings)))),
    maxSectorExposurePct: getNumberInputValue('ai-bot-max-sector-exposure-pct', 35),
    maxPositions: targetHoldings,
    stopLossPct: Math.max(0.5, riskPerTradePct * 1.5),
    takeProfitPct: Math.max(1.2, riskPerTradePct * 3),
    targetReturnPct: getNumberInputValue('ai-bot-target-return-pct', 8),
    testAreaCapitalUsd: getNumberInputValue('ai-bot-test-capital', 10000),
    testAreaRiskPct: getNumberInputValue('ai-bot-test-risk-pct', riskPerTradePct),
    maxGrossExposurePct: getNumberInputValue('ai-bot-max-gross-exposure-pct', 100),
    tradingMode: selectedMode,
    timeframe,
    sectors: collectSelectedSectors()
  };
  const saved = await requestWithAuthRetry('/api/market/auto-trader/bot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  renderState(saved);
  return saved;
}

async function runCycle() {
  const payload = await requestWithAuthRetry('/api/market/auto-trader/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  renderState(payload.bot || payload);
}

async function sendPromptControlUpdate() {
  const promptNode = document.getElementById('ai-control-prompt-input');
  if (!(promptNode instanceof HTMLTextAreaElement)) {
    throw new Error('Prompt input is not available.');
  }
  const prompt = String(promptNode.value || '').trim();
  if (!prompt) {
    throw new Error('Enter a prompt before sending to AI.');
  }
  const payload = await requestWithAuthRetry('/api/market/auto-trader/prompt-control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      source: 'control_center',
      runNow: false
    })
  });
  promptNode.value = '';
  return payload;
}

async function setBotActive(active) {
  const path = active ? '/api/market/auto-trader/bot/resume' : '/api/market/auto-trader/bot/pause';
  const payload = await requestWithAuthRetry(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  renderState(payload);
}

function setupForm() {
  const form = document.getElementById('ai-bot-config-form');
  const runButton = document.getElementById('ai-bot-run-cycle');
  const refreshButton = document.getElementById('ai-bot-refresh');
  const pauseButton = document.getElementById('ai-bot-pause');
  const resumeButton = document.getElementById('ai-bot-resume');
  const fundingButton = document.getElementById('open-ai-bot-funding');
  const accountButton = document.getElementById('open-ai-bot-account');
  const brokerageButton = document.getElementById('open-live-brokerage-account');
  const refreshControlLinkButton = document.getElementById('ai-control-refresh-link');
  const copyControlLinkButton = document.getElementById('ai-control-copy-link');
  const openControlLinkButton = document.getElementById('ai-control-open-link');
  const promptControlForm = document.getElementById('ai-control-prompt-form');

  if (fundingButton instanceof HTMLButtonElement) {
    fundingButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-funding.html';
    });
  }
  if (accountButton instanceof HTMLButtonElement) {
    accountButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-account.html';
    });
  }
  if (brokerageButton instanceof HTMLButtonElement) {
    brokerageButton.addEventListener('click', () => {
      window.location.href = '/brokerage-onboarding.html';
    });
  }

  if (refreshControlLinkButton instanceof HTMLButtonElement) {
    refreshControlLinkButton.addEventListener('click', async () => {
      try {
        refreshControlLinkButton.disabled = true;
        setStatus('Refreshing AI control center...');
        await loadBotState();
        setStatus('AI control center refreshed.');
      } catch (error) {
        setStatus(error.message || 'Could not refresh AI control center.', true);
      } finally {
        refreshControlLinkButton.disabled = false;
      }
    });
  }

  if (copyControlLinkButton instanceof HTMLButtonElement) {
    copyControlLinkButton.addEventListener('click', async () => {
      if (!currentControlLink) {
        setStatus('No AI control link available yet.', true);
        return;
      }
      try {
        await navigator.clipboard.writeText(currentControlLink);
        setStatus('AI control link copied.');
      } catch (_error) {
        setStatus('Could not copy control link. Copy manually from the control section.', true);
      }
    });
  }

  if (openControlLinkButton instanceof HTMLButtonElement) {
    openControlLinkButton.addEventListener('click', () => {
      if (!currentControlLink) {
        setStatus('No control link available to open.', true);
        return;
      }
      window.location.href = currentControlLink;
    });
  }

  if (promptControlForm instanceof HTMLFormElement) {
    promptControlForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = document.getElementById('ai-control-save-prompt');
      try {
        if (submit instanceof HTMLButtonElement) {
          submit.disabled = true;
        }
        setStatus('Saving prompt update to AI...');
        const payload = await sendPromptControlUpdate();
        renderState(payload.bot || payload);
        setStatus('Prompt update saved. AI will follow this on next cycle.');
      } catch (error) {
        setStatus(error.message || 'Could not save prompt update.', true);
      } finally {
        if (submit instanceof HTMLButtonElement) {
          submit.disabled = false;
        }
      }
    });
  }

  if (form instanceof HTMLFormElement) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const saveButton = document.getElementById('ai-bot-save');
      try {
        if (saveButton instanceof HTMLButtonElement) {
          saveButton.disabled = true;
        }
        setStatus('Saving bot configuration...');
        const saved = await saveBotConfig();
        const mode = String(saved?.tradingMode || getSelectedTradingMode() || 'paper').toLowerCase();
        setStatus(mode === 'live'
          ? 'Configuration saved. Redirecting to live funding setup...'
          : 'Configuration saved. Redirecting to Test Area...');
        window.location.href = '/ai-bot-funding.html';
      } catch (error) {
        setStatus(error.message || 'Could not save bot configuration.', true);
      } finally {
        if (saveButton instanceof HTMLButtonElement) {
          saveButton.disabled = false;
        }
      }
    });
  }

  if (runButton instanceof HTMLButtonElement) {
    runButton.addEventListener('click', async () => {
      try {
        runButton.disabled = true;
        setStatus('Running bot cycle...');
        await runCycle();
        setStatus('Bot cycle complete.');
      } catch (error) {
        setStatus(error.message || 'Could not run bot cycle.', true);
      } finally {
        runButton.disabled = false;
      }
    });
  }

  if (refreshButton instanceof HTMLButtonElement) {
    refreshButton.addEventListener('click', async () => {
      try {
        refreshButton.disabled = true;
        setStatus('Refreshing bot state...');
        await loadBotState();
        setStatus('Bot state refreshed.');
      } catch (error) {
        setStatus(error.message || 'Could not refresh bot state.', true);
      } finally {
        refreshButton.disabled = false;
      }
    });
  }

  if (pauseButton instanceof HTMLButtonElement) {
    pauseButton.addEventListener('click', async () => {
      try {
        pauseButton.disabled = true;
        setStatus('Pausing bot...');
        await setBotActive(false);
        setStatus('Bot paused.');
      } catch (error) {
        setStatus(error.message || 'Could not pause bot.', true);
      } finally {
        pauseButton.disabled = false;
      }
    });
  }

  if (resumeButton instanceof HTMLButtonElement) {
    resumeButton.addEventListener('click', async () => {
      try {
        resumeButton.disabled = true;
        setStatus('Resuming bot...');
        await setBotActive(true);
        setStatus('Bot resumed.');
      } catch (error) {
        setStatus(error.message || 'Could not resume bot.', true);
      } finally {
        resumeButton.disabled = false;
      }
    });
  }
}

async function init() {
  const existingToken = getStoredToken();
  if (!existingToken) {
    await tryRestoreSession();
  }
  if (!getStoredToken()) {
    setStatus('Please log in to use AI Bot Trader.', true);
    return;
  }
  setupForm();
  try {
    await loadBotState();
    setStatus('AI Bot Trader ready.');
  } catch (error) {
    if (error.status === 401) {
      setStatus('Please log in to use AI Bot Trader.', true);
      return;
    }
    if (error.status === 404) {
      setStatus('No bot found yet. Save your configuration to create one.');
      renderState(null);
      return;
    }
    setStatus(error.message || 'Could not load AI Bot Trader.', true);
  }
}

init();
