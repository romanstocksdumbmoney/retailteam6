const BROKER_FIELD_CONFIG = Object.freeze({
  alpaca: {
    id: 'alpaca',
    label: 'Alpaca',
    badge: 'RECOMMENDED',
    description: 'Best for AI trading. Free account, no commissions, built for algorithmic trading. Supports paper trading so you can test first.',
    logoText: '🦙',
    helperLink: 'https://alpaca.markets',
    testPayloadBuilder(form, tradingMode) {
      return {
        broker: 'alpaca',
        api_key: form.apiKey || '',
        api_secret: form.apiSecret || '',
        trading_mode: tradingMode,
        account_id: ''
      };
    }
  },
  tradier: {
    id: 'tradier',
    label: 'Tradier',
    badge: '',
    description: 'Commission-free trading with full API access.',
    logoText: '📈',
    helperLink: 'https://tradier.com',
    testPayloadBuilder(form, tradingMode) {
      return {
        broker: 'tradier',
        api_key: form.accessToken || '',
        account_id: form.accountId || '',
        trading_mode: tradingMode
      };
    }
  },
  ibkr: {
    id: 'ibkr',
    label: 'Interactive Brokers',
    badge: '',
    description: "World's largest broker. Best for large accounts.",
    logoText: '🏦',
    helperLink: 'https://www.interactivebrokers.com',
    testPayloadBuilder(form, tradingMode) {
      const defaultPort = tradingMode === 'live' ? 7496 : 7497;
      const parsedPort = Number(form.port);
      const port = Number.isFinite(parsedPort) ? Math.max(1, Math.trunc(parsedPort)) : defaultPort;
      return {
        broker: 'ibkr',
        account_id: form.accountId || '',
        trading_mode: tradingMode,
        extra_config: {
          port
        }
      };
    }
  }
});

const CHECKLIST_ORDER = Object.freeze([
  'connecting',
  'validating',
  'account',
  'buyingPower',
  'permissions',
  'marketData'
]);

function getBrokerConfig(brokerId) {
  const normalized = String(brokerId || '').trim().toLowerCase();
  return BROKER_FIELD_CONFIG[normalized] || BROKER_FIELD_CONFIG.alpaca;
}

function maskAccountForDisplay(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return raw.startsWith('XXXX')
    ? raw
    : `XXXX${raw.slice(-4)}`;
}

