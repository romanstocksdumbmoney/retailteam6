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
  const node = document.getElementById('ai-funding-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function setTestStatus(text, isError = false) {
  const node = document.getElementById('ai-test-status');
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
  return `${Number(value || 0).toFixed(2)}%`;
}

function buildPaperConnectUrl() {
  const startingCapitalUsd = parseNumberInput('ai-test-balance', 10000);
  const targetReturnPct = parseNumberInput('ai-test-target-return', 12);
  const riskPerTradePct = parseNumberInput('ai-test-risk', 1.5);
  const params = new URLSearchParams();
  params.set('startingCapitalUsd', String(startingCapitalUsd));
  params.set('targetReturnPct', String(targetReturnPct));
  params.set('riskPerTradePct', String(riskPerTradePct));
  return `/ai-bot-paper-connect.html?${params.toString()}`;
}

function getFundingToken() {
  return localStorage.getItem('dumbdollars_live_funding_checkout_token') || '';
}

function setFundingToken(value) {
  localStorage.setItem('dumbdollars_live_funding_checkout_token', String(value || ''));
}

function clearFundingToken() {
  localStorage.removeItem('dumbdollars_live_funding_checkout_token');
}

function buildFundingPaymentReference() {
  const token = localStorage.getItem('dumbdollars_token') || 'guest';
  const compact = token.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'guest';
  return `fund-${Date.now()}-${compact}`;
}

function parseNumberInput(id, fallback = 0) {
  const node = document.getElementById(id);
  const value = Number(node && 'value' in node ? node.value : fallback);
  return Number.isFinite(value) ? value : fallback;
}

function isFundingAccessAllowed(profile) {
  if (!profile) {
    return false;
  }
  const token = getFundingToken();
  return Boolean(profile.fundingAccessPurchased || token);
}

function renderFundingSummary(payload) {
  const target = document.getElementById('ai-funding-summary');
  if (!target) {
    return;
  }
  if (!payload) {
    target.innerHTML = '<div class="pro-lock">No funding profile yet.</div>';
    return;
  }
  const live = payload.liveFunding || {};
  target.innerHTML = `
    <article class="bot-position-card">
      <p><strong>Funding Access:</strong> ${payload.fundingAccessPurchased ? 'Purchased' : 'Not purchased'}</p>
      <p><strong>Mode:</strong> ${(payload.tradingMode || 'paper').toUpperCase()}</p>
      <p><strong>Cash:</strong> ${fmtUsd(payload.cashUsd)}</p>
      <p><strong>Total Deposited:</strong> ${fmtUsd(payload.totalDepositedUsd)}</p>
      <p><strong>Live Funded:</strong> ${live.isFunded ? 'Yes' : 'No'}</p>
      <p><strong>Broker:</strong> ${live.broker || 'manual'}</p>
      <p><strong>Account Label:</strong> ${live.accountHolder || 'N/A'}</p>
      <p><strong>Target Return:</strong> ${fmtPct(live.targetReturnPct || payload.config?.targetReturnPct || 0)}</p>
      <p><strong>Risk per Trade:</strong> ${fmtPct(live.riskPerTradePct || payload.config?.riskPerTradePct || 0)}</p>
      <p><strong>Last Funding:</strong> ${fmtUsd(live.lastFundingUsd || 0)}</p>
      <p><strong>Funded At:</strong> ${live.fundedAt || 'N/A'}</p>
    </article>
  `;
}

function setLiveControlsEnabled(enabled) {
  const ids = [
    'ai-funding-amount',
    'ai-funding-broker',
    'ai-funding-account-ref',
    'ai-funding-mode',
    'ai-funding-target-return-pct',
    'ai-funding-risk-pct',
    'ai-funding-submit'
  ];
  ids.forEach((id) => {
    const node = document.getElementById(id);
    if (node && 'disabled' in node) {
      node.disabled = !enabled;
    }
  });
}

