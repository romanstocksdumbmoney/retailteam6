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
let activeQuickProfile = 'balanced';
let activeStrategyTemplate = 'momentum-breakout';
const SETUP_PROGRESS_BOT_CONFIGURED_KEY = 'dumbdollars_setup_bot_configured_at';
const uiState = {
  isAuthenticated: false,
  setupProgress: {
    signedIn: false,
    configured: false,
    funded: false,
    brokerConnected: false,
    readyForStart: false,
    liveActive: false
  }
};

function markBotConfiguredProgress() {
  try {
    localStorage.setItem(SETUP_PROGRESS_BOT_CONFIGURED_KEY, new Date().toISOString());
  } catch (_error) {
    // Ignore storage failures.
  }
}

const QUICK_SETUP_PROFILES = Object.freeze({
  conservative: {
    label: 'Conservative',
    summary: 'lower risk, fewer positions',
    prompt: 'Trade high-liquidity large caps only, favor higher-quality setups, avoid earnings-week names.',
    config: {
      riskPerTradePct: 0.8,
      minRewardRiskRatio: 2.4,
      targetReturnPct: 3.5,
      maxSectorExposurePct: 25,
      maxGrossExposurePct: 75,
      maxPositions: 4,
      timeframe: 'swing',
      testAreaRiskPct: 0.8,
      autoExecuteLive: false
    }
  },
  balanced: {
    label: 'Balanced',
    summary: 'default mix of risk and growth',
    prompt: 'Trade momentum breakouts with strict risk control, avoid earnings-day names, focus on liquid large caps.',
    config: {
      riskPerTradePct: 1.5,
      minRewardRiskRatio: 1.8,
      targetReturnPct: 4.5,
      maxSectorExposurePct: 35,
      maxGrossExposurePct: 100,
      maxPositions: 6,
      timeframe: 'intraday',
      testAreaRiskPct: 1.5,
      autoExecuteLive: false
    }
  },
  aggressive: {
    label: 'Aggressive',
    summary: 'higher risk, faster rotation',
    prompt: 'Trade stronger momentum names with tighter execution, use strict stop discipline, avoid low-liquidity symbols.',
    config: {
      riskPerTradePct: 2.8,
      minRewardRiskRatio: 1.5,
      targetReturnPct: 7,
      maxSectorExposurePct: 45,
      maxGrossExposurePct: 130,
      maxPositions: 10,
      timeframe: 'intraday',
      testAreaRiskPct: 2.8,
      autoExecuteLive: false
    }
  }
});

const STRATEGY_TEMPLATES = Object.freeze({
  'trend-following': {
    label: 'Trend Following',
    summary: 'swing continuation with moderate sizing',
    prompt: 'Trade liquid trend continuation setups only, favor pullback entries in established trends, avoid earnings-week names, keep strict stop discipline.',
    config: {
      riskPerTradePct: 1.2,
      minRewardRiskRatio: 2.1,
      targetReturnPct: 4.8,
      maxSectorExposurePct: 30,
      maxGrossExposurePct: 90,
      maxPositions: 5,
      timeframe: 'swing',
      testAreaRiskPct: 1.2
    }
  },
  'momentum-breakout': {
    label: 'Momentum Breakout',
    summary: 'intraday breakout continuation',
    prompt: 'Trade high-liquidity momentum breakouts, require volume confirmation, avoid fading strong trend names, and keep trades short duration.',
    config: {
      riskPerTradePct: 1.8,
      minRewardRiskRatio: 1.8,
      targetReturnPct: 5.4,
      maxSectorExposurePct: 40,
      maxGrossExposurePct: 110,
      maxPositions: 7,
      timeframe: 'intraday',
      testAreaRiskPct: 1.8
    }
  },
  'mean-reversion': {
    label: 'Mean Reversion',
    summary: 'reversion to VWAP/value zones',
    prompt: 'Trade liquid mean-reversion setups after overextension, scale risk down in trend days, and avoid low-volume names.',
    config: {
      riskPerTradePct: 0.9,
      minRewardRiskRatio: 2.3,
      targetReturnPct: 3.9,
      maxSectorExposurePct: 25,
      maxGrossExposurePct: 80,
      maxPositions: 4,
      timeframe: 'swing',
      testAreaRiskPct: 0.9
    }
  },
  'volatility-regime': {
    label: 'Volatility Regime',
    summary: 'defensive when volatility expands',
    prompt: 'Trade only top-liquidity symbols, reduce sizing in high-volatility sessions, avoid crowded names, and prioritize asymmetric reward/risk.',
    config: {
      riskPerTradePct: 1.1,
      minRewardRiskRatio: 2.5,
      targetReturnPct: 4.2,
      maxSectorExposurePct: 22,
      maxGrossExposurePct: 70,
      maxPositions: 3,
      timeframe: 'intraday',
      testAreaRiskPct: 1.1
    }
  }
});

