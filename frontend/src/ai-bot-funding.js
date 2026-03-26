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

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtPct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function getSelectedFundingMode() {
  const selected = document.getElementById('ai-funding-trading-mode');
  const value = selected instanceof HTMLSelectElement ? selected.value : 'paper';
  return String(value || 'paper').trim().toLowerCase() === 'live' ? 'live' : 'paper';
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
      <p><strong>Mode:</strong> ${(payload.tradingMode || 'paper').toUpperCase()}</p>
      <p><strong>Cash:</strong> ${fmtUsd(payload.cashUsd)}</p>
      <p><strong>Total Deposited:</strong> ${fmtUsd(payload.totalDepositedUsd)}</p>
      <p><strong>Live Funded:</strong> ${live.isFunded ? 'Yes' : 'No'}</p>
      <p><strong>Broker:</strong> ${live.broker || 'manual'}</p>
      <p><strong>Account Label:</strong> ${live.accountHolder || 'N/A'}</p>
      <p><strong>Target Return:</strong> ${fmtPct(live.targetReturnPct || 0)}</p>
      <p><strong>Risk per Trade:</strong> ${fmtPct(live.riskPerTradePct || 0)}</p>
      <p><strong>Last Funding:</strong> ${fmtUsd(live.lastFundingUsd || 0)}</p>
      <p><strong>Funded At:</strong> ${live.fundedAt || 'N/A'}</p>
    </article>
  `;
}

async function loadFundingProfile() {
  const payload = await fetchJson('/api/market/auto-trader/funding-profile', {
    headers: getAuthHeaders()
  });
  renderFundingSummary(payload);
}

async function saveLiveProfile() {
  const broker = String(document.getElementById('ai-funding-broker')?.value || '').trim().toLowerCase();
  const accountLabel = String(document.getElementById('ai-funding-account-ref')?.value || '').trim();
  const executionMode = String(document.getElementById('ai-funding-mode')?.value || 'manual_confirmed').trim().toLowerCase();
  const targetReturnPct = Number(document.getElementById('ai-test-target-return')?.value || 12);
  const riskPerTradePct = Number(document.getElementById('ai-test-risk')?.value || 1.5);
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
  const amount = Number(document.getElementById('ai-funding-amount')?.value || 0);
  await fetchJson('/api/market/auto-trader/funding-mode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ mode: 'live' })
  });

  const targetReturnPct = Number(document.getElementById('ai-test-target-return')?.value || 12);
  const riskPerTradePct = Number(document.getElementById('ai-test-risk')?.value || 1.5);
  await fetchJson('/api/market/auto-trader/fund', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      amountUsd: amount,
      accountHolder: String(document.getElementById('ai-funding-account-ref')?.value || '').trim(),
      broker: String(document.getElementById('ai-funding-broker')?.value || '').trim(),
      paymentRail: 'bank_transfer',
      targetReturnPct,
      riskPerTradePct,
      executionMode: String(document.getElementById('ai-funding-mode')?.value || 'manual_confirmed').trim().toLowerCase(),
      riskAcknowledged: true
    })
  });
}

async function enablePaperModeForTestArea() {
  const amount = Number(document.getElementById('ai-test-balance')?.value || 10000);
  const targetReturnPct = Number(document.getElementById('ai-test-target-return')?.value || 12);
  const riskPerTradePct = Number(document.getElementById('ai-test-risk')?.value || 1.5);
  const stopLossPct = Number(document.getElementById('ai-test-stop-loss')?.value || Math.max(0.5, riskPerTradePct * 1.5));
  const takeProfitPct = Number(document.getElementById('ai-test-take-profit')?.value || Math.max(1.2, riskPerTradePct * 3));
  const allocationPerTradePct = Number(document.getElementById('ai-test-allocation')?.value || 20);

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
      targetReturnPct,
      stopLossPct,
      takeProfitPct,
      allocationPerTradePct,
      tradingMode: 'paper'
    })
  });
}

async function saveTestAreaSettings() {
  const amount = Number(document.getElementById('ai-test-balance')?.value || 10000);
  const targetReturnPct = Number(document.getElementById('ai-test-target-return')?.value || 12);
  const riskPerTradePct = Number(document.getElementById('ai-test-risk')?.value || 1.5);
  const stopLossPct = Number(document.getElementById('ai-test-stop-loss')?.value || Math.max(0.5, riskPerTradePct * 1.5));
  const takeProfitPct = Number(document.getElementById('ai-test-take-profit')?.value || Math.max(1.2, riskPerTradePct * 3));
  const allocationPerTradePct = Number(document.getElementById('ai-test-allocation')?.value || 20);

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
      targetReturnPct,
      stopLossPct,
      takeProfitPct,
      allocationPerTradePct,
      tradingMode: 'paper'
    })
  });
}

function setupForm() {
  const testForm = document.getElementById('ai-test-area-form');
  const fundingForm = document.getElementById('ai-funding-form');

  if (testForm) {
    testForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('ai-test-save');
      const testStatus = document.getElementById('ai-test-status');
      try {
        if (button) {
          button.disabled = true;
        }
        if (testStatus) {
          testStatus.textContent = 'Saving Test Area settings...';
          testStatus.className = 'small-note';
        }
        await saveTestAreaSettings();
        await loadFundingProfile();
        if (testStatus) {
          testStatus.textContent = 'Test Area saved. Paper-trading mode is ready.';
          testStatus.className = 'small-note';
        }
      } catch (error) {
        if (testStatus) {
          testStatus.textContent = error.message || 'Could not save Test Area settings.';
          testStatus.className = 'small-note auth-error';
        }
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
      const selectedMode = getSelectedFundingMode();
      if (selectedMode === 'live') {
        setStatus('Saving live profile...');
        await saveLiveProfile();
        setStatus('Funding account and enabling live mode...');
        await enableLiveModeAndFund();
      } else {
        setStatus('Configuring Test Area paper mode...');
        await enablePaperModeForTestArea();
      }
      await loadFundingProfile();
      setStatus(selectedMode === 'live'
        ? 'Live funding profile saved. Live mode is enabled.'
        : 'Test Area paper mode is ready with your return/risk settings.');
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
    setStatus('Please log in to configure live funding.', true);
    return;
  }
  setupForm();
  try {
    await loadFundingProfile();
    setStatus('Funding + Test Area page ready.');
  } catch (error) {
    setStatus(error.message || 'Could not load funding profile.', true);
  }
}

init();