function updateLivePurchaseUI(profile) {
  const gate = document.getElementById('ai-live-gate');
  const notice = document.getElementById('ai-live-gate-status');
  const buyButton = document.getElementById('ai-live-buy-access');
  const enabled = isFundingAccessAllowed(profile);
  setLiveControlsEnabled(enabled);
  if (gate) {
    gate.classList.toggle('hidden', enabled);
  }
  if (notice) {
    notice.textContent = enabled
      ? 'Live Funding Mode unlocked.'
      : 'Live Funding Mode is locked until purchase is completed.';
    notice.className = enabled ? 'small-note' : 'small-note auth-error';
  }
  if (buyButton) {
    buyButton.disabled = enabled;
    buyButton.textContent = enabled ? 'Live Funding Mode Unlocked' : 'Buy into Live Funding Mode ($15/mo Pro)';
  }
}

function applyFundingPaymentQueryState() {
  const params = new URLSearchParams(window.location.search);
  const paymentState = String(params.get('fundingPayment') || '').trim().toLowerCase();
  if (!paymentState) {
    return;
  }
  if (paymentState === 'success') {
    const amountUsd = Number(params.get('amountUsd') || 0);
    setStatus(`Funding payment completed${amountUsd > 0 ? ` for ${fmtUsd(amountUsd)}` : ''}. You can now apply funds to the live account.`);
  } else if (paymentState === 'cancelled') {
    setStatus('Funding payment was cancelled. You can try again anytime.', true);
  }
}

async function loadFundingProfile() {
  const payload = await fetchJson('/api/market/auto-trader/funding-profile', {
    headers: getAuthHeaders()
  });
  renderFundingSummary(payload);
  updateLivePurchaseUI(payload);
  return payload;
}

async function buyLiveFundingAccess() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    throw new Error('Please log in first.');
  }
  const session = await fetchJson('/api/auth/stripe/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      paymentMethodTypes: ['card', 'link', 'paypal']
    })
  });
  if (!session?.url) {
    throw new Error('Could not create checkout session.');
  }
  setFundingToken(`pending_${Date.now()}`);
  window.location.href = session.url;
}

function openFundingPaymentPage() {
  const amountUsd = parseNumberInput('ai-funding-amount', 0);
  if (!Number.isFinite(amountUsd) || amountUsd < 10) {
    throw new Error('Funding payment amount must be at least $10.');
  }
  const accountLabel = String(document.getElementById('ai-funding-account-ref')?.value || '').trim();
  const params = new URLSearchParams();
  params.set('amountUsd', String(amountUsd));
  if (accountLabel) {
    params.set('accountLabel', accountLabel);
  }
  window.location.href = `/ai-bot-funding-payment.html?${params.toString()}`;
}

async function saveLiveProfile() {
  const broker = String(document.getElementById('ai-funding-broker')?.value || 'manual').trim().toLowerCase();
  const accountLabel = String(document.getElementById('ai-funding-account-ref')?.value || '').trim() || 'live-account';
  const executionMode = String(document.getElementById('ai-funding-mode')?.value || 'manual_confirmed').trim().toLowerCase();
  const targetReturnPct = parseNumberInput('ai-funding-target-return-pct', 12);
  const riskPerTradePct = parseNumberInput('ai-funding-risk-pct', 1.5);
  return fetchJson('/api/market/auto-trader/live-profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      broker,
      accountLabel,
      executionMode,
      riskAcknowledgement: true,
      targetReturnPct,
      riskPerTradePct
    })
  });
}

async function enableLiveModeAndFund() {
  const amount = parseNumberInput('ai-funding-amount', 0);
  const targetReturnPct = parseNumberInput('ai-funding-target-return-pct', 12);
  const riskPerTradePct = parseNumberInput('ai-funding-risk-pct', 1.5);
  await fetchJson('/api/market/auto-trader/funding-mode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ mode: 'live' })
  });
  await fetchJson('/api/market/auto-trader/fund', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      amountUsd: amount,
      accountHolder: String(document.getElementById('ai-funding-account-ref')?.value || '').trim() || 'live-account',
      broker: String(document.getElementById('ai-funding-broker')?.value || 'manual').trim().toLowerCase(),
      paymentRail: 'bank_transfer',
      targetReturnPct,
      riskPerTradePct,
      executionMode: String(document.getElementById('ai-funding-mode')?.value || 'manual_confirmed').trim().toLowerCase(),
      riskAcknowledged: true
    })
  });
}