function setStatus(text, isError = false) {
  const statusNode = document.getElementById('ai-bot-status');
  if (!statusNode) {
    return;
  }
  if (typeof window.clearSignInCallout === 'function') {
    window.clearSignInCallout('ai-bot-status');
  }
  statusNode.textContent = text;
  statusNode.className = isError ? 'small-note ai-section auth-error' : 'small-note ai-section';
}

function showSignInNeeded(message = 'Please log in to use AI Bot Trader.') {
  const nextPath = `${window.location.pathname || '/ai-bot-trader.html'}${window.location.search || ''}${window.location.hash || ''}`;
  if (typeof window.showSignInCallout === 'function') {
    window.showSignInCallout({
      statusElementId: 'ai-bot-status',
      message,
      nextPath,
      linkLabel: 'Sign in to continue'
    });
    return;
  }
  setStatus(message, true);
}

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function bindAuthBannerLinks() {
  const signInLink = document.getElementById('ai-auth-signin');
  const signUpLink = document.getElementById('ai-auth-signup');
  const nextPath = `${window.location.pathname || '/ai-bot-trader.html'}${window.location.search || ''}${window.location.hash || ''}`;
  if (signInLink instanceof HTMLAnchorElement) {
    signInLink.href = `/ai-trade-access.html?mode=login&next=${encodeURIComponent(nextPath)}`;
  }
  if (signUpLink instanceof HTMLAnchorElement) {
    signUpLink.href = `/ai-trade-access.html?mode=signup&next=${encodeURIComponent(nextPath)}`;
  }
}

function updateAuthBannerVisibility(isAuthenticated) {
  const banner = document.getElementById('ai-bot-auth-banner');
  if (!banner) {
    return;
  }
  banner.hidden = Boolean(isAuthenticated);
}

function setInitialSkeletonState() {
  const summaryNode = document.getElementById('ai-bot-summary');
  const planNode = document.getElementById('ai-bot-plan');
  const ordersNode = document.getElementById('ai-bot-orders');
  const logsNode = document.getElementById('ai-bot-logs');
  const followingNode = document.getElementById('ai-control-following');
  const linkNode = document.getElementById('ai-control-link-value');
  const skeleton = `
    <article class="bot-position-card ai-trader-skeleton-card">
      <div class="ai-trader-skeleton-line"></div>
      <div class="ai-trader-skeleton-line ai-trader-skeleton-line--wide"></div>
      <div class="ai-trader-skeleton-line"></div>
    </article>
  `;
  if (summaryNode) {
    summaryNode.innerHTML = skeleton;
  }
  if (planNode) {
    planNode.innerHTML = skeleton;
  }
  if (ordersNode) {
    ordersNode.innerHTML = skeleton;
  }
  if (logsNode) {
    logsNode.innerHTML = skeleton;
  }
  if (followingNode) {
    followingNode.innerHTML = skeleton;
  }
  if (linkNode) {
    linkNode.textContent = 'Preparing control link...';
  }
}

function requireSignedInForAction(message = 'Sign in to save your setup and activate the bot.') {
  if (uiState.isAuthenticated) {
    return true;
  }
  showSignInNeeded(message);
  updateAuthBannerVisibility(false);
  return false;
}