function formatUsd(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) {
    return '$0.00';
  }
  return `$${parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeCheckRows(checks = []) {
  const byKey = new Map();
  checks.forEach((check) => {
    const key = String(check?.key || '').trim();
    if (!key) {
      return;
    }
    byKey.set(key, {
      key,
      label: String(check?.label || '').trim(),
      ok: Boolean(check?.ok),
      message: String(check?.message || check?.detail || '').trim()
    });
  });
  return CHECKLIST_ORDER.map((key) => {
    const found = byKey.get(key);
    if (found) {
      return found;
    }
    return {
      key,
      label: key,
      ok: false,
      message: ''
    };
  });
}

window.DumbDollarsBrokerShared = {
  CHECKLIST_ORDER,
  getBrokerConfig,
  maskAccountForDisplay,
  formatUsd,
  normalizeCheckRows
};
function brokerSharedEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function brokerSharedFormatUsd(value) {
  const parsed = Number(value);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function brokerSharedGetDefaultPort(mode) {
  return String(mode || 'paper').toLowerCase() === 'live' ? 7496 : 7497;
}

function brokerSharedBuildConfig(options = {}) {
  const endpointBase = String(options.endpointBase || '/api/broker').trim() || '/api/broker';
  const setupGuideHref = String(options.setupGuideHref || '#setup-guide-step-3').trim() || '#setup-guide-step-3';
  const mode = String(options.mode || 'page').trim().toLowerCase() === 'modal' ? 'modal' : 'page';
  const authFetch = typeof options.authFetch === 'function' ? options.authFetch : null;
  const onSaved = typeof options.onSaved === 'function' ? options.onSaved : null;
  const afterTest = typeof options.afterTest === 'function' ? options.afterTest : null;
  const closeLabel = String(options.closeLabel || 'Close').trim() || 'Close';
  const rotate = Boolean(options.rotate);
  return {
    endpointBase,
    setupGuideHref,
    mode,
    authFetch,
    onSaved,
    afterTest,
    closeLabel,
    rotate
  };
}

function brokerSharedGuideHtml(broker) {
  if (broker === 'tradier') {
    return `
      <ol>
        <li>Go to <a class="open-link" href="https://dash.tradier.com" target="_blank" rel="noopener noreferrer">https://dash.tradier.com</a> and sign in</li>
        <li>Click your name in the top right → Settings</li>
        <li>Click "API Access" in the left menu</li>
        <li>Copy your "Access Token"</li>
        <li>Find your Account ID on the main dashboard page</li>
        <li>Paste both into the fields above and click "Test Connection"</li>
      </ol>
    `;
  }
  if (broker === 'ibkr') {
    return `
      <ol>
        <li>Download and install TWS (Trader Workstation) from interactivebrokers.com</li>
        <li>Sign in to TWS</li>
        <li>Go to Edit → Global Configuration → API → Settings</li>
        <li>Check "Enable ActiveX and Socket Clients"</li>
        <li>Set Socket port to 7497 (paper) or 7496 (live)</li>
        <li>Check "Allow connections from localhost only"</li>
        <li>Click OK and restart TWS</li>
        <li>Come back here and click "Test Connection"</li>
      </ol>
    `;
  }
  return `
    <ol>
      <li>Go to <a class="open-link" href="https://alpaca.markets" target="_blank" rel="noopener noreferrer">https://alpaca.markets</a> and sign in</li>
      <li>Click "Paper Trading" in the left sidebar (or "Live Trading" if funded)</li>
      <li>Click "Your API Keys" in the top right</li>
      <li>Click "Generate New Key"</li>
      <li><strong>IMPORTANT:</strong> Copy your Secret Key now — you cannot see it again after closing this window</li>
      <li>Paste both keys into the fields above</li>
      <li>Click "Test Connection" to verify everything works</li>
    </ol>
    <div class="broker-alpaca-diagram" aria-label="Alpaca dashboard key location diagram">
      <div class="broker-alpaca-diagram-header">Alpaca Dashboard</div>
      <div class="broker-alpaca-diagram-row">
        <span>Left Sidebar</span>
        <span class="broker-diagram-highlight">Paper Trading</span>
      </div>
      <div class="broker-alpaca-diagram-row">
        <span>Top Right</span>
        <span class="broker-diagram-highlight">Your API Keys</span>
      </div>
      <div class="broker-alpaca-diagram-row">
        <span>API Dialog</span>
        <span class="broker-diagram-highlight">Generate New Key</span>
      </div>
    </div>
  `;
}

function brokerSharedRenderTemplate(config = {}) {
  return `
    <section class="broker-connect-surface card">
      <header class="broker-connect-header">
        <h2>Connect Your Broker</h2>
        <p>Your API keys let the AI place trades on your behalf. Keys are encrypted and stored securely — we never see your actual funds.</p>
      </header>
      ${config.rotate ? `
        <article class="rotate-keys-banner">
          Rotate Keys Mode is active. Save new credentials to immediately replace your previous broker keys.
        </article>
      ` : ''}
      <article class="broker-info-banner">
        🔒 Your keys are encrypted with AES-256 before being stored. DumbDollars can only send trade instructions — it cannot withdraw funds or transfer money from your account.
      </article>

      <section class="broker-selector-section" aria-label="Broker selector">
        <div class="broker-selector-grid" id="broker-selector-grid">
          <button type="button" class="broker-selector-card is-selected" data-broker="alpaca">
            <span class="broker-selector-badge">RECOMMENDED</span>
            <span class="broker-logo-slot">🦙</span>
            <strong>Alpaca</strong>
            <p>Best for AI trading. Free account, no commissions, built for algorithmic trading. Supports paper trading so you can test first.</p>
          </button>
          <button type="button" class="broker-selector-card" data-broker="tradier">
            <span class="broker-logo-slot">📈</span>
            <strong>Tradier</strong>
            <p>Commission-free trading with full API access.</p>
          </button>
          <button type="button" class="broker-selector-card" data-broker="ibkr">
            <span class="broker-logo-slot">🏦</span>
            <strong>Interactive Brokers</strong>
            <p>World's largest broker. Best for large accounts.</p>
          </button>
        </div>
        <p class="small-note broker-selector-footnote">
          Don't have a broker account yet? <a id="broker-open-guide-link" class="open-link" href="#setup-guide-step-3">See how to open one in 5 minutes →</a>
        </p>
      </section>

      <form id="broker-connect-form-v2" class="broker-form-stack" novalidate>
        <div id="broker-form-fields"></div>

        <section class="broker-guide-panel">
          <button id="broker-guide-toggle" type="button" class="broker-guide-toggle" aria-expanded="false">
            📖 Step-by-step: How to get your API keys
          </button>
          <div id="broker-guide-content" class="broker-guide-content hidden"></div>
        </section>

        <button id="broker-test-button" type="button" class="broker-gold-button">🔌 Test Connection</button>
      </form>

      <section id="broker-test-results" class="broker-test-results hidden" aria-live="polite"></section>
      <section id="broker-save-actions" class="broker-save-actions hidden">
        <button id="broker-save-button" type="button" class="broker-gold-button">Save &amp; Continue →</button>
      </section>
    </section>
  `;
}

function brokerSharedFieldsHtml(broker, mode) {
  const isLive = String(mode || 'paper').toLowerCase() === 'live';
  if (broker === 'tradier') {
    return `
      <label class="broker-field">
        <span>Access Token</span>
        <div class="broker-input-wrap">
          <input id="broker-api-key" type="password" placeholder="Enter your Tradier Access Token" autocomplete="off" />
          <button class="broker-toggle-secret" type="button" data-toggle-target="broker-api-key">👁</button>
        </div>
        <small>Found in your Tradier dashboard under API Access</small>
        <a class="open-link" target="_blank" rel="noopener noreferrer" href="https://dash.tradier.com">How to find this ↗</a>
      </label>
      <label class="broker-field">
        <span>Account ID</span>
        <input id="broker-account-id" type="text" placeholder="Enter your Tradier Account ID" autocomplete="off" />
        <small>Your Tradier account number, found in account settings</small>
      </label>
      ${brokerSharedTradingModeHtml(mode)}
    `;
  }
  if (broker === 'ibkr') {
    return `
      <article class="broker-ibkr-info">
        Interactive Brokers requires TWS or IB Gateway to be running on your computer. Make sure it is open and API connections are enabled in Settings → API → Settings.
      </article>
      <label class="broker-field">
        <span>Account ID</span>
        <input id="broker-account-id" type="text" placeholder="Enter your IBKR Account ID" autocomplete="off" />
        <small>Your IBKR account number</small>
      </label>
      <label class="broker-field">
        <span>Port</span>
        <input id="broker-port" type="number" value="${brokerSharedGetDefaultPort(mode)}" />
        <small>TWS or IB Gateway port. 7497 = paper trading, 7496 = live trading</small>
      </label>
      ${brokerSharedTradingModeHtml(mode)}
    `;
  }
  return `
    <label class="broker-field">
      <span>API Key</span>
      <input id="broker-api-key" type="text" placeholder="Enter your Alpaca API Key" autocomplete="off" />
      <small>Found in your Alpaca dashboard under API Keys</small>
      <a class="open-link" target="_blank" rel="noopener noreferrer" href="https://app.alpaca.markets/paper/dashboard/overview">How to find this ↗</a>
    </label>
    <label class="broker-field">
      <span>Secret Key</span>
      <div class="broker-input-wrap">
        <input id="broker-api-secret" type="password" placeholder="Enter your Alpaca Secret Key" autocomplete="off" />
        <button class="broker-toggle-secret" type="button" data-toggle-target="broker-api-secret">👁</button>
      </div>
      <small>You only see this once when you generate the key. If lost, generate a new one.</small>
    </label>
    ${brokerSharedTradingModeHtml(mode)}
    ${isLive ? `
      <article class="broker-live-warning">
        ⚠ Live Trading uses real money. Make sure you have tested with paper trading first and are comfortable with the bot's performance.
      </article>
    ` : ''}
  `;
}

function brokerSharedTradingModeHtml(mode) {
  const normalized = String(mode || 'paper').toLowerCase() === 'live' ? 'live' : 'paper';
  return `
    <div class="broker-trading-mode-row">
      <span class="broker-field-label">Trading Mode</span>
      <div class="broker-trading-mode-buttons">
        <button type="button" class="broker-mode-btn ${normalized === 'paper' ? 'is-active' : ''}" data-trading-mode="paper">📄 Paper Trading <small>Simulated funds, real workflow testing.</small></button>
        <button type="button" class="broker-mode-btn ${normalized === 'live' ? 'is-active' : ''}" data-trading-mode="live">💵 Live Trading <small>Real money. Only switch when ready.</small></button>
      </div>
    </div>
  `;
}

function brokerSharedMaskAccount(account) {
  const value = String(account || '').trim();
  if (!value) {
    return '';
  }
  return `XXXX${value.slice(-4)}`;
}

function brokerSharedBuildPayload(state) {
  const payload = {
    broker: state.broker,
    trading_mode: state.tradingMode
  };
  if (state.broker === 'alpaca') {
    payload.api_key = state.apiKey;
    payload.api_secret = state.apiSecret;
  } else if (state.broker === 'tradier') {
    payload.api_key = state.apiKey;
    payload.account_id = state.accountId;
  } else if (state.broker === 'ibkr') {
    payload.account_id = state.accountId;
    payload.extra_config = { port: state.port };
    payload.api_key = state.apiKey || `ibkr-${state.accountId || 'account'}`;
  }
  return payload;
}

function brokerSharedChecklistRows(checks = []) {
  return checks.map((check) => `
    <article class="broker-check-row ${check.ok ? 'is-success' : 'is-failed'}">
      <span>${check.ok ? '✅' : '❌'} ${brokerSharedEscapeHtml(check.label || '')}</span>
      <small>${brokerSharedEscapeHtml(check.message || check.detail || '')}</small>
    </article>
  `).join('');
}

function brokerSharedBind(container, config = {}) {
  const root = container;
  if (!root) {
    return null;
  }
  const runtimeConfig = brokerSharedBuildConfig(config);
  root.innerHTML = brokerSharedRenderTemplate(runtimeConfig);
  const selectorGrid = root.querySelector('#broker-selector-grid');
  const fieldsWrap = root.querySelector('#broker-form-fields');
  const guideToggle = root.querySelector('#broker-guide-toggle');
  const guideContent = root.querySelector('#broker-guide-content');
  const testButton = root.querySelector('#broker-test-button');
  const testResults = root.querySelector('#broker-test-results');
  const saveActions = root.querySelector('#broker-save-actions');
  const saveButton = root.querySelector('#broker-save-button');
  const openGuideLink = root.querySelector('#broker-open-guide-link');

  const state = {
    broker: 'alpaca',
    tradingMode: 'paper',
    apiKey: '',
    apiSecret: '',
    accountId: '',
    port: brokerSharedGetDefaultPort('paper'),
    lastTestPassed: false,
    lastTestResponse: null
  };

  if (openGuideLink instanceof HTMLAnchorElement) {
    openGuideLink.href = runtimeConfig.setupGuideHref;
  }

  function syncFromInputs() {
    const apiKeyInput = root.querySelector('#broker-api-key');
    const apiSecretInput = root.querySelector('#broker-api-secret');
    const accountIdInput = root.querySelector('#broker-account-id');
    const portInput = root.querySelector('#broker-port');
    state.apiKey = apiKeyInput instanceof HTMLInputElement ? apiKeyInput.value.trim() : '';
    state.apiSecret = apiSecretInput instanceof HTMLInputElement ? apiSecretInput.value.trim() : '';
    state.accountId = accountIdInput instanceof HTMLInputElement ? accountIdInput.value.trim() : '';
    state.port = portInput instanceof HTMLInputElement ? Number(portInput.value || brokerSharedGetDefaultPort(state.tradingMode)) : brokerSharedGetDefaultPort(state.tradingMode);
  }

  function renderForm() {
    if (!fieldsWrap) {
      return;
    }
    fieldsWrap.innerHTML = brokerSharedFieldsHtml(state.broker, state.tradingMode);
    if (guideContent && !guideContent.classList.contains('hidden')) {
      guideContent.innerHTML = brokerSharedGuideHtml(state.broker);
    }
    root.querySelectorAll('.broker-selector-card').forEach((card) => {
      card.classList.toggle('is-selected', String(card.getAttribute('data-broker') || '') === state.broker);
    });
  }

  function mapChecksForDisplay(checks = []) {
    const values = Array.isArray(checks) ? checks : [];
    return values.map((check) => ({
      key: check.key,
      label: check.label || '',
      ok: Boolean(check.ok),
      message: check.message || check.detail || ''
    }));
  }

  async function runTest() {
    if (!(testButton instanceof HTMLButtonElement) || !testResults) {
      return;
    }
    syncFromInputs();
    state.lastTestPassed = false;
    state.lastTestResponse = null;
    testButton.disabled = true;
    testButton.textContent = 'Testing...';
    testResults.classList.remove('hidden');
    testResults.innerHTML = `<article class="broker-check-row">⏳ Running broker checks...</article>`;
    saveActions?.classList.add('hidden');
    try {
      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...brokerSharedBuildPayload(state),
          rotate: Boolean(runtimeConfig.rotate)
        })
      };
      const body = runtimeConfig.authFetch
        ? await runtimeConfig.authFetch(`${runtimeConfig.endpointBase}/test-connection`, requestOptions)
        : await (async () => {
          const response = await fetch(`${runtimeConfig.endpointBase}/test-connection`, requestOptions);
          return response.json().catch(() => ({}));
        })();
      const checks = mapChecksForDisplay(body.checks || []);
      const success = Boolean(body.success && checks.length > 0 && checks.every((check) => check.ok));
      state.lastTestPassed = success;
      state.lastTestResponse = body;
      if (success) {
        const accountMasked = body?.account_info?.accountMasked || body?.account_info?.account_masked || brokerSharedMaskAccount(state.accountId);
        const buyingPower = Number(body?.account_info?.buyingPower ?? body?.account_info?.buying_power ?? 0);
        testResults.innerHTML = `
          ${brokerSharedChecklistRows(checks)}
          <article class="broker-test-success-card">
            <h4>✅ Broker Connected Successfully!</h4>
            <p>Account: ${brokerSharedEscapeHtml(accountMasked || 'XXXX0000')}</p>
            <p>Buying Power: ${brokerSharedFormatUsd(buyingPower)}</p>
            <p>Mode: ${state.tradingMode === 'live' ? 'Live Trading' : 'Paper Trading'}</p>
            <p>Status: Ready to trade</p>
          </article>
        `;
        saveActions?.classList.remove('hidden');
        if (runtimeConfig.afterTest) {
          Promise.resolve(runtimeConfig.afterTest(body)).catch(() => {});
        }
      } else {
        const fallback = body.message || 'Could not connect — check your internet connection and try again';
        testResults.innerHTML = `
          ${brokerSharedChecklistRows(checks)}
          <article class="broker-test-failed-card">
            <p>❌ ${brokerSharedEscapeHtml(fallback)}</p>
            <div class="broker-failed-actions">
              <button id="broker-try-again" type="button" class="btn-secondary">Try Again</button>
              <a class="open-link" href="/settings#support">Contact Support</a>
            </div>
          </article>
        `;
        const retry = root.querySelector('#broker-try-again');
        if (retry instanceof HTMLButtonElement) {
          retry.addEventListener('click', () => {
            runTest().catch(() => {});
          });
        }
      }
    } catch (_error) {
      testResults.innerHTML = `
        <article class="broker-test-failed-card">
          <p>❌ Could not connect — check your internet connection and try again</p>
          <div class="broker-failed-actions">
            <button id="broker-try-again" type="button" class="btn-secondary">Try Again</button>
            <a class="open-link" href="/settings#support">Contact Support</a>
          </div>
        </article>
      `;
      const retry = root.querySelector('#broker-try-again');
      if (retry instanceof HTMLButtonElement) {
        retry.addEventListener('click', () => {
          runTest().catch(() => {});
        });
      }
    } finally {
      testButton.disabled = false;
      testButton.textContent = '🔌 Test Connection';
    }
  }

  async function saveConnection() {
    if (!(saveButton instanceof HTMLButtonElement)) {
      return;
    }
    syncFromInputs();
    if (!state.lastTestPassed) {
      await runTest();
      if (!state.lastTestPassed) {
        return;
      }
    }
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    try {
      const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...brokerSharedBuildPayload(state),
          rotate: Boolean(runtimeConfig.rotate)
        })
      };
      const body = runtimeConfig.authFetch
        ? await runtimeConfig.authFetch(`${runtimeConfig.endpointBase}/save-keys`, requestOptions)
        : await (async () => {
          const response = await fetch(`${runtimeConfig.endpointBase}/save-keys`, requestOptions);
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.message || 'Could not save broker keys.');
          }
          return payload;
        })();
      if (!body?.success) {
        throw new Error(body?.message || 'Could not save broker keys.');
      }
      if (runtimeConfig.mode === 'modal') {
        const event = new CustomEvent('broker-shared:saved', { detail: body });
        root.dispatchEvent(event);
        if (runtimeConfig.onSaved) {
          Promise.resolve(runtimeConfig.onSaved(body)).catch(() => {});
        }
      } else {
        if (runtimeConfig.onSaved) {
          Promise.resolve(runtimeConfig.onSaved(body)).catch(() => {});
        } else {
          window.location.href = '/ai-bot-trader.html';
        }
      }
    } catch (_error) {
      if (testResults) {
        testResults.classList.remove('hidden');
        testResults.innerHTML = `
          <article class="broker-test-failed-card">
            <p>❌ Could not save broker keys. Please run Test Connection again and retry.</p>
          </article>
        `;
      }
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save & Continue →';
    }
  }

  if (selectorGrid) {
    selectorGrid.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const card = target.closest('.broker-selector-card');
      if (!(card instanceof HTMLButtonElement)) {
        return;
      }
      const broker = String(card.getAttribute('data-broker') || '').trim();
      if (!broker) {
        return;
      }
      state.broker = broker;
      state.lastTestPassed = false;
      state.lastTestResponse = null;
      if (broker === 'ibkr') {
        state.port = brokerSharedGetDefaultPort(state.tradingMode);
      }
      renderForm();
      saveActions?.classList.add('hidden');
      if (testResults) {
        testResults.classList.add('hidden');
      }
    });
  }

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const toggleButton = target.closest('.broker-toggle-secret');
    if (toggleButton instanceof HTMLButtonElement) {
      const inputId = String(toggleButton.getAttribute('data-toggle-target') || '').trim();
      const input = inputId ? root.querySelector(`#${inputId}`) : null;
      if (input instanceof HTMLInputElement) {
        input.type = input.type === 'password' ? 'text' : 'password';
      }
      return;
    }
    const modeButton = target.closest('.broker-mode-btn');
    if (modeButton instanceof HTMLButtonElement) {
      const mode = String(modeButton.getAttribute('data-trading-mode') || '').trim().toLowerCase();
      state.tradingMode = mode === 'live' ? 'live' : 'paper';
      if (state.broker === 'ibkr') {
        state.port = brokerSharedGetDefaultPort(state.tradingMode);
      }
      state.lastTestPassed = false;
      renderForm();
      saveActions?.classList.add('hidden');
      if (testResults) {
        testResults.classList.add('hidden');
      }
    }
  });

  if (guideToggle && guideContent) {
    guideToggle.addEventListener('click', () => {
      const expanded = guideToggle.getAttribute('aria-expanded') === 'true';
      guideToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      guideContent.classList.toggle('hidden', expanded);
      if (!expanded) {
        guideContent.innerHTML = brokerSharedGuideHtml(state.broker);
      }
    });
  }
  if (testButton instanceof HTMLButtonElement) {
    testButton.addEventListener('click', () => {
      runTest().catch(() => {});
    });
  }
  if (saveButton instanceof HTMLButtonElement) {
    saveButton.addEventListener('click', () => {
      saveConnection().catch(() => {});
    });
  }

  renderForm();
  return {
    getState() {
      syncFromInputs();
      return { ...state };
    },
    setBroker(nextBroker) {
      state.broker = String(nextBroker || 'alpaca').trim().toLowerCase() || 'alpaca';
      renderForm();
    }
  };
}

