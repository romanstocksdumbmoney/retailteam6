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

function renderBotSummary(payload) {
  const target = document.getElementById('ai-bot-summary');
  if (!target) {
    return;
  }
  if (!payload) {
    target.innerHTML = '<div class="pro-lock">No bot configured yet.</div>';
    return;
  }
  target.innerHTML = `
    <article class="bot-position-card">
      <h4>Status: ${(payload.status || 'paused').toUpperCase()}</h4>
      <p><strong>Cash:</strong> ${fmtUsd(payload.cashUsd)}</p>
      <p><strong>Total Deposited:</strong> ${fmtUsd(payload.totalDepositedUsd)}</p>
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
      <p><strong>Chase %:</strong> ${cfg.chasePct || 0}%</p>
      <p><strong>Risk/trade %:</strong> ${cfg.riskPerTradePct || 0}%</p>
      <p><strong>Allocation/trade %:</strong> ${cfg.allocationPerTradePct || 0}%</p>
      <p><strong>Max sector exposure %:</strong> ${cfg.maxSectorExposurePct || 0}%</p>
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
  if (trades.length === 0) {
    target.innerHTML = '<div class="pro-lock">No new orders in the latest cycle.</div>';
    return;
  }
  trades.forEach((trade) => {
    const links = (trade.links || [])
      .map((link) => `<a class="open-link" href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>`)
      .join(' • ');
    const card = document.createElement('article');
    card.className = 'bot-position-card';
    card.innerHTML = `
      <h4>${trade.ticker} <span class="chip">${trade.sector}</span> <span class="chip ${trade.direction === 'long' ? 'pro' : ''}">${trade.direction.toUpperCase()}</span></h4>
      <p><strong>Shares:</strong> ${trade.shares} • <strong>Notional:</strong> ${fmtUsd(trade.notionalUsd)}</p>
      <p><strong>Entry:</strong> ${fmtUsd(trade.entry)} • <strong>Chase:</strong> ${fmtUsd(trade.chasePrice)}</p>
      <p><strong>Stop:</strong> ${fmtUsd(trade.stopLoss)} • <strong>Take:</strong> ${fmtUsd(trade.takeProfit)}</p>
      <p><strong>Risk:</strong> ${fmtUsd(trade.riskUsd)} • <strong>Reward:</strong> ${fmtUsd(trade.potentialRewardUsd)}</p>
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
  target.innerHTML = `
    <article class="bot-position-card">
      <p><strong>Executed:</strong> ${cycle.executedAt || 'N/A'}</p>
      <p><strong>Starting Cash:</strong> ${fmtUsd(cycle.startedCashUsd)}</p>
      <p><strong>Ending Cash:</strong> ${fmtUsd(cycle.endingCashUsd)}</p>
      <p><strong>Note:</strong> ${cycle.note || 'N/A'}</p>
      <ul class="detail-list">${closedRows || '<li>No positions closed in this cycle.</li>'}</ul>
    </article>
  `;
}

function renderState(payload) {
  if (!payload) {
    renderBotSummary(null);
    renderPlan(null);
    renderOrders(null);
    renderLogs(null);
    return;
  }
  renderBotSummary(payload);
  renderPlan(payload);
  renderOrders(payload.lastCycle || null);
  renderLogs(payload.lastCycle || null);
}

async function loadBotState() {
  const payload = await fetchJson('/api/market/auto-trader/bot', {
    headers: getAuthHeaders()
  });
  renderState(payload);
}

async function saveBotConfig() {
  const promptNode = document.getElementById('ai-bot-prompt');
  const timeframeNode = document.getElementById('ai-bot-timeframe');
  const prompt = promptNode instanceof HTMLTextAreaElement ? promptNode.value.trim() : '';
  const timeframe = timeframeNode instanceof HTMLSelectElement ? timeframeNode.value : 'intraday';
  const payload = {
    prompt,
    capitalUsd: getNumberInputValue('ai-bot-capital', 10000),
    riskPct: getNumberInputValue('ai-bot-risk-pct', 1.5),
    chasePct: 0.8,
    allocationPerTradePct: Math.max(4, Math.min(60, Math.round(100 / Math.max(1, getNumberInputValue('ai-bot-target-holdings', 6))))),
    maxSectorExposurePct: getNumberInputValue('ai-bot-max-sector-exposure-pct', 35),
    maxPositions: getNumberInputValue('ai-bot-target-holdings', 6),
    stopLossPct: Math.max(0.5, getNumberInputValue('ai-bot-risk-pct', 1.5) * 1.5),
    takeProfitPct: Math.max(1.2, getNumberInputValue('ai-bot-risk-pct', 1.5) * 3),
    maxGrossExposurePct: getNumberInputValue('ai-bot-max-gross-exposure-pct', 100),
    timeframe,
    sectors: collectSelectedSectors()
  };
  const saved = await fetchJson('/api/market/auto-trader/bot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  });
  renderState(saved);
}

async function runCycle() {
  const payload = await fetchJson('/api/market/auto-trader/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({})
  });
  renderState(payload.bot || payload);
}

async function setBotActive(active) {
  const path = active ? '/api/market/auto-trader/bot/resume' : '/api/market/auto-trader/bot/pause';
  const payload = await fetchJson(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
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

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const saveButton = document.getElementById('ai-bot-save');
      try {
        if (saveButton) {
          saveButton.disabled = true;
        }
        setStatus('Saving bot configuration...');
        await saveBotConfig();
        setStatus('Bot configuration saved.');
      } catch (error) {
        setStatus(error.message || 'Could not save bot configuration.', true);
      } finally {
        if (saveButton) {
          saveButton.disabled = false;
        }
      }
    });
  }

  if (runButton) {
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

  if (refreshButton) {
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

  if (pauseButton) {
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

  if (resumeButton) {
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
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    setStatus('Please log in with a Pro account to use AI Bot Trader.', true);
    return;
  }
  setupForm();
  try {
    await loadBotState();
    setStatus('AI Bot Trader ready.');
  } catch (error) {
    if (error.status === 403) {
      setStatus('Pro access needed for AI Bot Trader.', true);
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