function deriveSetupProgress(payload) {
  const liveFunding = payload?.liveFunding || {};
  const execution = payload?.execution || {};
  const brokerConnection = execution.brokerConnection || {};
  const configured = Boolean(payload?.configured);
  const signedIn = uiState.isAuthenticated;
  const funded = Boolean(liveFunding.isFunded) || Number(liveFunding.fundedUsd || 0) > 0;
  const brokerConnected = Boolean(brokerConnection.isConnected && brokerConnection.permissions?.canTrade);
  const liveMode = String(payload?.tradingMode || 'paper').toLowerCase() === 'live';
  const liveActive = Boolean(payload?.isActive && liveMode);
  const readyForStart = signedIn && configured && funded && brokerConnected;
  return {
    signedIn,
    configured,
    funded,
    brokerConnected,
    readyForStart,
    liveActive
  };
}

function getCurrentHeroStep(progress) {
  if (!progress.signedIn) {
    return 'strategy';
  }
  if (!progress.configured) {
    return 'configure';
  }
  if (!progress.funded || !progress.brokerConnected) {
    return 'account';
  }
  return 'live';
}

function updateHeroStepTracker(progress) {
  const stepOrder = ['strategy', 'configure', 'account', 'live'];
  const current = getCurrentHeroStep(progress);
  const currentIndex = stepOrder.indexOf(current);
  const completionByStep = {
    strategy: progress.signedIn,
    configure: progress.configured,
    account: progress.funded && progress.brokerConnected,
    live: progress.liveActive
  };
  stepOrder.forEach((step, index) => {
    const node = document.querySelector(`[data-hero-step="${step}"]`);
    if (!node) {
      return;
    }
    node.classList.toggle('is-complete', Boolean(completionByStep[step]));
    node.classList.toggle('is-current', index === currentIndex);
    node.classList.toggle('is-upcoming', index > currentIndex);
  });
}

function updateSetupProgressUi(progress) {
  const stepCompletion = {
    1: progress.signedIn,
    2: progress.configured,
    3: progress.funded,
    4: progress.brokerConnected,
    5: progress.readyForStart
  };
  Object.keys(stepCompletion).forEach((stepKey) => {
    const node = document.querySelector(`.ai-setup-step-card[data-setup-step="${stepKey}"]`);
    if (!node) {
      return;
    }
    const done = Boolean(stepCompletion[stepKey]);
    node.classList.toggle('is-complete', done);
    node.classList.toggle('is-pending', !done);
  });
  const saveButton = document.getElementById('ai-step-save-action');
  if (saveButton instanceof HTMLButtonElement) {
    saveButton.textContent = progress.configured ? 'Save Settings ✓' : 'Save Settings';
  }
  const authButton = document.getElementById('ai-step-auth-action');
  if (authButton instanceof HTMLButtonElement) {
    authButton.textContent = progress.signedIn ? 'Signed In ✓' : 'Sign In / Sign Up →';
  }
  const startButton = document.getElementById('ai-step-start-action');
  if (startButton instanceof HTMLButtonElement) {
    startButton.disabled = !progress.readyForStart;
    startButton.classList.toggle('is-ready', progress.readyForStart);
  }
  updateHeroStepTracker(progress);
}

function updateControlStatusBanner(payload, progress) {
  const dot = document.getElementById('ai-control-status-dot');
  const textNode = document.getElementById('ai-control-status-text');
  const accountValueNode = document.getElementById('ai-control-account-value');
  const dayPnlNode = document.getElementById('ai-control-day-pnl');

  const isLiveMode = String(payload?.tradingMode || 'paper').toLowerCase() === 'live';
  const isActive = Boolean(payload?.isActive);
  let statusType = 'incomplete';
  let statusText = 'Setup Incomplete';
  if (isActive && isLiveMode) {
    statusType = 'active';
    statusText = 'Bot Active — Trading Now';
  } else if (!isActive && progress.readyForStart) {
    statusType = 'paused';
    statusText = 'Bot Paused';
  } else if (progress.configured) {
    statusType = 'stopped';
    statusText = 'Bot Stopped';
  }

  if (dot) {
    dot.className = `ai-control-status-dot ai-control-status-dot--${statusType}`;
  }
  if (textNode) {
    textNode.textContent = statusText;
  }

  const cash = Number(payload?.cashUsd || 0);
  const openExposure = Number(payload?.accountView?.portfolio?.openExposureUsd || 0);
  const equity = cash + openExposure;
  const cycleHistory = Array.isArray(payload?.cycleHistory) ? payload.cycleHistory : [];
  const todayPnl = cycleHistory.length > 0
    ? Number(cycleHistory[0]?.closedPnlUsd || 0)
    : 0;

  if (accountValueNode) {
    accountValueNode.textContent = fmtUsd(equity || cash);
  }
  if (dayPnlNode) {
    dayPnlNode.textContent = `${todayPnl >= 0 ? '+' : '-'}${fmtUsd(Math.abs(todayPnl))}`;
    dayPnlNode.classList.toggle('is-positive', todayPnl > 0);
    dayPnlNode.classList.toggle('is-negative', todayPnl < 0);
  }
}

