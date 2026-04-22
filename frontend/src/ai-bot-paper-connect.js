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

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function setStatus(text, isError = false) {
  const node = document.getElementById('paper-connect-status');
  if (!node) {
    return;
  }
  if (typeof window.clearSignInCallout === 'function') {
    window.clearSignInCallout('paper-connect-status');
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function showSignInNeeded(message = 'Please log in first to connect paper trading.') {
  const nextPath = `${window.location.pathname || '/ai-bot-paper-connect.html'}${window.location.search || ''}${window.location.hash || ''}`;
  if (typeof window.showSignInCallout === 'function') {
    window.showSignInCallout({
      statusElementId: 'paper-connect-status',
      message,
      nextPath,
      linkLabel: 'Sign in to continue'
    });
    return;
  }
  setStatus(message, true);
}

function parseQueryDefaults() {
  const params = new URLSearchParams(window.location.search);
  const amountUsd = Number(params.get('startingCapitalUsd') || 0);
  const riskPct = Number(params.get('riskPerTradePct') || 0);
  const targetReturnPct = Number(params.get('targetReturnPct') || 0);
  return {
    amountUsd: Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : 10000,
    riskPct: Number.isFinite(riskPct) && riskPct > 0 ? riskPct : 1.5,
    targetReturnPct: Number.isFinite(targetReturnPct) && targetReturnPct > 0 ? targetReturnPct : 12
  };
}

function hydrateFormFromQuery() {
  const defaults = parseQueryDefaults();
  const capitalInput = document.getElementById('paper-connect-capital');
  const riskInput = document.getElementById('paper-connect-risk');
  const targetInput = document.getElementById('paper-connect-target-return');

  if (capitalInput instanceof HTMLInputElement) {
    capitalInput.value = String(defaults.amountUsd);
  }
  if (riskInput instanceof HTMLInputElement) {
    riskInput.value = String(defaults.riskPct);
  }
  if (targetInput instanceof HTMLInputElement) {
    targetInput.value = String(defaults.targetReturnPct);
  }
}

function renderConnectionSummary(payload) {
  const summaryNode = document.getElementById('paper-connect-summary');
  if (!summaryNode) {
    return;
  }
  const paper = payload?.paperTrading;
  if (!paper || !paper.isConnected) {
    summaryNode.innerHTML = '<div class="pro-lock">No TradingView paper account connected yet.</div>';
    return;
  }
  summaryNode.innerHTML = `
    <article class="bot-position-card">
      <p><strong>Status:</strong> ${String(paper.status || 'connected').toUpperCase()}</p>
      <p><strong>Provider:</strong> ${String(paper.provider || 'tradingview').toUpperCase()}</p>
      <p><strong>TradingView Email:</strong> ${paper.tradingviewEmail || 'N/A'}</p>
      <p><strong>Username:</strong> ${paper.tradingviewUsername || 'N/A'}</p>
      <p><strong>AI Access:</strong> ${paper.aiAccessEnabled ? 'Enabled' : 'Disabled'}</p>
      <p><strong>Paper Balance:</strong> ${fmtUsd(payload.cashUsd)}</p>
      <p><strong>Target Return:</strong> ${fmtPct(payload.config?.targetReturnPct || 0)}</p>
      <p><strong>Risk/Trade:</strong> ${fmtPct(payload.config?.riskPerTradePct || 0)}</p>
      <p><strong>Connected At:</strong> ${paper.connectedAt || 'N/A'}</p>
    </article>
  `;
}

function getNumberValue(id, fallback) {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLInputElement)) {
    return fallback;
  }
  const value = Number(node.value);
  return Number.isFinite(value) ? value : fallback;
}

function getTextValue(id) {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLInputElement)) {
    return '';
  }
  return String(node.value || '').trim();
}

async function loadProfile() {
  const payload = await requestWithAuthRetry('/api/market/auto-trader/paper-profile', { method: 'GET' });
  renderConnectionSummary(payload);
}

async function connectTradingViewPaper() {
  const payload = {
    provider: 'tradingview',
    tradingviewEmail: getTextValue('paper-connect-email'),
    tradingviewUsername: getTextValue('paper-connect-username'),
    startingCapitalUsd: getNumberValue('paper-connect-capital', 10000),
    targetReturnPct: getNumberValue('paper-connect-target-return', 12),
    riskPerTradePct: getNumberValue('paper-connect-risk', 1.5),
    aiAccessEnabled: true
  };
  const saved = await requestWithAuthRetry('/api/market/auto-trader/paper-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  renderConnectionSummary(saved);
}

function setupActions() {
  const form = document.getElementById('paper-connect-form');
  const refreshButton = document.getElementById('paper-connect-refresh');
  const openAccountButton = document.getElementById('paper-connect-open-account');

  if (form instanceof HTMLFormElement) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = document.getElementById('paper-connect-submit');
      try {
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = true;
        }
        setStatus('Connecting TradingView paper account...');
        await connectTradingViewPaper();
        setStatus('TradingView paper account connected. AI can now use this paper setup.');
      } catch (error) {
        setStatus(error.message || 'Could not connect TradingView paper account.', true);
      } finally {
        if (submitButton instanceof HTMLButtonElement) {
          submitButton.disabled = false;
        }
      }
    });
  }

  if (refreshButton instanceof HTMLButtonElement) {
    refreshButton.addEventListener('click', async () => {
      try {
        refreshButton.disabled = true;
        setStatus('Refreshing paper connection...');
        await loadProfile();
        setStatus('Paper connection refreshed.');
      } catch (error) {
        setStatus(error.message || 'Could not refresh paper profile.', true);
      } finally {
        refreshButton.disabled = false;
      }
    });
  }

  if (openAccountButton instanceof HTMLButtonElement) {
    openAccountButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-account.html';
    });
  }
}

async function init() {
  const token = getStoredToken() || await tryRestoreSession();
  if (!token) {
    showSignInNeeded('Please log in first to connect paper trading.');
    return;
  }
  hydrateFormFromQuery();
  setupActions();
  try {
    await loadProfile();
    setStatus('Paper trading connect page ready.');
  } catch (error) {
    if (error?.status === 401) {
      showSignInNeeded('Please log in first to connect paper trading.');
      return;
    }
    setStatus(error.message || 'Could not load paper trading profile.', true);
  }
}

init();