window.brokerSharedBind = brokerSharedBind;

function mountBrokerConnectExperience(container, options = {}) {
  return brokerSharedBind(container, options);
}

function createBrokerConnectionModal(options = {}) {
  const modal = document.createElement('div');
  modal.className = 'ai-trader-modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Connect Your Broker');
  modal.innerHTML = `
    <div class="ai-trader-modal-card broker-modal-shell">
      <div class="ai-trader-broker-modal-head">
        <h3>Connect Your Broker</h3>
        <button type="button" class="btn-secondary" data-broker-modal-close>${brokerSharedEscapeHtml(options.closeLabel || 'Close')}</button>
      </div>
      <div data-broker-modal-mount></div>
    </div>
  `;
  const mountPoint = modal.querySelector('[data-broker-modal-mount]');
  const closeButton = modal.querySelector('[data-broker-modal-close]');
  const page = brokerSharedBind(mountPoint, {
    ...options,
    mode: 'modal',
    onSaved: async (payload) => {
      instance.close();
      if (typeof options.onSaved === 'function') {
        await options.onSaved(payload);
      }
    }
  });

  const instance = {
    mount() {
      if (!modal.isConnected) {
        document.body.appendChild(modal);
      }
      return instance;
    },
    open() {
      instance.mount();
      modal.classList.remove('hidden');
      return instance;
    },
    close() {
      modal.classList.add('hidden');
      return instance;
    },
    destroy() {
      modal.remove();
      return instance;
    },
    getState() {
      return page?.getState ? page.getState() : {};
    },
    setBroker(nextBroker) {
      if (page?.setBroker) {
        page.setBroker(nextBroker);
      }
      return instance;
    }
  };

  if (closeButton instanceof HTMLButtonElement) {
    closeButton.addEventListener('click', () => {
      instance.close();
    });
  }
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      instance.close();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    if (!modal.classList.contains('hidden')) {
      instance.close();
    }
  });
  return instance;
}

window.mountBrokerConnectExperience = mountBrokerConnectExperience;
window.createBrokerConnectionModal = createBrokerConnectionModal;