function updateAccordionPreviews(payload) {
  const recentOrders = Array.isArray(payload?.execution?.recentBrokerOrders)
    ? payload.execution.recentBrokerOrders
    : [];
  const openPositions = Array.isArray(payload?.openPositions) ? payload.openPositions : [];
  const cycle = payload?.lastCycle || {};
  const closed = Array.isArray(cycle.closedPositions) ? cycle.closedPositions : [];
  const planPrompt = String(payload?.config?.prompt || '').trim();
  const winRate = Number(payload?.stats?.winRatePct || 0);

  const summaryPreview = document.getElementById('ai-accordion-preview-summary');
  if (summaryPreview) {
    summaryPreview.textContent = `${openPositions.length} open positions • ${fmtUsd(payload?.cashUsd || 0)} cash`;
  }
  const planPreview = document.getElementById('ai-accordion-preview-plan');
  if (planPreview) {
    planPreview.textContent = planPrompt
      ? `Prompt active • ${Math.min(planPrompt.length, 120)} chars configured`
      : 'No prompt set yet.';
  }
  const ordersPreview = document.getElementById('ai-accordion-preview-orders');
  if (ordersPreview) {
    ordersPreview.textContent = `${recentOrders.length} broker orders tracked • ${winRate.toFixed(1)}% win rate`;
  }
  const logsPreview = document.getElementById('ai-accordion-preview-logs');
  if (logsPreview) {
    logsPreview.textContent = `${closed.length} positions closed in latest cycle`;
  }
}

function setupAccordions() {
  const toggles = document.querySelectorAll('.ai-control-accordion-toggle');
  toggles.forEach((toggle) => {
    if (!(toggle instanceof HTMLButtonElement)) {
      return;
    }
    toggle.addEventListener('click', () => {
      const panelId = String(toggle.dataset.accordionTarget || '').trim();
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) {
        return;
      }
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      panel.classList.toggle('is-open', !expanded);
    });
  });
}

function updateGlobalUi(payload) {
  uiState.setupProgress = deriveSetupProgress(payload || {});
  updateSetupProgressUi(uiState.setupProgress);
  updateControlStatusBanner(payload || {}, uiState.setupProgress);
  updateAccordionPreviews(payload || {});
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

function getCheckboxValue(id, fallback = false) {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLInputElement)) {
    return fallback;
  }
  return Boolean(node.checked);
}

function getSelectedTradingMode() {
  const selected = document.getElementById('ai-bot-trading-mode');
  if (!(selected instanceof HTMLSelectElement)) {
    return 'paper';
  }
  return String(selected.value || 'paper').trim().toLowerCase() === 'live' ? 'live' : 'paper';
}

