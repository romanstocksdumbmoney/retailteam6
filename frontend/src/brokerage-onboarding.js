const BROKER_OPENING_LINKS = {
  robinhood: 'https://robinhood.com/us/en/support/articles/opening-an-account/',
  webull: 'https://www.webull.com/help/category/47-Open-an-account',
  'interactive-brokers': 'https://www.interactivebrokers.com/en/accounts/open_account_pro.php',
  tradestation: 'https://www.tradestation.com/open-an-account/'
};

function getAuthHeaders() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    return {};
  }
  return { authorization: `Bearer ${token}` };
}

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

function setStatus(text, isError = false) {
  const node = document.getElementById('brokerage-onboarding-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function getSelectedBroker() {
  const select = document.getElementById('brokerage-picker-select');
  if (!(select instanceof HTMLSelectElement)) {
    return 'robinhood';
  }
  const broker = String(select.value || 'robinhood').trim().toLowerCase();
  return BROKER_OPENING_LINKS[broker] ? broker : 'robinhood';
}

function getConnectFormPayload() {
  const accountId = String(document.getElementById('broker-connect-account-id')?.value || '').trim();
  const apiKey = String(document.getElementById('broker-connect-api-key')?.value || '').trim();
  const apiSecret = String(document.getElementById('broker-connect-api-secret')?.value || '').trim();
  const passphrase = String(document.getElementById('broker-connect-passphrase')?.value || '').trim();
  const bridgeMode = String(document.getElementById('broker-connect-bridge-mode')?.value || 'broker_linked').trim().toLowerCase();
  const canRead = Boolean(document.getElementById('broker-connect-perm-read')?.checked);
  const canTrade = Boolean(document.getElementById('broker-connect-perm-trade')?.checked);
  const canViewAccount = Boolean(document.getElementById('broker-connect-perm-account')?.checked);
  const riskAcknowledged = Boolean(document.getElementById('broker-connect-risk-ack')?.checked);
  return {
    broker: getSelectedBroker(),
    accountId,
    apiKey,
    apiSecret,
    passphrase,
    bridgeMode,
    canRead,
    canTrade,
    canViewAccount,
    riskAcknowledged
  };
}

function renderSelectedBrokerSummary(guide) {
  const target = document.getElementById('brokerage-selection-summary');
  if (!target) {
    return;
  }
  const broker = guide?.broker || getSelectedBroker();
  const label = String(guide?.brokerLabel || broker).toUpperCase();
  const docsUrl = guide?.docsUrl || BROKER_OPENING_LINKS[broker];
  target.innerHTML = `
    <h3>Selected Broker: ${label}</h3>
    <p class="small-note">Open docs / onboarding:</p>
    <a class="open-link" href="${docsUrl}" target="_blank" rel="noopener noreferrer">${docsUrl}</a>
  `;
}

function renderSetupSteps(steps = []) {
  const target = document.getElementById('broker-setup-steps');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  if (!steps.length) {
    target.innerHTML = '<div class="pro-lock">No setup steps returned.</div>';
    return;
  }
  steps.forEach((step, index) => {
    const row = document.createElement('article');
    row.className = `broker-step-item ${step.completed ? 'broker-step-item--done' : 'broker-step-item--todo'}`;
    row.innerHTML = `
      <p><strong>Step ${index + 1}:</strong> ${step.title}</p>
      <p class="small-note">${step.description}</p>
      <p class="small-note"><strong>Status:</strong> ${step.completed ? 'Complete' : 'Pending'}</p>
    `;
    target.appendChild(row);
  });
}

function renderConnectionStatus(guide) {
  const target = document.getElementById('broker-connection-status');
  if (!target) {
    return;
  }
  const current = guide?.current || {};
  const permissions = current.permissions || {};
  const auth = current.auth || {};
  const funding = guide?.funding || {};
  target.innerHTML = `
    <article class="bot-position-card">
      <p><strong>Bridge:</strong> ${current.isConnected ? 'CONNECTED' : 'NOT CONNECTED'}</p>
      <p><strong>Connection Status:</strong> ${String(current.connectionStatus || 'not_connected').replace(/_/g, ' ')}</p>
      <p><strong>Account ID:</strong> ${current.accountId || 'N/A'}</p>
      <p><strong>Bridge Mode:</strong> ${String(current.bridgeMode || 'manual_confirmed').replace(/_/g, ' ')}</p>
      <p><strong>Permissions:</strong> Read=${Boolean(permissions.canRead)} • Trade=${Boolean(permissions.canTrade)} • Account=${Boolean(permissions.canViewAccount)}</p>
      <p><strong>API Key:</strong> ${auth.apiKeyLast4 ? `****${auth.apiKeyLast4}` : 'not saved'} • <strong>Secret Saved:</strong> ${Boolean(auth.secretSaved)}</p>
      <p><strong>Trading Mode:</strong> ${String(funding.tradingMode || 'paper').toUpperCase()} • <strong>Funded:</strong> ${Boolean(funding.isFunded)} (${Number(funding.fundedUsd || 0).toLocaleString()} USD)</p>
      <p class="small-note">Last tested: ${current.lastTestedAt || 'N/A'}</p>
    </article>
  `;
}

function renderTestResults(testResult) {
  const target = document.getElementById('broker-connection-test-results');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  if (!testResult) {
    target.innerHTML = '<div class="pro-lock">Run a connection test to verify bridge readiness.</div>';
    return;
  }
  const checks = Array.isArray(testResult.checks) ? testResult.checks : [];
  const summary = document.createElement('article');
  summary.className = 'bot-position-card';
  summary.innerHTML = `
    <p><strong>Ready for AI live trading:</strong> ${testResult.readyForTrading ? 'YES' : 'NO'}</p>
    <p><strong>Tested at:</strong> ${testResult.testedAt || 'N/A'}</p>
  `;
  target.appendChild(summary);
  checks.forEach((check) => {
    const card = document.createElement('article');
    card.className = `bot-position-card ${check.ok ? 'bot-position-card--success' : 'bot-position-card--warning'}`;
    card.innerHTML = `
      <p><strong>${check.label}</strong> — ${check.ok ? 'PASS' : 'FAIL'}</p>
      <p class="small-note">${check.detail || ''}</p>
    `;
    target.appendChild(card);
  });
  if (Array.isArray(testResult.nextActions) && testResult.nextActions.length > 0) {
    const actions = document.createElement('article');
    actions.className = 'bot-position-card';
    actions.innerHTML = `
      <p><strong>Next actions:</strong></p>
      <ul class="detail-list">${testResult.nextActions.map((item) => `<li>${item}</li>`).join('')}</ul>
    `;
    target.appendChild(actions);
  }
}

function applyGuideToForm(guide) {
  const current = guide?.current || {};
  const permissions = current.permissions || {};
  if (document.getElementById('broker-connect-account-id') instanceof HTMLInputElement) {
    document.getElementById('broker-connect-account-id').value = current.accountId || '';
  }
  if (document.getElementById('broker-connect-bridge-mode') instanceof HTMLSelectElement) {
    document.getElementById('broker-connect-bridge-mode').value = String(current.bridgeMode || 'broker_linked');
  }
  if (document.getElementById('broker-connect-perm-read') instanceof HTMLInputElement) {
    document.getElementById('broker-connect-perm-read').checked = Boolean(permissions.canRead);
  }
  if (document.getElementById('broker-connect-perm-trade') instanceof HTMLInputElement) {
    document.getElementById('broker-connect-perm-trade').checked = Boolean(permissions.canTrade);
  }
  if (document.getElementById('broker-connect-perm-account') instanceof HTMLInputElement) {
    document.getElementById('broker-connect-perm-account').checked = Boolean(permissions.canViewAccount);
  }
}

async function loadBrokerGuide() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    setStatus('Please log in first to connect AI broker bridge.', true);
    renderSelectedBrokerSummary(null);
    renderSetupSteps([]);
    renderConnectionStatus(null);
    renderTestResults(null);
    return null;
  }
  const broker = getSelectedBroker();
  const guide = await fetchJson(`/api/market/auto-trader/broker-connect/steps?broker=${encodeURIComponent(broker)}`, {
    headers: getAuthHeaders()
  });
  renderSelectedBrokerSummary(guide);
  renderSetupSteps(guide.steps || []);
  renderConnectionStatus(guide);
  renderTestResults(guide.current?.lastTestResult || null);
  applyGuideToForm(guide);
  return guide;
}