async function saveTestAreaSettings() {
  const amount = parseNumberInput('ai-test-balance', 10000);
  const targetReturnPct = parseNumberInput('ai-test-target-return', 12);
  const riskPerTradePct = parseNumberInput('ai-test-risk', 1.5);
  const stopLossPct = parseNumberInput('ai-test-stop-loss', Math.max(0.5, riskPerTradePct * 1.5));
  const takeProfitPct = parseNumberInput('ai-test-take-profit', Math.max(1.2, riskPerTradePct * 3));
  const allocationPerTradePct = parseNumberInput('ai-test-allocation', 20);
  await fetchJson('/api/market/auto-trader/funding-mode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ mode: 'paper' })
  });
  await fetchJson('/api/market/auto-trader/bot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      capitalUsd: amount,
      riskPct: riskPerTradePct,
      riskPerTradePct,
      targetReturnPct,
      stopLossPct,
      takeProfitPct,
      allocationPerTradePct,
      tradingMode: 'paper'
    })
  });
}

function setupForm() {
  const buyButton = document.getElementById('ai-live-buy-access');
  const testForm = document.getElementById('ai-test-area-form');
  const createPaperConnectButton = document.getElementById('ai-test-create-paper-account');
  const fundingForm = document.getElementById('ai-funding-form');
  const openFundingPaymentButton = document.getElementById('ai-open-funding-payment');
  const openAccountViewButton = document.getElementById('ai-open-account-view');
  const openBrokerageOnboardingButton = document.getElementById('ai-open-broker-onboarding');

  if (createPaperConnectButton) {
    createPaperConnectButton.addEventListener('click', () => {
      try {
        setTestStatus('Opening TradingView paper account connect...');
        window.location.href = buildPaperConnectUrl();
      } catch (error) {
        setTestStatus(error.message || 'Could not open TradingView paper connect.', true);
      }
    });
  }

  if (openFundingPaymentButton) {
    openFundingPaymentButton.addEventListener('click', async () => {
      try {
        openFundingPaymentButton.disabled = true;
        setStatus('Opening funding payment page...');
        openFundingPaymentPage();
      } catch (error) {
        setStatus(error.message || 'Could not open funding payment checkout.', true);
      } finally {
        openFundingPaymentButton.disabled = false;
      }
    });
  }

  if (openAccountViewButton) {
    openAccountViewButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-account.html';
    });
  }

  if (openBrokerageOnboardingButton) {
    openBrokerageOnboardingButton.addEventListener('click', () => {
      window.location.href = '/brokerage-onboarding.html';
    });
  }

  if (buyButton) {
    buyButton.addEventListener('click', async () => {
      try {
        buyButton.disabled = true;
        setStatus('Starting checkout for Live Funding Mode...');
        await buyLiveFundingAccess();
      } catch (error) {
        setStatus(error.message || 'Could not start checkout.', true);
        buyButton.disabled = false;
      }
    });
  }

  if (testForm) {
    testForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('ai-test-save');
      try {
        if (button) {
          button.disabled = true;
        }
        setTestStatus('Saving Test Area settings...');
        await saveTestAreaSettings();
        await loadFundingProfile();
        setTestStatus('Test Area saved. Paper-trading mode is ready.');
      } catch (error) {
        setTestStatus(error.message || 'Could not save Test Area settings.', true);
      } finally {
        if (button) {
          button.disabled = false;
        }
      }
    });
  }

  if (!fundingForm) {
    return;
  }
  fundingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = document.getElementById('ai-funding-submit');
    try {
      if (button) {
        button.disabled = true;
      }
      const profile = await loadFundingProfile();
      if (!isFundingAccessAllowed(profile)) {
        throw new Error('Buy into Live Funding Mode first.');
      }
      setStatus('Saving live profile...');
      await saveLiveProfile();
      setStatus('Funding account and enabling live mode...');
      await enableLiveModeAndFund();
      await loadFundingProfile();
      setStatus('Live funding profile saved. Live mode is enabled.');
    } catch (error) {
      setStatus(error.message || 'Could not save funding profile.', true);
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  });
}

async function init() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    setStatus('Please log in to configure funding.', true);
    return;
  }
  setupForm();
  applyFundingPaymentQueryState();
  try {
    const profile = await loadFundingProfile();
    if (profile.fundingAccessPurchased) {
      clearFundingToken();
    }
    setStatus('Funding + Test Area page ready.');
  } catch (error) {
    setStatus(error.message || 'Could not load funding profile.', true);
  }
}

init();