function syncAutoExecutionVisibility() {
  const modeSelect = document.getElementById('ai-bot-trading-mode');
  const autoWrap = document.getElementById('ai-bot-auto-execute-wrap');
  if (!(modeSelect instanceof HTMLSelectElement) || !autoWrap) {
    return;
  }
  const live = String(modeSelect.value || 'paper').trim().toLowerCase() === 'live';
  autoWrap.hidden = false;
  const autoExecuteNode = document.getElementById('ai-bot-auto-execute-live');
  if (autoExecuteNode instanceof HTMLInputElement) {
    if (!live) {
      autoExecuteNode.checked = false;
    }
    autoExecuteNode.disabled = !live;
  }
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
  setInput('ai-bot-capital', config.capitalUsd ?? 10000);
  setInput('ai-bot-risk-pct', config.riskPerTradePct ?? 1.5);
  setInput('ai-bot-test-risk-pct', config.testAreaRiskPct ?? config.riskPerTradePct ?? 1.5);
  setInput('ai-bot-test-capital', config.testAreaCapitalUsd ?? config.capitalUsd ?? 10000);
  setInput('ai-bot-target-return-pct', config.targetReturnPct ?? 12);
  setInput('ai-bot-min-rr', config.minRewardRiskRatio ?? 2);
  const autoExecuteNode = document.getElementById('ai-bot-auto-execute-live');
  if (autoExecuteNode instanceof HTMLInputElement) {
    autoExecuteNode.checked = Boolean(config.autoExecuteLive);
  }
  setInput('ai-bot-max-sector-exposure-pct', config.maxSectorExposurePct ?? 35);
  setInput('ai-bot-max-gross-exposure-pct', config.maxGrossExposurePct ?? 100);
  setInput('ai-bot-target-holdings', config.maxPositions ?? 4);
  setSelect('ai-bot-trading-mode', config.tradingMode || 'paper');
  setSelect('ai-bot-timeframe', config.timeframe || 'intraday');

  const selectedSectors = new Set(Array.isArray(config.sectors) ? config.sectors : []);
  const checkboxes = document.querySelectorAll('fieldset.ai-bot-sectors input[type="checkbox"]');
  checkboxes.forEach((node) => {
    if (node instanceof HTMLInputElement) {
      node.checked = selectedSectors.size ? selectedSectors.has(node.value) : node.checked;
    }
  });
  syncAutoExecutionVisibility();
}

function updateQuickProfileUi(profileKey) {
  const profile = QUICK_SETUP_PROFILES[profileKey] || QUICK_SETUP_PROFILES.balanced;
  activeQuickProfile = profileKey in QUICK_SETUP_PROFILES ? profileKey : 'balanced';
  const labelNode = document.getElementById('ai-bot-quick-profile');
  if (labelNode) {
    labelNode.textContent = `Risk profile: ${profile.label} (${profile.summary})`;
  }
  const presetButtons = document.querySelectorAll('.ai-bot-preset-btn');
  presetButtons.forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const key = String(node.dataset.presetProfile || '').trim().toLowerCase();
    const isActive = key === activeQuickProfile;
    node.classList.toggle('is-active', isActive);
    node.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function applyQuickProfile(profileKey, options = {}) {
  const profile = QUICK_SETUP_PROFILES[profileKey];
  if (!profile) {
    return;
  }
  const announce = options.announce !== false;
  const promptNode = document.getElementById('ai-bot-prompt');
  const existingPrompt = promptNode instanceof HTMLTextAreaElement ? promptNode.value.trim() : '';
  const currentCapital = getNumberInputValue('ai-bot-capital', 10000);
  const currentTestCapital = getNumberInputValue('ai-bot-test-capital', currentCapital);
  const currentTradingMode = getSelectedTradingMode();

  applyConfigToForm({
    ...profile.config,
    prompt: existingPrompt || profile.prompt,
    capitalUsd: currentCapital,
    testAreaCapitalUsd: currentTestCapital || currentCapital,
    tradingMode: currentTradingMode
  });
  updateQuickProfileUi(profileKey);
  if (announce) {
    setStatus(`${profile.label} quick profile applied. Use a quick save button to continue.`);
  }
}

function inferQuickProfileFromForm() {
  const risk = getNumberInputValue('ai-bot-risk-pct', QUICK_SETUP_PROFILES.balanced.config.riskPerTradePct);
  if (risk <= 1) {
    return 'conservative';
  }
  if (risk >= 2.2) {
    return 'aggressive';
  }
  return 'balanced';
}

function updateStrategyTemplateUi(templateKey) {
  const selectedKey = templateKey in STRATEGY_TEMPLATES ? templateKey : 'momentum-breakout';
  const template = STRATEGY_TEMPLATES[selectedKey];
  activeStrategyTemplate = selectedKey;
  const labelNode = document.getElementById('ai-strategy-template-active');
  if (labelNode) {
    labelNode.textContent = `Template: ${template.label} (${template.summary}).`;
  }
  const templateButtons = document.querySelectorAll('.ai-strategy-template-btn');
  templateButtons.forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const key = String(node.dataset.strategyTemplate || '').trim().toLowerCase();
    const isActive = key === selectedKey;
    node.classList.toggle('is-active', isActive);
    node.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function inferStrategyTemplateFromForm() {
  const timeframeNode = document.getElementById('ai-bot-timeframe');
  const timeframe = timeframeNode instanceof HTMLSelectElement
    ? String(timeframeNode.value || 'intraday').trim().toLowerCase()
    : 'intraday';
  const risk = getNumberInputValue('ai-bot-risk-pct', 1.5);
  const minRewardRisk = getNumberInputValue('ai-bot-min-rr', 1.8);
  if (timeframe === 'swing' && risk <= 1) {
    return 'mean-reversion';
  }
  if (minRewardRisk >= 2.4 && risk <= 1.2) {
    return 'volatility-regime';
  }
  if (timeframe === 'swing') {
    return 'trend-following';
  }
  return 'momentum-breakout';
}

function applyStrategyTemplate(templateKey, options = {}) {
  const template = STRATEGY_TEMPLATES[templateKey];
  if (!template) {
    return;
  }
  const announce = options.announce !== false;
  const currentCapital = getNumberInputValue('ai-bot-capital', 10000);
  const currentTestCapital = getNumberInputValue('ai-bot-test-capital', currentCapital);
  const currentTradingMode = getSelectedTradingMode();
  applyConfigToForm({
    ...template.config,
    prompt: template.prompt,
    capitalUsd: currentCapital,
    testAreaCapitalUsd: currentTestCapital || currentCapital,
    tradingMode: currentTradingMode
  });
  updateStrategyTemplateUi(templateKey);
  if (announce) {
    setStatus(`${template.label} template applied. Save setup to continue.`);
  }
}

function setupStrategyTemplateActions() {
  const templateButtons = document.querySelectorAll('.ai-strategy-template-btn');
  templateButtons.forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    node.addEventListener('click', () => {
      const key = String(node.dataset.strategyTemplate || '').trim().toLowerCase();
      applyStrategyTemplate(key, { announce: true });
    });
  });
  updateStrategyTemplateUi(activeStrategyTemplate);
}

