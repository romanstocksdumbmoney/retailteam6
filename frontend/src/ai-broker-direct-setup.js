const BROKER_SIGNUP_LINKS = {
  alpaca: 'https://alpaca.markets/',
  robinhood: 'https://robinhood.com/signup',
  webull: 'https://www.webull.com/',
  'interactive-brokers': 'https://www.interactivebrokers.com/en/accounts/open-account-country-list.php',
  tradestation: 'https://www.tradestation.com/'
};

function getQueryParam(name) {
  return String(new URLSearchParams(window.location.search).get(name) || '').trim();
}

function setStatus(text, isError = false) {
  const node = document.getElementById('direct-broker-status');
  if (!node) {
    return;
  }
  if (typeof window.clearSignInCallout === 'function') {
    window.clearSignInCallout('direct-broker-status');
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function showSignInNeeded(message = 'Sign in first so AI setup can be saved to your account.') {
  if (typeof window.showSignInCallout === 'function') {
    window.showSignInCallout({
      statusElementId: 'direct-broker-status',
      message,
      nextPath: `${window.location.pathname || '/ai-broker-direct-setup.html'}${window.location.search || ''}${window.location.hash || ''}`,
      linkLabel: 'Sign in to continue'
    });
    return;
  }
  setStatus(message, true);
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

async function ensureAuthSession() {
  let token = getStoredToken();
  if (token) {
    return token;
  }
  if (typeof window.restoreSessionIfNeeded === 'function') {
    const restored = await window.restoreSessionIfNeeded();
    token = typeof restored === 'string'
      ? restored
      : String(restored?.token || '').trim();
  }
  return token || getStoredToken();
}

function getSelectedBroker() {
  const select = document.getElementById('direct-broker-select');
  if (!(select instanceof HTMLSelectElement)) {
    return 'alpaca';
  }
  const broker = String(select.value || 'alpaca').trim().toLowerCase();
  return BROKER_SIGNUP_LINKS[broker] ? broker : 'alpaca';
}

function getBrokerSignupUrl(broker) {
  return BROKER_SIGNUP_LINKS[String(broker || '').trim().toLowerCase()] || BROKER_SIGNUP_LINKS.alpaca;
}

function defaultPromptForBroker(broker) {
  if (broker === 'alpaca') {
    return 'Trade liquid U.S. equities with disciplined risk, avoid event-driven volatility spikes, and prioritize clean reward/risk setups.';
  }
  if (broker === 'interactive-brokers') {
    return 'Trade liquid large-cap momentum setups with strict risk controls and avoid earnings-week names.';
  }
  if (broker === 'tradestation') {
    return 'Trade high-liquidity trend continuation setups with balanced risk and avoid low-volume names.';
  }
  if (broker === 'robinhood') {
    return 'Use conservative position sizing, focus on liquid symbols, and avoid earnings-day volatility spikes.';
  }
  return 'Trade liquid large-cap setups with strict risk management and clear stop-loss discipline.';
}

function openBrokerSignup() {
  const broker = getSelectedBroker();
  const url = getBrokerSignupUrl(broker);
  localStorage.setItem('dumbdollars_selected_broker', broker);
  setStatus('Opening broker signup page...');
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.href = url;
  }
}

async function copyBrokerSignupLink() {
  const broker = getSelectedBroker();
  const url = getBrokerSignupUrl(broker);
  try {
    await navigator.clipboard.writeText(url);
    setStatus('Broker signup link copied.');
  } catch (_error) {
    setStatus('Could not copy link. Copy it manually from the browser address bar.', true);
  }
}

async function autoImplementAiForBroker() {
  const broker = getSelectedBroker();
  const token = await ensureAuthSession();
  if (!token) {
    showSignInNeeded('Please sign in first to auto-implement AI setup.');
    return;
  }

  setStatus('Saving AI bot defaults for your broker flow...');
  await fetchJson('/api/market/auto-trader/bot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeadersSafe()
    },
    body: JSON.stringify({
      prompt: defaultPromptForBroker(broker),
      capitalUsd: 10000,
      riskPerTradePct: 1.5,
      chasePct: 0.8,
      allocationPerTradePct: 18,
      maxSectorExposurePct: 35,
      maxPositions: 6,
      stopLossPct: 2.25,
      takeProfitPct: 4.5,
      targetReturnPct: 4.5,
      minRewardRiskRatio: 1.8,
      autoExecuteLive: false,
      testAreaCapitalUsd: 10000,
      testAreaRiskPct: 1.5,
      maxGrossExposurePct: 100,
      tradingMode: 'live',
      timeframe: 'intraday',
      sectors: [
        'Technology',
        'Semiconductors',
        'Financials',
        'Healthcare',
        'Consumer Discretionary',
        'Communication Services'
      ]
    })
  });

  localStorage.setItem('dumbdollars_selected_broker', broker);
  setStatus('AI defaults saved. Opening broker connect to finish account linking...');
  window.location.href = `/brokerage-onboarding.html?broker=${encodeURIComponent(broker)}&autostart=1&from=direct-signup`;
}

function setupActions() {
  const openButton = document.getElementById('direct-broker-open-signup');
  const copyButton = document.getElementById('direct-broker-copy-link');
  const autoButton = document.getElementById('direct-broker-auto-ai');
  const select = document.getElementById('direct-broker-select');

  if (select instanceof HTMLSelectElement) {
    const brokerFromQuery = String(getQueryParam('broker') || '').trim().toLowerCase();
    const rememberedBroker = String(localStorage.getItem('dumbdollars_selected_broker') || '').trim().toLowerCase();
    if (brokerFromQuery && BROKER_SIGNUP_LINKS[brokerFromQuery]) {
      select.value = brokerFromQuery;
      localStorage.setItem('dumbdollars_selected_broker', brokerFromQuery);
    } else if (rememberedBroker && BROKER_SIGNUP_LINKS[rememberedBroker]) {
      select.value = rememberedBroker;
    }
  }

  if (openButton instanceof HTMLButtonElement) {
    openButton.addEventListener('click', () => {
      openBrokerSignup();
    });
  }

  if (copyButton instanceof HTMLButtonElement) {
    copyButton.addEventListener('click', async () => {
      await copyBrokerSignupLink();
    });
  }

  if (autoButton instanceof HTMLButtonElement) {
    autoButton.addEventListener('click', async () => {
      try {
        autoButton.disabled = true;
        await autoImplementAiForBroker();
      } catch (error) {
        setStatus(error.message || 'Could not auto-implement AI for this broker flow.', true);
      } finally {
        autoButton.disabled = false;
      }
    });
  }
}

async function init() {
  setupActions();
  const flow = String(getQueryParam('flow') || '').trim().toLowerCase();
  const brokerFromQuery = String(getQueryParam('broker') || '').trim().toLowerCase();
  const token = await ensureAuthSession();
  if (token) {
    if (flow === 'instant') {
      setStatus(
        `Instant mode ready for ${brokerFromQuery ? brokerFromQuery.replace(/-/g, ' ') : 'your selected broker'}. Click "Open Broker Signup", then click "I finished signup - Auto Implement AI".`
      );
      return;
    }
    setStatus('Signed in. Open broker signup, then click "I finished signup - Auto Implement AI".');
    return;
  }
  showSignInNeeded('Sign in first so AI setup can be saved to your account.');
}

init();
