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

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function setStatus(text, isError = false) {
  const node = document.getElementById('ai-funding-payment-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function buildPaymentReference() {
  const token = localStorage.getItem('dumbdollars_token') || 'guest';
  const compact = token.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'guest';
  return `fund-${Date.now()}-${compact}`;
}

function setAmountHint(amountUsd) {
  const node = document.getElementById('ai-funding-payment-amount-line');
  if (!node) {
    return;
  }
  node.textContent = `Funding Amount: ${fmtUsd(amountUsd)} (one-time funding transfer)`;
}

function parseNumberInput(id, fallback = 0) {
  const node = document.getElementById(id);
  const value = Number(node && 'value' in node ? node.value : fallback);
  return Number.isFinite(value) ? value : fallback;
}

function applyQueryStateToUi() {
  const params = new URLSearchParams(window.location.search);
  const state = String(params.get('fundingPayment') || '').trim().toLowerCase();
  const amount = Number(params.get('amountUsd') || 0);
  if (Number.isFinite(amount) && amount > 0) {
    const amountInput = document.getElementById('ai-funding-payment-amount');
    if (amountInput instanceof HTMLInputElement) {
      amountInput.value = String(amount);
    }
    setAmountHint(amount);
  }
  if (state === 'success') {
    setStatus(`Funding payment approved${amount > 0 ? ` for ${fmtUsd(amount)}` : ''}. Next: apply this to your live account.`);
  } else if (state === 'cancelled') {
    setStatus('Funding payment was cancelled. You can retry any time.', true);
  }
}

async function startFundingPaymentCheckout() {
  const amountUsd = parseNumberInput('ai-funding-payment-amount', 0);
  if (!Number.isFinite(amountUsd) || amountUsd < 10) {
    throw new Error('Funding amount must be at least $10.');
  }
  setAmountHint(amountUsd);

  const paymentReference = buildPaymentReference();
  const session = await fetchJson('/api/market/auto-trader/funding-payment-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      amountUsd,
      paymentReference,
      successPath: '/ai-bot-funding-payment.html',
      cancelPath: '/ai-bot-funding-payment.html'
    })
  });

  if (!session?.url) {
    throw new Error('Could not open secure funding checkout.');
  }
  window.location.href = session.url;
}

async function applyDepositToLiveAccount() {
  const amountUsd = parseNumberInput('ai-funding-payment-amount', 0);
  if (!Number.isFinite(amountUsd) || amountUsd < 10) {
    throw new Error('Enter a valid funding amount before applying deposit.');
  }
  const accountLabel = String(document.getElementById('ai-funding-payment-account')?.value || '').trim() || 'live-account';
  const targetReturnPct = 12;
  const riskPerTradePct = 1.5;
  await fetchJson('/api/market/auto-trader/funding-mode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ mode: 'live' })
  });
  await fetchJson('/api/market/auto-trader/live-profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      broker: 'manual',
      accountLabel,
      paymentRail: 'card_checkout',
      executionMode: 'manual_confirmed',
      riskAcknowledgement: true,
      targetReturnPct,
      riskPerTradePct
    })
  });
  await fetchJson('/api/market/auto-trader/fund', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      amountUsd,
      accountHolder: accountLabel,
      broker: 'manual',
      paymentRail: 'card_checkout',
      executionMode: 'manual_confirmed',
      riskAcknowledged: true,
      targetReturnPct,
      riskPerTradePct
    })
  });
}

function setupForm() {
  const form = document.getElementById('ai-funding-payment-form');
  if (!form) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = document.getElementById('ai-funding-payment-submit');
    try {
      if (submit) {
        submit.disabled = true;
      }
      setStatus('Opening secure funding checkout...');
      await startFundingPaymentCheckout();
    } catch (error) {
      setStatus(error.message || 'Could not start funding payment checkout.', true);
    } finally {
      if (submit) {
        submit.disabled = false;
      }
    }
  });

  const amountInput = document.getElementById('ai-funding-payment-amount');
  if (amountInput instanceof HTMLInputElement) {
    amountInput.addEventListener('input', () => {
      const value = Number(amountInput.value);
      if (Number.isFinite(value) && value > 0) {
        setAmountHint(value);
      }
    });
  }
}

function setupQuickActions() {
  const applyButton = document.getElementById('ai-funding-apply-deposit');
  const accountViewButton = document.getElementById('ai-funding-open-account');
  if (applyButton) {
    applyButton.addEventListener('click', async () => {
      try {
        applyButton.disabled = true;
        setStatus('Applying deposit to AI account...');
        await applyDepositToLiveAccount();
        setStatus('Deposit applied to live AI account.');
      } catch (error) {
        setStatus(error.message || 'Could not apply deposit to AI account.', true);
      } finally {
        applyButton.disabled = false;
      }
    });
  }
  if (accountViewButton) {
    accountViewButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-account.html';
    });
  }
}

async function init() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    setStatus('Please log in to continue with funding payment.', true);
    return;
  }

  try {
    await fetchJson('/api/auth/me', { headers: getAuthHeaders() });
  } catch (_error) {
    setStatus('Please log in to continue with funding payment.', true);
    return;
  }

  applyQueryStateToUi();
  const queryAmount = Number(new URLSearchParams(window.location.search).get('amountUsd') || 0);
  if (queryAmount > 0) {
    setAmountHint(queryAmount);
  } else {
    setAmountHint(parseNumberInput('ai-funding-payment-amount', 1000));
  }
  setupForm();
  setupQuickActions();
  if (!String(new URLSearchParams(window.location.search).get('fundingPayment') || '').trim()) {
    setStatus('Ready to start secure funding payment.');
  }
}

init();