function setupQuickSetupActions() {
  const advancedDetails = document.getElementById('ai-bot-advanced-details');
  const toggleAdvancedButton = document.getElementById('ai-bot-toggle-advanced');
  const quickPaperButton = document.getElementById('ai-bot-quick-paper');
  const quickLiveButton = document.getElementById('ai-bot-quick-live');
  const modeSelect = document.getElementById('ai-bot-trading-mode');
  const presetButtons = document.querySelectorAll('.ai-bot-preset-btn');

  const syncAdvancedToggleLabel = () => {
    if (!(toggleAdvancedButton instanceof HTMLButtonElement) || !(advancedDetails instanceof HTMLDetailsElement)) {
      return;
    }
    toggleAdvancedButton.textContent = advancedDetails.open ? 'Hide Advanced Settings' : 'Show Advanced Settings';
  };

  if (advancedDetails instanceof HTMLDetailsElement && toggleAdvancedButton instanceof HTMLButtonElement) {
    toggleAdvancedButton.addEventListener('click', () => {
      advancedDetails.open = !advancedDetails.open;
      syncAdvancedToggleLabel();
    });
    advancedDetails.addEventListener('toggle', syncAdvancedToggleLabel);
    syncAdvancedToggleLabel();
  }

  presetButtons.forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    node.addEventListener('click', () => {
      const key = String(node.dataset.presetProfile || '').trim().toLowerCase();
      applyQuickProfile(key, { announce: true });
    });
  });

  updateQuickProfileUi(activeQuickProfile);

  const saveQuickConfigAndRedirect = async (targetMode, destination, modeLabel, button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    try {
      button.disabled = true;
      if (modeSelect instanceof HTMLSelectElement) {
        modeSelect.value = targetMode;
      }
      syncAutoExecutionVisibility();
      setStatus(`Saving ${modeLabel} quick setup...`);
      await saveBotConfig();
      setStatus(`Saved. Opening ${modeLabel} setup...`);
      window.location.href = destination;
    } catch (error) {
      setStatus(error.message || `Could not save ${modeLabel} quick setup.`, true);
    } finally {
      button.disabled = false;
    }
  };

  if (quickPaperButton instanceof HTMLButtonElement) {
    quickPaperButton.addEventListener('click', async () => {
      await saveQuickConfigAndRedirect('paper', '/ai-bot-funding.html', 'Test Area', quickPaperButton);
    });
  }
  if (quickLiveButton instanceof HTMLButtonElement) {
    quickLiveButton.addEventListener('click', async () => {
      await saveQuickConfigAndRedirect('live', '/ai-live-account-setup.html', 'Live Account', quickLiveButton);
    });
  }
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
      <p><strong>Hands-free live execution:</strong> ${payload?.config?.autoExecuteLive ? 'ENABLED' : 'DISABLED'}</p>
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
      <p><strong>Min Reward/Risk:</strong> ${Number(cfg.minRewardRiskRatio || 2).toLocaleString(undefined, { maximumFractionDigits: 2 })}x</p>
      <p><strong>Hands-free live execution:</strong> ${cfg.autoExecuteLive ? 'Enabled' : 'Disabled'}</p>
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
  linkNode.textContent = directLink;
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
    updateGlobalUi(null);
    return;
  }
  renderBotSummary(payload);
  renderPlan(payload);
  renderOrders(payload.lastCycle || null);
  renderLogs(payload.lastCycle || null);
  renderControlCenter(payload);
  applyConfigToForm(payload.config || {});
  updateQuickProfileUi(inferQuickProfileFromForm());
  updateStrategyTemplateUi(inferStrategyTemplateFromForm());
  if (payload?.configured) {
    markBotConfiguredProgress();
  }
  updateGlobalUi(payload);
}