function openBrokerSignup() {
  const broker = getSelectedBroker();
  const target = BROKER_OPENING_LINKS[broker];
  if (!target) {
    setStatus('Could not find broker onboarding link.', true);
    return;
  }
  localStorage.setItem('dumbdollars_selected_broker', broker);
  setStatus('Opening broker account signup in a new tab...');
  window.open(target, '_blank', 'noopener,noreferrer');
}

async function connectBrokerBridge() {
  const payload = getConnectFormPayload();
  const response = await fetchJson('/api/market/auto-trader/broker-connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  });
  const secretInput = document.getElementById('broker-connect-api-secret');
  if (secretInput instanceof HTMLInputElement) {
    secretInput.value = '';
  }
  const passphraseInput = document.getElementById('broker-connect-passphrase');
  if (passphraseInput instanceof HTMLInputElement) {
    passphraseInput.value = '';
  }
  return response;
}

async function runConnectionTest() {
  const response = await fetchJson('/api/market/auto-trader/broker-connect/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      broker: getSelectedBroker()
    })
  });
  renderTestResults(response);
  return response;
}

async function disconnectBrokerBridge() {
  const response = await fetchJson('/api/market/auto-trader/broker-connect/disconnect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({})
  });
  renderTestResults(null);
  return response;
}