async function loadBotState() {
  if (!uiState.isAuthenticated) {
    renderState(null);
    return null;
  }
  const [payload, accountView] = await Promise.all([
    requestWithAuthRetry('/api/market/auto-trader/bot', {
      method: 'GET'
    }),
    requestWithAuthRetry('/api/market/auto-trader/account-view', {
      method: 'GET'
    }).catch(() => null)
  ]);
  const merged = accountView
    ? {
      ...payload,
      accountView
    }
    : payload;
  renderState(merged);
  return merged;
}

async function saveBotConfig() {
  if (!requireSignedInForAction()) {
    throw new Error('Please sign in to save your setup.');
  }
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
    riskPerTradePct,
    chasePct: 0.8,
    allocationPerTradePct: Math.max(4, Math.min(60, Math.round(100 / Math.max(1, targetHoldings)))),
    maxSectorExposurePct: getNumberInputValue('ai-bot-max-sector-exposure-pct', 35),
    maxPositions: targetHoldings,
    stopLossPct: Math.max(0.5, riskPerTradePct * 1.5),
    takeProfitPct: Math.max(1.2, riskPerTradePct * 3),
    targetReturnPct: getNumberInputValue('ai-bot-target-return-pct', 8),
    minRewardRiskRatio: getNumberInputValue('ai-bot-min-rr', 2),
    autoExecuteLive: true,
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
  markBotConfiguredProgress();
  return saved;
}