function setupForm() {
  const pickerForm = document.getElementById('brokerage-picker-form');
  const select = document.getElementById('brokerage-picker-select');
  const openButton = document.getElementById('brokerage-open-account');
  const copyButton = document.getElementById('brokerage-copy-link');
  const continueButton = document.getElementById('brokerage-go-funding');
  const connectForm = document.getElementById('broker-connect-form');
  const testButton = document.getElementById('brokerage-test-ai');
  const disconnectButton = document.getElementById('brokerage-disconnect-ai');

  if (!(select instanceof HTMLSelectElement) || !(openButton instanceof HTMLButtonElement)) {
    return;
  }

  const rememberedBroker = String(localStorage.getItem('dumbdollars_selected_broker') || '').trim().toLowerCase();
  if (rememberedBroker && BROKER_OPENING_LINKS[rememberedBroker]) {
    select.value = rememberedBroker;
  }

  renderSelectedBrokerSummary(null);
  loadBrokerGuide().catch((error) => {
    setStatus(error.message || 'Could not load broker setup guide.', true);
  });

  select.addEventListener('change', () => {
    localStorage.setItem('dumbdollars_selected_broker', getSelectedBroker());
    renderSelectedBrokerSummary(null);
    loadBrokerGuide().catch((error) => {
      setStatus(error.message || 'Could not load broker setup guide.', true);
    });
  });

  if (pickerForm instanceof HTMLFormElement) {
    pickerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      openBrokerSignup();
    });
  }

  if (copyButton instanceof HTMLButtonElement) {
    copyButton.addEventListener('click', async () => {
      const targetLink = BROKER_OPENING_LINKS[getSelectedBroker()];
      if (!targetLink) {
        setStatus('Could not copy broker signup link.', true);
        return;
      }
      try {
        await navigator.clipboard.writeText(targetLink);
        setStatus('Broker signup link copied.');
      } catch (_error) {
        setStatus('Copy failed. Please copy the link manually.', true);
      }
    });
  }

  openButton.addEventListener('click', () => {
    openBrokerSignup();
  });

  if (continueButton instanceof HTMLButtonElement) {
    continueButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-funding.html';
    });
  }

  if (connectForm instanceof HTMLFormElement) {
    connectForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = document.getElementById('brokerage-connect-ai');
      try {
        if (submit instanceof HTMLButtonElement) {
          submit.disabled = true;
        }
        setStatus('Saving broker bridge connection...');
        await connectBrokerBridge();
        await loadBrokerGuide();
        setStatus('Broker bridge saved. Run connection test next.');
      } catch (error) {
        setStatus(error.message || 'Could not save broker bridge connection.', true);
      } finally {
        if (submit instanceof HTMLButtonElement) {
          submit.disabled = false;
        }
      }
    });
  }

  if (testButton instanceof HTMLButtonElement) {
    testButton.addEventListener('click', async () => {
      try {
        testButton.disabled = true;
        setStatus('Running broker bridge connection test...');
        const testResult = await runConnectionTest();
        await loadBrokerGuide();
        setStatus(testResult.readyForTrading ? 'Broker bridge is ready for AI live execution.' : 'Broker bridge test failed. Follow next actions below.', !testResult.readyForTrading);
      } catch (error) {
        setStatus(error.message || 'Could not run broker bridge test.', true);
      } finally {
        testButton.disabled = false;
      }
    });
  }

  if (disconnectButton instanceof HTMLButtonElement) {
    disconnectButton.addEventListener('click', async () => {
      try {
        disconnectButton.disabled = true;
        setStatus('Disconnecting broker bridge...');
        await disconnectBrokerBridge();
        await loadBrokerGuide();
        setStatus('Broker bridge disconnected. Execution mode reverted to manual confirm.');
      } catch (error) {
        setStatus(error.message || 'Could not disconnect broker bridge.', true);
      } finally {
        disconnectButton.disabled = false;
      }
    });
  }
}

function init() {
  setupForm();
}

init();