async function runCycle() {
  const payload = await requestWithAuthRetry('/api/market/auto-trader/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  renderState(payload.bot || payload);
  return payload;
}

async function sendPromptControlUpdate() {
  if (!requireSignedInForAction()) {
    throw new Error('Please sign in to send instructions to AI.');
  }
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
  if (!requireSignedInForAction()) {
    throw new Error('Please sign in to control live trading.');
  }
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
  const modeSelect = document.getElementById('ai-bot-trading-mode');
  const stepAuthAction = document.getElementById('ai-step-auth-action');
  const stepSaveAction = document.getElementById('ai-step-save-action');
  const stepFundingAction = document.getElementById('ai-step-funding-action');
  const stepBrokerAction = document.getElementById('ai-step-broker-action');
  const stepStartAction = document.getElementById('ai-step-start-action');

  const gotoSignIn = () => {
    const nextPath = `${window.location.pathname || '/ai-bot-trader.html'}${window.location.search || ''}${window.location.hash || ''}`;
    window.location.href = `/ai-trade-access.html?next=${encodeURIComponent(nextPath)}`;
  };

  if (stepAuthAction instanceof HTMLButtonElement) {
    stepAuthAction.addEventListener('click', () => {
      if (uiState.isAuthenticated) {
        setStatus('You are already signed in.');
        return;
      }
      gotoSignIn();
    });
  }
  if (stepSaveAction instanceof HTMLButtonElement) {
    stepSaveAction.addEventListener('click', async () => {
      try {
        stepSaveAction.disabled = true;
        setStatus('Saving your strategy...');
        await saveBotConfig();
        setStatus('Strategy saved.');
      } catch (error) {
        setStatus(error.message || 'Could not save your strategy.', true);
      } finally {
        stepSaveAction.disabled = false;
      }
    });
  }
  if (stepFundingAction instanceof HTMLButtonElement) {
    stepFundingAction.addEventListener('click', () => {
      if (!requireSignedInForAction()) {
        return;
      }
      window.location.href = '/ai-bot-funding.html#ai-funding-form';
    });
  }
  if (stepBrokerAction instanceof HTMLButtonElement) {
    stepBrokerAction.addEventListener('click', () => {
      if (!requireSignedInForAction()) {
        return;
      }
      window.location.href = '/brokerage-onboarding.html#broker-connect-form';
    });
  }
  if (stepStartAction instanceof HTMLButtonElement) {
    stepStartAction.addEventListener('click', async () => {
      if (!uiState.setupProgress.readyForStart) {
        setStatus('Complete steps 1-4 first to start hands-free trading.', true);
        return;
      }
      try {
        stepStartAction.disabled = true;
        setStatus('Starting hands-free AI trading...');
        await setBotActive(true);
        setStatus('Hands-free AI trading is now active.');
      } catch (error) {
        setStatus(error.message || 'Could not start hands-free trading.', true);
      } finally {
        stepStartAction.disabled = false;
      }
    });
  }

  if (modeSelect instanceof HTMLSelectElement) {
    modeSelect.addEventListener('change', () => {
      syncAutoExecutionVisibility();
    });
    syncAutoExecutionVisibility();
  }
  setupQuickSetupActions();
  setupStrategyTemplateActions();

  if (fundingButton instanceof HTMLButtonElement) {
    fundingButton.addEventListener('click', () => {
      if (!requireSignedInForAction()) {
        return;
      }
      window.location.href = '/ai-bot-funding.html';
    });
  }
  if (accountButton instanceof HTMLButtonElement) {
    accountButton.addEventListener('click', () => {
      if (!requireSignedInForAction()) {
        return;
      }
      window.location.href = '/ai-bot-account.html';
    });
  }
  if (brokerageButton instanceof HTMLButtonElement) {
    brokerageButton.addEventListener('click', () => {
      if (!requireSignedInForAction()) {
        return;
      }
      window.location.href = '/brokerage-onboarding.html';
    });
  }

  if (refreshControlLinkButton instanceof HTMLButtonElement) {
    refreshControlLinkButton.addEventListener('click', async () => {
      if (!requireSignedInForAction()) {
        return;
      }
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
      if (!requireSignedInForAction()) {
        return;
      }
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
      if (!requireSignedInForAction()) {
        return;
      }
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

  if (refreshButton instanceof HTMLButtonElement) {
    refreshButton.addEventListener('click', async () => {
      if (!requireSignedInForAction()) {
        return;
      }
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
      if (!requireSignedInForAction()) {
        return;
      }
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
      if (!requireSignedInForAction()) {
        return;
      }
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
  bindAuthBannerLinks();
  setInitialSkeletonState();
  setupAccordions();
  setupForm();

  const existingToken = getStoredToken();
  if (!existingToken) {
    await tryRestoreSession();
  }
  const token = getStoredToken();
  uiState.isAuthenticated = Boolean(token);
  updateAuthBannerVisibility(uiState.isAuthenticated);

  if (!uiState.isAuthenticated) {
    updateGlobalUi(null);
    setStatus('Sign in to save your setup and activate the bot.');
    return;
  }
  try {
    await loadBotState();
    setStatus('AI Bot Trader ready.');
  } catch (error) {
    if (error.status === 401) {
      uiState.isAuthenticated = false;
      updateAuthBannerVisibility(false);
      updateGlobalUi(null);
      showSignInNeeded('Please sign in to save your setup and activate the bot.');
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
