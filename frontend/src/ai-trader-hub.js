const AI_TRADER_STATUS_PILL_EVENT = 'dumbdollars:bot-status-update';
const AUTH_TOKEN_STORAGE_KEY = 'dumbdollars_token';
const NYSE_HOLIDAYS_2026 = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25'
]);

const ET_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const SETUP_STEP_ORDER = [
  'setup_step_1_complete',
  'setup_step_2_complete',
  'setup_step_3_complete',
  'setup_step_4_complete',
  'setup_step_5_complete'
];

const SETUP_LEGACY_STEP_MAP = Object.freeze({
  setup_step_1_complete: 'accountCreated',
  setup_step_2_complete: 'settingsSaved',
  setup_step_3_complete: 'brokerageReady',
  setup_step_4_complete: 'brokerConnected',
  setup_step_5_complete: 'botStartedOnce'
});

const BROKER_CONFIG = Object.freeze({
  alpaca: {
    label: 'Alpaca',
    apiLabel: 'API Key',
    apiPlaceholder: 'Paste your Alpaca API Key here',
    apiHelper: 'Found in your Alpaca dashboard → API Keys section',
    apiLink: 'https://app.alpaca.markets',
    apiLinkLabel: 'How to find this →',
    needsSecret: true,
    secretLabel: 'Secret Key',
    secretHelper: 'You only see this once when generated. Lost it? Make a new one.',
    needsAccountId: false
  },
  tradier: {
    label: 'Tradier',
    apiLabel: 'Access Token',
    apiPlaceholder: 'Paste your Tradier access token here',
    apiHelper: 'Create this token in Tradier → API settings.',
    apiLink: 'https://brokerage.tradier.com/settings/api',
    apiLinkLabel: 'Open Tradier API settings →',
    needsSecret: false,
    secretLabel: 'Secret Key',
    secretHelper: '',
    needsAccountId: true,
    accountLabel: 'Account ID',
    accountPlaceholder: 'Paste your Tradier account ID'
  },
  ibkr: {
    label: 'IBKR',
    apiLabel: 'API Key (optional)',
    apiPlaceholder: 'Optional for IBKR socket mode',
    apiHelper: 'IBKR uses account ID + enabled API socket access.',
    apiLink: 'https://www.interactivebrokers.com/en/software/api/api.htm',
    apiLinkLabel: 'IBKR API documentation →',
    needsSecret: false,
    secretLabel: 'Secret Key',
    secretHelper: '',
    needsAccountId: true,
    accountLabel: 'Account ID',
    accountPlaceholder: 'Paste your IBKR account ID'
  }
});

const state = {
  mounted: false,
  authRequired: false,
  status: null,
  positions: [],
  activity: [],
  scanner: {
    isScanning: false,
    rows: []
  },
  performance: null,
  selectedPerformancePeriod: 'today',
  selectedRiskLevel: 'moderate',
  selectedUniverse: 'sp500',
  selectedBroker: 'alpaca',
  selectedBrokerMode: 'paper',
  scanIntervalSeconds: 300,
  nextScanSeconds: null,
  connectionIssues: 0,
  localMarket: null,
  controlsDropdownOpen: false,
  seenActivityIds: new Set(),
  setup: {
    steps: SETUP_STEP_ORDER.reduce((acc, key) => ({ ...acc, [key]: false }), {}),
    completed: false,
    currentStepKey: SETUP_STEP_ORDER[0]
  },
  activeSetupStepKey: SETUP_STEP_ORDER[0],
  forceShowSetupGuide: false,
  brokerTest: {
    passed: false,
    payload: null,
    checks: [],
    accountInfo: null
  },
  timers: {
    oneSecond: null,
    status: null,
    activity: null,
    positions: null,
    scanner: null,
    performance: null
  }
};

function byId(id) {
  return document.getElementById(id);
}

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUsd(value) {
  const parsed = toNum(value, 0);
  return `$${parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedUsd(value) {
  const parsed = toNum(value, 0);
  const sign = parsed > 0 ? '+' : parsed < 0 ? '-' : '';
  return `${sign}$${Math.abs(parsed).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value, digits = 1) {
  return `${toNum(value, 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function formatSignedPct(value, digits = 1) {
  const parsed = toNum(value, 0);
  const sign = parsed > 0 ? '+' : parsed < 0 ? '-' : '';
  return `${sign}${Math.abs(parsed).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function getStoredToken() {
  try {
    return String(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '').trim();
  } catch (_error) {
    return '';
  }
}

function buildAuthHeaders() {
  const token = getStoredToken();
  if (!token) {
    return {};
  }
  return { authorization: `Bearer ${token}` };
}

async function tryRestoreAuthSession() {
  try {
    const response = await fetch('/api/auth/session/restore', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    const token = String(payload?.token || '').trim();
    if (!token) {
      return false;
    }
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    return true;
  } catch (_error) {
    return false;
  }
}

async function fetchJsonWithAuthRetry(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const request = {
    ...options,
    signal: controller.signal,
    credentials: 'include',
    headers: {
      ...(options.headers || {}),
      ...buildAuthHeaders()
    }
  };
  let response;
  try {
    response = await fetch(url, request);
  } catch (error) {
    window.clearTimeout(timeout);
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Request timed out. Retrying…');
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  }
  window.clearTimeout(timeout);
  if (response.status === 401) {
    await tryRestoreAuthSession();
    response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.headers || {}),
        ...buildAuthHeaders()
      }
    });
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.body = payload;
    throw error;
  }
  return payload;
}

async function fetchWithFallback(primaryUrl, fallbackUrl, options = {}) {
  try {
    return await fetchJsonWithAuthRetry(primaryUrl, options);
  } catch (error) {
    if (error?.status === 404 && fallbackUrl) {
      return fetchJsonWithAuthRetry(fallbackUrl, options);
    }
    throw error;
  }
}

function showConnectionBanner(show) {
  const banner = byId('ai-trader-connection-banner');
  if (!banner) {
    return;
  }
  banner.classList.toggle('hidden', !show);
}

function registerConnectionFailure() {
  state.connectionIssues += 1;
  showConnectionBanner(true);
}

function registerConnectionSuccess() {
  state.connectionIssues = 0;
  showConnectionBanner(false);
}

function showToast(message, tone = 'info', durationMs = 2600) {
  const stack = byId('ai-trader-toast-stack');
  if (!stack) {
    return;
  }
  const toast = document.createElement('article');
  toast.className = `ai-trader-toast ai-trader-toast--${tone}`;
  toast.textContent = String(message || '').trim();
  stack.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => toast.remove(), 240);
  }, durationMs);
}

function setButtonLoading(button, loading) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const spinner = button.querySelector('.ai-trader-button-spinner');
  if (spinner) {
    spinner.classList.toggle('hidden', !loading);
  }
  button.classList.toggle('is-loading', loading);
  button.dataset.loading = loading ? '1' : '0';
}

function emitBotStatusPill(payload) {
  try {
    window.dispatchEvent(new CustomEvent(AI_TRADER_STATUS_PILL_EVENT, { detail: payload }));
  } catch (_error) {
    // Non-fatal.
  }
}

function etParts(date = new Date()) {
  const parts = ET_TIME_FORMATTER.formatToParts(date);
  const bag = {};
  parts.forEach((part) => {
    bag[part.type] = part.value;
  });
  const dayMap = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: dayMap[bag.weekday] ?? 0
  };
}

function etDateStamp(parts) {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function etComparable(parts) {
  return (
    (parts.year * 10000000000)
    + (parts.month * 100000000)
    + (parts.day * 1000000)
    + (parts.hour * 10000)
    + (parts.minute * 100)
    + parts.second
  );
}

function makeEtParts(baseParts, addDays = 0, hour = 0, minute = 0, second = 0) {
  const utcDate = new Date(Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day + addDays, 0, 0, 0));
  const next = etParts(utcDate);
  return {
    ...next,
    hour,
    minute,
    second
  };
}

function secondsBetweenEt(fromParts, toParts) {
  if (etComparable(toParts) <= etComparable(fromParts)) {
    return 0;
  }
  const fromDate = new Date(Date.UTC(
    fromParts.year,
    fromParts.month - 1,
    fromParts.day,
    fromParts.hour,
    fromParts.minute,
    fromParts.second
  ));
  const toDate = new Date(Date.UTC(
    toParts.year,
    toParts.month - 1,
    toParts.day,
    toParts.hour,
    toParts.minute,
    toParts.second
  ));
  return Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / 1000));
}

function formatHoursMinutes(secondsRaw) {
  const seconds = Math.max(0, Math.round(Number(secondsRaw || 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function computeLocalMarketStatus() {
  const nowEt = etParts(new Date());
  const dateStamp = etDateStamp(nowEt);
  const isWeekend = nowEt.weekday === 0 || nowEt.weekday === 6;
  const isHoliday = NYSE_HOLIDAYS_2026.has(dateStamp);
  const openEt = { ...nowEt, hour: 9, minute: 30, second: 0 };
  const closeEt = { ...nowEt, hour: 16, minute: 0, second: 0 };
  const nowValue = etComparable(nowEt);
  const openValue = etComparable(openEt);
  const closeValue = etComparable(closeEt);
  if (isWeekend) {
    return { state: 'CLOSED', detail: 'CLOSED — Weekend', isOpen: false };
  }
  if (isHoliday) {
    return { state: 'CLOSED', detail: 'CLOSED — Holiday', isOpen: false };
  }
  if (nowValue >= openValue && nowValue < closeValue) {
    const closeIn = secondsBetweenEt(nowEt, closeEt);
    return { state: 'OPEN', detail: `Closes in ${formatHoursMinutes(closeIn)}`, isOpen: true };
  }
  if (nowValue < openValue) {
    const openIn = secondsBetweenEt(nowEt, openEt);
    return { state: 'CLOSED', detail: `Opens in ${formatHoursMinutes(openIn)}`, isOpen: false };
  }
  let offset = 1;
  while (offset <= 7) {
    const candidate = makeEtParts(nowEt, offset, 9, 30, 0);
    const candidateWeekend = candidate.weekday === 0 || candidate.weekday === 6;
    const candidateHoliday = NYSE_HOLIDAYS_2026.has(etDateStamp(candidate));
    if (!candidateWeekend && !candidateHoliday) {
      const openIn = secondsBetweenEt(nowEt, candidate);
      return { state: 'CLOSED', detail: `Opens in ${formatHoursMinutes(openIn)}`, isOpen: false };
    }
    offset += 1;
  }
  return { state: 'CLOSED', detail: 'Opens next session', isOpen: false };
}

function statusVisualWord() {
  const control = String(state.status?.controlState || '').toLowerCase();
  if (control === 'running') {
    return 'RUNNING';
  }
  if (control === 'paused') {
    return 'PAUSED';
  }
  return 'STOPPED';
}

function isBrokerConnectedFromStatus(status = state.status) {
  return Boolean(status?.brokerConnected)
    && Boolean(status?.bot?.execution?.brokerConnection?.auth?.secretSaved || status?.bot?.execution?.brokerConnection?.auth?.loginSaved);
}

function resolveDropdownStatusWord() {
  const market = state.localMarket || computeLocalMarketStatus();
  if (!market.isOpen) {
    return 'MARKET CLOSED';
  }
  return statusVisualWord();
}

function setControlsDropdownOpen(open) {
  const dropdown = byId('ai-trader-controls-dropdown');
  const toggle = byId('ai-trader-controls-toggle');
  if (!(dropdown && toggle instanceof HTMLButtonElement)) {
    return;
  }
  state.controlsDropdownOpen = Boolean(open);
  dropdown.classList.toggle('hidden', !state.controlsDropdownOpen);
  toggle.setAttribute('aria-expanded', state.controlsDropdownOpen ? 'true' : 'false');
}

function closeControlsDropdown() {
  setControlsDropdownOpen(false);
}

function toggleControlsDropdown() {
  setControlsDropdownOpen(!state.controlsDropdownOpen);
}

function updateControlsDropdownStatus() {
  const statusLabel = resolveDropdownStatusWord();
  const statusDot = byId('ai-trader-dropdown-status-dot');
  const statusText = byId('ai-trader-dropdown-status-text');
  const toggleDot = byId('ai-trader-controls-toggle-dot');
  const tone = statusLabel === 'RUNNING'
    ? 'running'
    : statusLabel === 'PAUSED'
      ? 'paused'
      : statusLabel === 'MARKET CLOSED'
        ? 'closed'
        : 'stopped';
  [statusDot, toggleDot].forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.classList.remove('status-running', 'status-paused', 'status-stopped', 'status-closed');
    node.classList.add(`status-${tone}`);
  });
  if (statusText) {
    statusText.textContent = statusLabel;
  }
}

function normalizeSetupSteps(rawSetup = {}) {
  const rawSteps = rawSetup?.stepFlags && typeof rawSetup.stepFlags === 'object'
    ? rawSetup.stepFlags
    : rawSetup?.steps && typeof rawSetup.steps === 'object'
      ? rawSetup.steps
      : {};
  const mapped = {};
  SETUP_STEP_ORDER.forEach((key) => {
    const legacyKey = SETUP_LEGACY_STEP_MAP[key];
    mapped[key] = Boolean(rawSteps[key] ?? rawSteps[legacyKey]);
  });
  if (!state.authRequired) {
    mapped.setup_step_1_complete = true;
  }
  if (isBrokerConnectedFromStatus()) {
    mapped.setup_step_4_complete = true;
  }
  const allComplete = SETUP_STEP_ORDER.every((key) => mapped[key]);
  const currentStepKey = SETUP_STEP_ORDER.find((key) => !mapped[key]) || SETUP_STEP_ORDER[SETUP_STEP_ORDER.length - 1];
  return {
    steps: mapped,
    completed: allComplete,
    currentStepKey
  };
}

function syncSetupStateFromStatus() {
  const normalized = normalizeSetupSteps(state.status?.setup || {});
  state.setup = normalized;
  if (!state.activeSetupStepKey || !SETUP_STEP_ORDER.includes(state.activeSetupStepKey)) {
    state.activeSetupStepKey = normalized.currentStepKey;
    return;
  }
  const activeComplete = Boolean(state.setup.steps[state.activeSetupStepKey]);
  if (!state.forceShowSetupGuide && activeComplete) {
    state.activeSetupStepKey = normalized.currentStepKey;
  }
}

function applyLocalSetupStep(stepKey, complete = true) {
  if (!SETUP_STEP_ORDER.includes(stepKey)) {
    return;
  }
  state.setup.steps[stepKey] = Boolean(complete);
  state.setup.completed = SETUP_STEP_ORDER.every((key) => Boolean(state.setup.steps[key]));
  state.setup.currentStepKey = SETUP_STEP_ORDER.find((key) => !state.setup.steps[key]) || SETUP_STEP_ORDER[SETUP_STEP_ORDER.length - 1];
}

function applyTopStatus() {
  const chip = byId('ai-trader-hub-top-status');
  const orb = byId('ai-trader-status-orb');
  const word = byId('ai-trader-status-word');
  const subline = byId('ai-trader-status-subline');
  const statusWord = statusVisualWord();
  const chipClass = statusWord === 'RUNNING'
    ? 'ai-trader-status-chip--running'
    : statusWord === 'PAUSED'
      ? 'ai-trader-status-chip--paused'
      : 'ai-trader-status-chip--stopped';
  const orbClass = statusWord === 'RUNNING'
    ? 'ai-trader-status-orb--running'
    : statusWord === 'PAUSED'
      ? 'ai-trader-status-orb--paused'
      : 'ai-trader-status-orb--stopped';
  if (chip) {
    chip.className = `chip ai-trader-status-chip ${chipClass}`;
    chip.textContent = `BOT ${statusWord}`;
  }
  if (orb) {
    orb.className = `ai-trader-status-orb ${orbClass}`;
  }
  if (word) {
    word.textContent = statusWord;
  }
  if (subline) {
    if (statusWord === 'RUNNING') {
      subline.textContent = 'Bot is scanning and can place new trades.';
    } else if (statusWord === 'PAUSED') {
      subline.textContent = 'Bot is paused. Open positions remain monitored.';
    } else {
      subline.textContent = 'Bot is stopped. Press START when ready.';
    }
  }
  updateControlsDropdownStatus();
  const market = state.localMarket || computeLocalMarketStatus();
  emitBotStatusPill({
    statusWord,
    stateClass: statusWord === 'RUNNING' ? 'running' : statusWord === 'PAUSED' ? 'paused' : 'off',
    isRunning: statusWord === 'RUNNING',
    brokerConnected: isBrokerConnectedFromStatus(),
    marketOpen: Boolean(market?.isOpen),
    href: '/#ai-trader-hub'
  });
}

function setControlsDisabledState() {
  const startBtn = byId('ai-trader-start-btn');
  const pauseBtn = byId('ai-trader-pause-btn');
  const stopBtn = byId('ai-trader-stop-btn');
  const statusWord = statusVisualWord();
  const startBusy = startBtn?.dataset.loading === '1';
  const pauseBusy = pauseBtn?.dataset.loading === '1';
  const stopBusy = stopBtn?.dataset.loading === '1';
  if (startBtn instanceof HTMLButtonElement) {
    startBtn.disabled = startBusy || statusWord === 'RUNNING';
  }
  if (pauseBtn instanceof HTMLButtonElement) {
    pauseBtn.disabled = pauseBusy || statusWord === 'PAUSED' || statusWord === 'STOPPED';
  }
  if (stopBtn instanceof HTMLButtonElement) {
    stopBtn.disabled = stopBusy || statusWord === 'STOPPED';
  }
}

function renderStatsBar() {
  const stats = state.status?.stats || {};
  const tradesNode = byId('ai-trader-stat-trades-today');
  const winNode = byId('ai-trader-stat-win-rate');
  const pnlNode = byId('ai-trader-stat-pnl-today');
  const openNode = byId('ai-trader-stat-open-positions');
  const openProgress = byId('ai-trader-stat-open-progress-fill');
  const scanNode = byId('ai-trader-stat-next-scan');
  const marketNode = byId('ai-trader-stat-market-status');
  const marketDetail = byId('ai-trader-stat-market-detail');
  const pnlToday = toNum(stats.pnlToday, 0);
  const openPositions = Math.max(0, toNum(stats.openPositions, 0));
  const maxOpenPositions = Math.max(1, toNum(stats.maxOpenPositions, 1));
  const market = state.localMarket || computeLocalMarketStatus();
  if (tradesNode) {
    tradesNode.textContent = String(toNum(stats.tradesToday, 0));
  }
  if (winNode) {
    winNode.textContent = formatPct(stats.winRateToday, 0);
  }
  if (pnlNode) {
    pnlNode.textContent = formatSignedUsd(pnlToday);
    pnlNode.classList.toggle('is-positive', pnlToday > 0);
    pnlNode.classList.toggle('is-negative', pnlToday < 0);
    pnlNode.classList.toggle('is-neutral', pnlToday === 0);
  }
  if (openNode) {
    openNode.textContent = `${openPositions} / ${maxOpenPositions}`;
  }
  if (openProgress) {
    const pct = clamp((openPositions / maxOpenPositions) * 100, 0, 100);
    openProgress.style.width = `${pct}%`;
  }
  if (scanNode) {
    scanNode.textContent = state.nextScanSeconds === null ? '--s' : `${Math.max(0, Math.round(state.nextScanSeconds))}s`;
  }
  if (marketNode) {
    marketNode.textContent = market.state;
    marketNode.classList.toggle('is-market-open', market.isOpen);
    marketNode.classList.toggle('is-market-closed', !market.isOpen);
  }
  if (marketDetail) {
    marketDetail.textContent = market.detail || '--';
  }
}

function typeDotClass(typeRaw) {
  const type = String(typeRaw || '').toUpperCase();
  if (type.includes('BUY')) {
    return 'buy';
  }
  if (type.includes('SELL')) {
    return 'sell';
  }
  if (type.includes('STOP LOSS')) {
    return 'stop-loss';
  }
  if (type.includes('TAKE PROFIT')) {
    return 'take-profit';
  }
  return 'scan';
}

function formatClock(value) {
  if (!value) {
    return '--:--:--';
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return '--:--:--';
  }
  return date.toLocaleTimeString([], { hour12: false });
}

function renderActivityFeed() {
  const list = byId('ai-trader-activity-list');
  if (!list) {
    return;
  }
  const rows = Array.isArray(state.activity) ? state.activity : [];
  if (!rows.length) {
    list.innerHTML = `
      <article class="ai-trader-empty-state ai-trader-empty-state--center">
        <div class="ai-trader-empty-icon">📡</div>
        <h4>No activity yet</h4>
        <p>Start the bot to see live trade actions here</p>
      </article>
    `;
    return;
  }
  list.innerHTML = rows.map((row) => {
    const id = String(row?.id || `${row?.timestamp || ''}:${row?.ticker || ''}`);
    const isNew = !state.seenActivityIds.has(id);
    const pnlUsd = row?.pnlUsd;
    const pnlClass = toNum(pnlUsd, 0) > 0 ? 'is-positive' : toNum(pnlUsd, 0) < 0 ? 'is-negative' : '';
    const pnlMarkup = pnlUsd === null || pnlUsd === undefined
      ? ''
      : `<span class="ai-trader-activity-pnl ${pnlClass}">${formatSignedUsd(pnlUsd)}</span>`;
    state.seenActivityIds.add(id);
    return `
      <article class="ai-trader-activity-item ${isNew ? 'is-new' : ''}">
        <div class="ai-trader-activity-left">
          <span class="ai-trader-activity-dot ${typeDotClass(row?.type)}" aria-hidden="true"></span>
          <span class="ai-trader-activity-time">${formatClock(row?.timestamp)}</span>
          <strong class="ai-trader-activity-ticker">${escapeHtml(row?.ticker || 'N/A')}</strong>
          <span class="ai-trader-activity-desc">${escapeHtml(row?.description || '')}</span>
        </div>
        ${pnlMarkup}
      </article>
    `;
  }).join('');
}

function heldTimeLabel(secondsRaw) {
  const seconds = Math.max(0, Math.round(toNum(secondsRaw, 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function renderPositions() {
  const grid = byId('ai-trader-positions-grid');
  const chip = byId('ai-trader-positions-chip');
  if (!grid) {
    return;
  }
  const rows = Array.isArray(state.positions) ? state.positions : [];
  if (chip) {
    chip.textContent = `${rows.length} open`;
  }
  if (!rows.length) {
    grid.innerHTML = `
      <article class="ai-trader-empty-state ai-trader-empty-state--center">
        <div class="ai-trader-empty-icon">📊</div>
        <h4>No open positions</h4>
        <p>Active trades will appear here once the bot starts trading</p>
      </article>
    `;
    return;
  }
  grid.innerHTML = rows.map((row) => {
    const pnlUsd = toNum(row?.pnlUsd, 0);
    const pnlPct = toNum(row?.pnlPct, 0);
    const cardClass = pnlUsd >= 0 ? 'is-positive' : 'is-negative';
    return `
      <article class="ai-trader-position-card ${cardClass}">
        <div class="ai-trader-position-top">
          <div>
            <h4>${escapeHtml(row?.ticker || 'N/A')}</h4>
            <p class="small-note">${escapeHtml(row?.companyName || '')}</p>
          </div>
          <span class="ai-trader-pnl-badge ${cardClass}">${formatSignedUsd(pnlUsd)} (${formatSignedPct(pnlPct, 2)})</span>
        </div>
        <div class="ai-trader-position-prices">
          <p class="ai-trader-position-price">${formatUsd(row?.currentPrice)}</p>
          <p class="small-note">Entry ${formatUsd(row?.entryPrice)}</p>
        </div>
        <div class="ai-trader-position-foot">
          <span>🔴 Stop ${formatUsd(row?.stopLoss)}</span>
          <span>🟢 Target ${formatUsd(row?.takeProfit)}</span>
          <span>⏱ ${heldTimeLabel(row?.heldSeconds)}</span>
        </div>
        <div class="ai-trader-position-actions">
          <button type="button" class="ai-trader-close-position-btn" data-close-position-id="${escapeHtml(row?.id || '')}">CLOSE</button>
        </div>
      </article>
    `;
  }).join('');
}

function scoreClass(scoreRaw) {
  const score = toNum(scoreRaw, 0);
  if (score >= 60) {
    return 'score-strong-buy';
  }
  if (score >= 20) {
    return 'score-buy';
  }
  if (score <= -35) {
    return 'score-sell';
  }
  return 'score-neutral';
}

function actionClass(actionRaw) {
  const action = String(actionRaw || '').toUpperCase();
  if (action === 'BUY') {
    return 'buy';
  }
  if (action === 'SELL') {
    return 'sell';
  }
  if (action === 'WATCH') {
    return 'watch';
  }
  return 'skip';
}

function renderScanner() {
  const panel = byId('ai-trader-scanner-panel');
  const list = byId('ai-trader-signal-list');
  if (!(panel && list)) {
    return;
  }
  panel.classList.toggle('is-scanning', Boolean(state.scanner?.isScanning));
  const rows = Array.isArray(state.scanner?.rows) ? state.scanner.rows : [];
  if (!rows.length) {
    list.innerHTML = `
      <article class="ai-trader-empty-state ai-trader-empty-state--center">
        <div class="ai-trader-empty-icon">🔍</div>
        <h4>Not scanning yet</h4>
        <p>The bot will scan your stock universe every 5 minutes during market hours once started</p>
      </article>
    `;
    return;
  }
  list.innerHTML = rows.map((row) => {
    const signals = row?.signals || {};
    const pill = (name) => {
      const signal = signals[name] || {};
      const tone = String(signal?.tone || 'grey').toLowerCase();
      return `<span class="ai-trader-signal-pill tone-${escapeHtml(tone)}">${escapeHtml(name)}</span>`;
    };
    return `
      <article class="ai-trader-signal-row">
        <div class="ai-trader-signal-symbol">
          <strong>${escapeHtml(row?.ticker || 'N/A')}</strong>
          <span>${escapeHtml(row?.company || '')}</span>
        </div>
        <div class="ai-trader-signal-pill-row">
          ${pill('RSI')}
          ${pill('MACD')}
          ${pill('VOL')}
          ${pill('BB')}
          ${pill('EMA')}
        </div>
        <div class="ai-trader-signal-score ${scoreClass(row?.score)}">
          <strong>${toNum(row?.score, 0)}</strong>
          <span class="ai-trader-action-badge ${actionClass(row?.action)}">${escapeHtml(row?.action || 'SKIP')}</span>
        </div>
      </article>
    `;
  }).join('');
}

function inferRiskLevelFromStatus() {
  const risk = toNum(state.status?.bot?.config?.riskPerTradePct, 1.2);
  if (risk <= 1) {
    return 'conservative';
  }
  if (risk >= 1.8) {
    return 'aggressive';
  }
  return 'moderate';
}

function inferUniverseFromStatus() {
  const sectors = Array.isArray(state.status?.bot?.config?.sectors) ? state.status.bot.config.sectors : [];
  const normalized = sectors.map((sector) => String(sector || '').toLowerCase());
  if (normalized.includes('technology') && normalized.includes('communication services') && normalized.includes('consumer discretionary')) {
    return 'nasdaq100';
  }
  if (sectors.length >= 6) {
    return 'sp500';
  }
  return 'custom';
}

function renderRiskLevelSelection() {
  document.querySelectorAll('.ai-trader-risk-card').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const active = String(node.dataset.riskLevel || '').toLowerCase() === state.selectedRiskLevel;
    node.classList.toggle('is-active', active);
    node.classList.toggle('is-inactive', !active);
    node.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function renderUniverseSelection() {
  document.querySelectorAll('#ai-trader-setting-universe .ai-trader-pill').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const active = String(node.dataset.universe || '').toLowerCase() === state.selectedUniverse;
    node.classList.toggle('is-active', active);
    node.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function updateStopLossText() {
  const input = byId('ai-trader-setting-stop-loss');
  const text = byId('ai-trader-setting-stop-loss-text');
  if (!(input instanceof HTMLInputElement) || !text) {
    return;
  }
  const value = clamp(toNum(input.value, 2.5), 0.5, 15);
  text.textContent = `Sell if down ${value.toFixed(1)}%`;
}

function updateTakeProfitText() {
  const input = byId('ai-trader-setting-take-profit');
  const text = byId('ai-trader-setting-take-profit-text');
  if (!(input instanceof HTMLInputElement) || !text) {
    return;
  }
  const value = clamp(toNum(input.value, 5.5), 1, 30);
  text.textContent = `Sell if up ${value.toFixed(1)}%`;
}

function currentAccountValue() {
  const value = toNum(state.status?.bot?.cashUsd, 0);
  const deposited = toNum(state.status?.bot?.totalDepositedUsd, 0);
  return Math.max(0, value || deposited);
}

function updatePositionSizeText() {
  const input = byId('ai-trader-setting-max-position-size');
  const text = byId('ai-trader-setting-position-size-text');
  if (!(input instanceof HTMLInputElement) || !text) {
    return;
  }
  if (!isBrokerConnectedFromStatus()) {
    text.textContent = 'Connect your broker to see your account size';
    return;
  }
  const accountValue = currentAccountValue();
  if (accountValue <= 0) {
    text.textContent = 'Connect your broker to see your account size';
    return;
  }
  const amount = Math.max(100, toNum(input.value, 1000));
  const pct = clamp((amount / accountValue) * 100, 0, 100);
  text.textContent = `= ${pct.toFixed(1)}% of your ${formatUsd(accountValue)} account`;
}

function applySettingsFromStatus() {
  const config = state.status?.bot?.config || {};
  const stopLossInput = byId('ai-trader-setting-stop-loss');
  const takeProfitInput = byId('ai-trader-setting-take-profit');
  const maxPositionSizeInput = byId('ai-trader-setting-max-position-size');
  const maxOpenValue = byId('ai-trader-setting-max-open-value');
  const dailyLossInput = byId('ai-trader-setting-daily-max-loss');
  const accountValue = Math.max(100, currentAccountValue() || 10_000);
  if (stopLossInput instanceof HTMLInputElement) {
    stopLossInput.value = String(clamp(toNum(config.stopLossPct, 2.5), 0.5, 15));
  }
  if (takeProfitInput instanceof HTMLInputElement) {
    takeProfitInput.value = String(clamp(toNum(config.takeProfitPct, 5.5), 1, 30));
  }
  if (maxPositionSizeInput instanceof HTMLInputElement) {
    const allocation = clamp(toNum(config.allocationPerTradePct, 20), 2, 80);
    maxPositionSizeInput.value = String(Math.round((allocation / 100) * accountValue));
  }
  if (maxOpenValue) {
    maxOpenValue.textContent = String(Math.max(1, Math.round(toNum(config.maxPositions, 4))));
  }
  if (dailyLossInput instanceof HTMLInputElement) {
    const lossUsd = Math.round((clamp(toNum(config.maxDailyLossPct, 3), 0.5, 25) / 100) * accountValue);
    dailyLossInput.value = String(Math.max(50, lossUsd));
  }
  state.selectedRiskLevel = inferRiskLevelFromStatus();
  state.selectedUniverse = inferUniverseFromStatus();
  renderRiskLevelSelection();
  renderUniverseSelection();
  updateStopLossText();
  updateTakeProfitText();
  updatePositionSizeText();
}

function getSettingsPayload() {
  const stopLossInput = byId('ai-trader-setting-stop-loss');
  const takeProfitInput = byId('ai-trader-setting-take-profit');
  const maxPositionSizeInput = byId('ai-trader-setting-max-position-size');
  const maxOpenValue = byId('ai-trader-setting-max-open-value');
  const dailyLossInput = byId('ai-trader-setting-daily-max-loss');
  return {
    risk_level: state.selectedRiskLevel,
    stop_loss_pct: clamp(toNum(stopLossInput?.value, 2.5), 0.5, 15),
    take_profit_pct: clamp(toNum(takeProfitInput?.value, 5.5), 1, 30),
    max_position_size: Math.max(100, Math.round(toNum(maxPositionSizeInput?.value, 1000))),
    max_open_positions: Math.max(1, Math.round(toNum(maxOpenValue?.textContent, 4))),
    stock_universe: state.selectedUniverse,
    daily_max_loss: Math.max(50, Math.round(toNum(dailyLossInput?.value, 500)))
  };
}

function showSettingsFeedback(message, tone = 'success') {
  const node = byId('ai-trader-settings-feedback');
  if (!node) {
    return;
  }
  node.textContent = message;
  node.classList.remove('is-success', 'is-error');
  node.classList.add(tone === 'error' ? 'is-error' : 'is-success');
  node.classList.add('is-visible');
  window.setTimeout(() => {
    node.classList.remove('is-visible');
  }, 2500);
}

function updateSaveButtonLabel(label) {
  const node = byId('ai-trader-save-settings-label');
  if (node) {
    node.textContent = label;
  }
}

async function persistSetupProgress(stepKey, complete = true) {
  if (!SETUP_STEP_ORDER.includes(stepKey)) {
    return;
  }
  try {
    await fetchJsonWithAuthRetry('/api/bot/setup-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepKey,
        complete: Boolean(complete)
      })
    });
    applyLocalSetupStep(stepKey, complete);
  } catch (_error) {
    // Non-fatal; status polling may still catch completion from source events.
  }
}

async function saveSettingsFlow() {
  const button = byId('ai-trader-save-settings-btn');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  setButtonLoading(button, true);
  button.disabled = true;
  updateSaveButtonLabel('Saving...');
  try {
    const payload = getSettingsPayload();
    const saved = await fetchJsonWithAuthRetry('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    state.status = saved;
    if (statusVisualWord() === 'RUNNING') {
      await fetchJsonWithAuthRetry('/api/bot/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    await persistSetupProgress('setup_step_2_complete', true);
    applyLocalSetupStep('setup_step_2_complete', true);
    showSettingsFeedback('✓ Settings saved', 'success');
    updateSaveButtonLabel('✓ Saved!');
    showToast('✓ Settings saved', 'success');
    applyStatusPayload(saved);
    state.activeSetupStepKey = 'setup_step_3_complete';
    renderGettingStartedGuide();
    window.setTimeout(() => updateSaveButtonLabel('Save Settings'), 1700);
  } catch (error) {
    showSettingsFeedback('✗ Failed to save — try again', 'error');
    updateSaveButtonLabel('✗ Failed');
    showToast(error?.message || '✗ Failed to save — try again', 'error', 3200);
    window.setTimeout(() => updateSaveButtonLabel('Save Settings'), 1800);
  } finally {
    setButtonLoading(button, false);
    setControlsDisabledState();
  }
}

function applyPerformancePeriodTabs() {
  document.querySelectorAll('#ai-trader-performance-tabs .ai-trader-pill--tab').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const active = String(node.dataset.performancePeriod || '') === state.selectedPerformancePeriod;
    node.classList.toggle('is-active', active);
    node.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function renderPerformance() {
  const perf = state.performance || {};
  const period = state.selectedPerformancePeriod;
  const periodData = perf?.periods?.[period] || {
    totalPnl: 0,
    tradeCount: 0,
    winRate: 0,
    bestTrade: null,
    worstTrade: null,
    avgHoldMinutes: 0
  };
  const pnlNode = byId('ai-trader-metric-pnl');
  const tradesNode = byId('ai-trader-metric-trades');
  const winNode = byId('ai-trader-metric-win-rate');
  const bestNode = byId('ai-trader-metric-best');
  const worstNode = byId('ai-trader-metric-worst');
  const holdNode = byId('ai-trader-metric-hold-time');
  const chart = byId('ai-trader-performance-chart');
  if (pnlNode) {
    pnlNode.textContent = formatSignedUsd(periodData.totalPnl);
    pnlNode.classList.toggle('is-positive', toNum(periodData.totalPnl, 0) > 0);
    pnlNode.classList.toggle('is-negative', toNum(periodData.totalPnl, 0) < 0);
    pnlNode.classList.toggle('is-neutral', toNum(periodData.totalPnl, 0) === 0);
  }
  if (tradesNode) {
    tradesNode.textContent = String(toNum(periodData.tradeCount, 0));
  }
  if (winNode) {
    winNode.textContent = formatPct(periodData.winRate, 1);
  }
  if (bestNode) {
    bestNode.textContent = periodData.bestTrade
      ? `${periodData.bestTrade.ticker} ${formatSignedUsd(periodData.bestTrade.pnlUsd)}`
      : 'None';
  }
  if (worstNode) {
    worstNode.textContent = periodData.worstTrade
      ? `${periodData.worstTrade.ticker} ${formatSignedUsd(periodData.worstTrade.pnlUsd)}`
      : 'None';
  }
  if (holdNode) {
    const minutes = Math.max(0, Math.round(toNum(periodData.avgHoldMinutes, 0)));
    holdNode.textContent = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  if (!chart) {
    return;
  }
  const bars = Array.isArray(perf.chart) ? perf.chart : [];
  if (!bars.length) {
    chart.innerHTML = `
      <span class="ai-trader-chart-label">Daily P&amp;L</span>
      <div class="ai-trader-chart-bars">
        <span class="ai-trader-chart-empty">📉 <em>No trades yet — chart will appear as the bot trades.</em></span>
      </div>
    `;
    return;
  }
  const maxAbs = Math.max(1, ...bars.map((row) => Math.abs(toNum(row.pnl, 0))));
  chart.innerHTML = `
    <span class="ai-trader-chart-label">Daily P&amp;L</span>
    <div class="ai-trader-chart-bars">
      ${bars.map((row) => {
        const pnl = toNum(row.pnl, 0);
        const height = clamp((Math.abs(pnl) / maxAbs) * 100, 8, 100);
        const cls = pnl >= 0 ? 'is-positive' : 'is-negative';
        return `
          <span class="ai-trader-chart-col">
            <span class="ai-trader-chart-bar ${cls}" style="height:${height}%"></span>
            <span class="ai-trader-chart-day">${escapeHtml(String(row.day || '').slice(5))}</span>
          </span>
        `;
      }).join('')}
    </div>
  `;
}

function resolveActiveSetupStep() {
  if (SETUP_STEP_ORDER.includes(state.activeSetupStepKey)) {
    return state.activeSetupStepKey;
  }
  return state.setup.currentStepKey || SETUP_STEP_ORDER[0];
}

function renderStep1AuthState() {
  const actionWrap = byId('ai-trader-step-1-auth-actions');
  const success = byId('ai-trader-step-1-complete');
  if (!(actionWrap && success)) {
    return;
  }
  const signedIn = !state.authRequired;
  actionWrap.classList.toggle('hidden', signedIn);
  success.classList.toggle('hidden', !signedIn);
}

function renderGettingStartedGuide() {
  const card = byId('ai-trader-getting-started');
  const badge = byId('ai-trader-setup-complete-badge');
  const showLink = byId('ai-trader-show-setup-link');
  if (!card) {
    return;
  }
  const allComplete = Boolean(state.setup.completed);
  const shouldShow = !allComplete || state.forceShowSetupGuide;
  card.hidden = !shouldShow;
  if (badge) {
    badge.classList.toggle('hidden', !allComplete);
  }
  if (showLink) {
    showLink.classList.toggle('hidden', shouldShow || !allComplete);
  }
  if (!shouldShow) {
    return;
  }
  renderStep1AuthState();
  const activeStepKey = resolveActiveSetupStep();
  document.querySelectorAll('#ai-trader-getting-started .ai-trader-tracker-step').forEach((node, index) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const key = String(node.dataset.stepKey || '').trim();
    const completed = Boolean(state.setup.steps[key]);
    const isCurrent = key === activeStepKey;
    const isFuture = !completed && !isCurrent;
    node.classList.toggle('is-complete', completed);
    node.classList.toggle('is-current', isCurrent);
    node.classList.toggle('is-future', isFuture);
    node.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    const dot = node.querySelector('.ai-trader-tracker-dot');
    if (dot) {
      dot.textContent = completed ? '✓' : String(index + 1);
    }
  });
  document.querySelectorAll('#ai-trader-getting-started .ai-trader-setup-panel').forEach((panel) => {
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    const key = String(panel.dataset.stepKey || '').trim();
    const isActive = key === activeStepKey;
    panel.hidden = !isActive;
    panel.classList.toggle('is-active', isActive);
    panel.classList.toggle('is-complete', Boolean(state.setup.steps[key]));
  });
}

function applyStatusPayload(payload) {
  state.status = payload;
  state.authRequired = false;
  state.localMarket = payload?.marketStatus || payload?.market || computeLocalMarketStatus();
  state.scanIntervalSeconds = Math.max(5, toNum(payload?.stats?.nextScanInSeconds, 300));
  if (statusVisualWord() === 'RUNNING') {
    state.nextScanSeconds = Math.max(1, state.scanIntervalSeconds);
  } else {
    state.nextScanSeconds = null;
  }
  syncSetupStateFromStatus();
  applyTopStatus();
  setControlsDisabledState();
  renderStatsBar();
  applySettingsFromStatus();
  renderGettingStartedGuide();
}

function applyLoadingAuthState() {
  const list = byId('ai-trader-activity-list');
  const grid = byId('ai-trader-positions-grid');
  const scanner = byId('ai-trader-signal-list');
  const chart = byId('ai-trader-performance-chart');
  const markup = `
    <article class="ai-trader-empty-state ai-trader-empty-state--center">
      <h4>Sign in required</h4>
      <p>Log in to use the AI Trader control center.</p>
      <a class="btn-secondary open-link" href="/ai-trade-access.html?mode=login&next=%2Fdashboard">Sign In</a>
    </article>
  `;
  [list, grid, scanner, chart].forEach((node) => {
    if (node) {
      node.innerHTML = markup;
    }
  });
}

async function pollStatus() {
  try {
    const payload = await fetchJsonWithAuthRetry('/api/bot/status', { method: 'GET' });
    applyStatusPayload(payload);
    registerConnectionSuccess();
  } catch (error) {
    if (error?.status === 401) {
      state.authRequired = true;
      applyLoadingAuthState();
      return;
    }
    registerConnectionFailure();
  }
}

async function pollPositions() {
  try {
    const payload = await fetchJsonWithAuthRetry('/api/bot/positions', { method: 'GET' });
    state.positions = Array.isArray(payload?.positions) ? payload.positions : [];
    renderPositions();
    registerConnectionSuccess();
  } catch (error) {
    if (error?.status !== 401) {
      registerConnectionFailure();
    }
  }
}

async function pollActivity() {
  try {
    const payload = await fetchJsonWithAuthRetry('/api/bot/activity', { method: 'GET' });
    state.activity = Array.isArray(payload?.activity) ? payload.activity : [];
    renderActivityFeed();
    registerConnectionSuccess();
  } catch (error) {
    if (error?.status !== 401) {
      registerConnectionFailure();
    }
  }
}

async function pollScanner() {
  try {
    const payload = await fetchJsonWithAuthRetry('/api/bot/scanner', { method: 'GET' });
    state.scanner = {
      isScanning: Boolean(payload?.isScanning),
      rows: Array.isArray(payload?.rows) ? payload.rows : []
    };
    renderScanner();
    registerConnectionSuccess();
  } catch (error) {
    if (error?.status !== 401) {
      registerConnectionFailure();
    }
  }
}

async function pollPerformance() {
  try {
    const payload = await fetchJsonWithAuthRetry('/api/bot/performance', { method: 'GET' });
    state.performance = payload || null;
    renderPerformance();
    registerConnectionSuccess();
  } catch (error) {
    if (error?.status !== 401) {
      registerConnectionFailure();
    }
  }
}

async function closePosition(positionId) {
  await fetchJsonWithAuthRetry(`/api/market/auto-trader/positions/${encodeURIComponent(positionId)}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
}

function showStopInlineConfirm(show) {
  const row = byId('ai-trader-stop-inline-confirm');
  if (!row) {
    return;
  }
  row.classList.toggle('hidden', !show);
}

async function startBotFlow() {
  const startBtn = byId('ai-trader-start-btn');
  if (!(startBtn instanceof HTMLButtonElement)) {
    return;
  }
  setButtonLoading(startBtn, true);
  startBtn.disabled = true;
  try {
    let status = state.status;
    if (!status) {
      status = await fetchJsonWithAuthRetry('/api/bot/status', { method: 'GET' });
      applyStatusPayload(status);
    }
    const brokerConnected = isBrokerConnectedFromStatus(status);
    const settingsSaved = Boolean(state.setup.steps.setup_step_2_complete);
    if (!brokerConnected) {
      showToast('Connect a broker first.', 'error');
      state.forceShowSetupGuide = true;
      state.activeSetupStepKey = 'setup_step_4_complete';
      renderGettingStartedGuide();
      scrollToSection('ai-trader-getting-started');
      return;
    }
    if (!Boolean(status?.configured) || !settingsSaved) {
      showToast('Save your bot settings first.', 'error');
      state.forceShowSetupGuide = true;
      state.activeSetupStepKey = 'setup_step_2_complete';
      renderGettingStartedGuide();
      scrollToSection('ai-trader-settings-panel');
      return;
    }
    const started = await fetchJsonWithAuthRetry('/api/bot/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    applyStatusPayload(started);
    await persistSetupProgress('setup_step_5_complete', true);
    applyLocalSetupStep('setup_step_5_complete', true);
    state.forceShowSetupGuide = false;
    showToast('Bot started successfully.', 'success');
    showStopInlineConfirm(false);
    await Promise.all([pollActivity(), pollPositions(), pollScanner(), pollPerformance()]);
  } catch (error) {
    showToast(error?.message || 'Could not start bot.', 'error', 3400);
  } finally {
    setButtonLoading(startBtn, false);
    setControlsDisabledState();
  }
}

async function pauseBotFlow() {
  const pauseBtn = byId('ai-trader-pause-btn');
  if (!(pauseBtn instanceof HTMLButtonElement)) {
    return;
  }
  setButtonLoading(pauseBtn, true);
  pauseBtn.disabled = true;
  try {
    const payload = await fetchJsonWithAuthRetry('/api/bot/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    applyStatusPayload(payload);
    showToast('Bot paused.', 'success');
  } catch (error) {
    showToast(error?.message || 'Could not pause bot.', 'error');
  } finally {
    setButtonLoading(pauseBtn, false);
    setControlsDisabledState();
  }
}

async function stopBotFlow() {
  const stopConfirmBtn = byId('ai-trader-stop-confirm-btn');
  if (!(stopConfirmBtn instanceof HTMLButtonElement)) {
    return;
  }
  setButtonLoading(stopConfirmBtn, true);
  stopConfirmBtn.disabled = true;
  try {
    const payload = await fetchJsonWithAuthRetry('/api/bot/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    applyStatusPayload(payload);
    showToast('Bot stopped.', 'success');
    showStopInlineConfirm(false);
  } catch (error) {
    showToast(error?.message || 'Could not stop bot.', 'error');
  } finally {
    setButtonLoading(stopConfirmBtn, false);
    stopConfirmBtn.disabled = false;
    setControlsDisabledState();
  }
}

function scoreFailureGuidance(message, broker) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('invalid') || lower.includes('unauthorized') || lower.includes('access token')) {
    return `The ${BROKER_CONFIG[broker]?.label || 'broker'} credentials look invalid. Re-generate your keys and paste the newest values.`;
  }
  if (lower.includes('account') && lower.includes('not found')) {
    return 'The account could not be found. Confirm the account ID and that it matches your selected broker.';
  }
  if (lower.includes('permission')) {
    return 'Your key does not have enough permissions. Enable trading + account access in broker API settings.';
  }
  return String(message || 'Connection test failed. Double check keys and broker mode, then try again.');
}

function normalizeBrokerChoice(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (value === 'interactive-brokers') {
    return 'ibkr';
  }
  if (value === 'tradier') {
    return 'tradier';
  }
  return 'alpaca';
}

function checklistLabelForKey(checkKey, broker) {
  const brokerLabel = BROKER_CONFIG[broker]?.label || 'broker';
  const key = String(checkKey || '').trim().toLowerCase();
  if (key === 'connecting') {
    return `Connecting to ${brokerLabel}...`;
  }
  if (key === 'validating') {
    return 'Validating API keys...';
  }
  if (key === 'account') {
    return 'Reading account details...';
  }
  if (key === 'buyingpower') {
    return 'Checking buying power...';
  }
  if (key === 'permissions') {
    return 'Verifying trade permissions...';
  }
  if (key === 'marketdata') {
    return 'Checking market data access...';
  }
  return 'Running connection check...';
}

function brokerPayloadFromForm() {
  const apiInput = byId('ai-trader-broker-api-key');
  const secretInput = byId('ai-trader-broker-secret-key');
  const accountInput = byId('ai-trader-broker-account-id');
  const broker = state.selectedBroker;
  const payload = {
    broker,
    trading_mode: state.selectedBrokerMode,
    api_key: apiInput instanceof HTMLInputElement ? apiInput.value.trim() : '',
    api_secret: secretInput instanceof HTMLInputElement ? secretInput.value.trim() : '',
    account_id: accountInput instanceof HTMLInputElement ? accountInput.value.trim() : ''
  };
  if (broker === 'alpaca') {
    if (!payload.api_key || !payload.api_secret) {
      throw new Error('Enter both API key and secret key for Alpaca.');
    }
  }
  if (broker === 'tradier') {
    if (!payload.api_key || !payload.account_id) {
      throw new Error('Enter both Tradier access token and account ID.');
    }
  }
  if (broker === 'ibkr' && !payload.account_id) {
    throw new Error('Enter your IBKR account ID before testing.');
  }
  return payload;
}

function renderBrokerChecklist(checks = [], withDelay = false) {
  const list = byId('ai-trader-broker-test-checklist');
  if (!list) {
    return Promise.resolve();
  }
  list.innerHTML = '';
  const run = async () => {
    for (let i = 0; i < checks.length; i += 1) {
      const check = checks[i];
      const lineLabel = checklistLabelForKey(check?.key, state.selectedBroker);
      const detailText = String(check?.detail || check?.message || '').trim();
      const row = document.createElement('li');
      row.className = 'ai-trader-broker-check-item';
      row.textContent = `⏳ ${lineLabel}`;
      list.appendChild(row);
      if (withDelay) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => window.setTimeout(resolve, 220));
      }
      row.classList.add(Boolean(check.ok) ? 'is-success' : 'is-failed');
      row.textContent = `${check.ok ? '✅' : '❌'} ${lineLabel}${detailText ? ` — ${detailText}` : ''}`;
    }
  };
  return run();
}

function setBrokerSuccessCardVisible(visible, accountInfo = null) {
  const success = byId('ai-trader-broker-success-card');
  if (!success) {
    return;
  }
  success.classList.toggle('hidden', !visible);
  if (!visible) {
    return;
  }
  const accountNode = byId('ai-trader-broker-success-account');
  const buyingNode = byId('ai-trader-broker-success-buying-power');
  const modeNode = byId('ai-trader-broker-success-mode');
  if (accountNode) {
    accountNode.textContent = String(accountInfo?.account_masked || accountInfo?.accountMasked || 'XXXX----');
  }
  if (buyingNode) {
    buyingNode.textContent = formatUsd(accountInfo?.buying_power || accountInfo?.buyingPower || 0);
  }
  if (modeNode) {
    modeNode.textContent = state.selectedBrokerMode === 'live' ? 'Live Trading' : 'Paper Trading';
  }
}

function setBrokerErrorCard(message = '') {
  const errorCard = byId('ai-trader-broker-error-card');
  const errorText = byId('ai-trader-broker-error-text');
  if (!(errorCard && errorText)) {
    return;
  }
  if (!message) {
    errorCard.classList.add('hidden');
    errorText.textContent = '';
    return;
  }
  errorCard.classList.remove('hidden');
  errorText.textContent = message;
}

async function testBrokerConnection(payload) {
  return fetchWithFallback('/api/broker/test-connection', '/api/broker/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function saveBrokerConnection(payload) {
  return fetchWithFallback('/api/broker/save-keys', '/api/broker/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function runBrokerTestFlow() {
  const testBtn = byId('ai-trader-broker-test-btn');
  if (!(testBtn instanceof HTMLButtonElement)) {
    return;
  }
  setButtonLoading(testBtn, true);
  testBtn.disabled = true;
  setBrokerErrorCard('');
  setBrokerSuccessCardVisible(false);
  try {
    const payload = brokerPayloadFromForm();
    const response = await testBrokerConnection(payload);
    const checks = Array.isArray(response?.checks) ? response.checks : [];
    await renderBrokerChecklist(checks, true);
    if (!response?.success && !response?.bridgeReady) {
      const failedCheck = checks.find((check) => !check?.ok);
      const failedLabel = checklistLabelForKey(failedCheck?.key, payload.broker);
      const failedDetail = String(failedCheck?.detail || failedCheck?.message || response?.message || 'Connection test failed.').trim();
      const guidance = `${failedLabel} failed. ${scoreFailureGuidance(failedDetail, payload.broker)}`;
      setBrokerErrorCard(guidance);
      state.brokerTest = {
        passed: false,
        payload: null,
        checks,
        accountInfo: null
      };
      showToast(guidance, 'error', 3600);
      return;
    }
    state.brokerTest = {
      passed: true,
      payload,
      checks,
      accountInfo: response?.account_info || null
    };
    setBrokerSuccessCardVisible(true, response?.account_info || {});
    showToast('Broker connection test passed.', 'success');
  } catch (error) {
    const guidance = scoreFailureGuidance(error?.message || 'Connection test failed.', state.selectedBroker);
    setBrokerErrorCard(guidance);
    showToast(guidance, 'error', 3600);
    state.brokerTest = {
      passed: false,
      payload: null,
      checks: [],
      accountInfo: null
    };
  } finally {
    setButtonLoading(testBtn, false);
    testBtn.disabled = false;
  }
}

async function saveBrokerAndContinueFlow() {
  if (!state.brokerTest.passed || !state.brokerTest.payload) {
    showToast('Run a successful connection test first.', 'error');
    return;
  }
  const button = byId('ai-trader-broker-save-continue-btn');
  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
  }
  try {
    await saveBrokerConnection(state.brokerTest.payload);
    await persistSetupProgress('setup_step_4_complete', true);
    applyLocalSetupStep('setup_step_4_complete', true);
    state.activeSetupStepKey = 'setup_step_5_complete';
    state.forceShowSetupGuide = true;
    showToast('Broker saved. Continue to start the bot.', 'success');
    await Promise.all([pollStatus(), pollPositions(), pollScanner()]);
    renderGettingStartedGuide();
  } catch (error) {
    showToast(error?.message || 'Could not save broker connection.', 'error');
  } finally {
    if (button instanceof HTMLButtonElement) {
      button.disabled = false;
    }
  }
}

function applyBrokerFormState() {
  const broker = state.selectedBroker;
  const config = BROKER_CONFIG[broker] || BROKER_CONFIG.alpaca;
  const apiLabel = byId('ai-trader-broker-api-key-label');
  const apiInput = byId('ai-trader-broker-api-key');
  const apiHelper = byId('ai-trader-broker-api-helper');
  const apiLink = byId('ai-trader-broker-api-link');
  const secretWrap = byId('ai-trader-broker-secret-wrap');
  const secretLabel = byId('ai-trader-broker-secret-label');
  const secretHelper = byId('ai-trader-broker-secret-helper');
  const accountWrap = byId('ai-trader-broker-account-wrap');
  const accountLabel = byId('ai-trader-broker-account-label');
  const accountInput = byId('ai-trader-broker-account-id');
  if (apiLabel) {
    apiLabel.textContent = config.apiLabel;
  }
  if (apiInput instanceof HTMLInputElement) {
    apiInput.placeholder = config.apiPlaceholder;
  }
  if (apiHelper) {
    apiHelper.textContent = config.apiHelper;
  }
  if (apiLink instanceof HTMLAnchorElement) {
    apiLink.href = config.apiLink;
    apiLink.textContent = config.apiLinkLabel;
  }
  if (secretWrap) {
    secretWrap.classList.toggle('hidden', !config.needsSecret);
  }
  if (secretLabel) {
    secretLabel.textContent = config.secretLabel;
  }
  if (secretHelper) {
    secretHelper.textContent = config.secretHelper;
  }
  if (accountWrap) {
    accountWrap.classList.toggle('hidden', !config.needsAccountId);
  }
  if (accountLabel) {
    accountLabel.textContent = config.accountLabel || 'Account ID';
  }
  if (accountInput instanceof HTMLInputElement) {
    accountInput.placeholder = config.accountPlaceholder || 'Paste your account ID';
  }
  document.querySelectorAll('#ai-trader-step4-broker-pills .ai-trader-broker-pill').forEach((pill) => {
    if (!(pill instanceof HTMLButtonElement)) {
      return;
    }
    const active = String(pill.dataset.brokerChoice || '') === broker;
    pill.classList.toggle('is-active', active);
    pill.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function applyBrokerModeState() {
  const paperBtn = byId('ai-trader-broker-mode-paper');
  const liveBtn = byId('ai-trader-broker-mode-live');
  const warning = byId('ai-trader-broker-live-warning');
  const paperActive = state.selectedBrokerMode === 'paper';
  if (paperBtn instanceof HTMLButtonElement) {
    paperBtn.classList.toggle('is-active', paperActive);
  }
  if (liveBtn instanceof HTMLButtonElement) {
    liveBtn.classList.toggle('is-active', !paperActive);
  }
  if (warning) {
    warning.classList.toggle('hidden', paperActive);
  }
}

async function trackStepThreeClick() {
  await persistSetupProgress('setup_step_3_complete', true);
  applyLocalSetupStep('setup_step_3_complete', true);
  if (state.activeSetupStepKey === 'setup_step_3_complete') {
    state.activeSetupStepKey = 'setup_step_4_complete';
  }
  renderGettingStartedGuide();
}

function scrollToSection(sectionId) {
  const node = byId(sectionId);
  node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindControlsDropdown() {
  const toggleBtn = byId('ai-trader-controls-toggle');
  const closeBtn = byId('ai-trader-controls-close');
  const dropdown = byId('ai-trader-controls-dropdown');
  const controlLink = byId('ai-trader-quick-control-link');
  const settingsLink = byId('ai-trader-quick-settings-link');
  const brokerLink = byId('ai-trader-quick-broker-link');
  const performanceLink = byId('ai-trader-quick-performance-link');
  if (toggleBtn instanceof HTMLButtonElement) {
    toggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleControlsDropdown();
    });
  }
  if (closeBtn instanceof HTMLButtonElement) {
    closeBtn.addEventListener('click', () => closeControlsDropdown());
  }
  if (controlLink instanceof HTMLButtonElement) {
    controlLink.addEventListener('click', () => {
      closeControlsDropdown();
      scrollToSection('ai-trader-control-title');
    });
  }
  if (settingsLink instanceof HTMLButtonElement) {
    settingsLink.addEventListener('click', () => {
      closeControlsDropdown();
      scrollToSection('ai-trader-settings-panel');
    });
  }
  if (brokerLink instanceof HTMLButtonElement) {
    brokerLink.addEventListener('click', () => {
      closeControlsDropdown();
      state.forceShowSetupGuide = true;
      state.activeSetupStepKey = 'setup_step_4_complete';
      renderGettingStartedGuide();
      scrollToSection('ai-trader-getting-started');
    });
  }
  if (performanceLink instanceof HTMLButtonElement) {
    performanceLink.addEventListener('click', () => {
      closeControlsDropdown();
      scrollToSection('ai-trader-performance-title');
    });
  }
  document.addEventListener('click', (event) => {
    if (!state.controlsDropdownOpen) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if ((dropdown instanceof HTMLElement && dropdown.contains(target))
      || (toggleBtn instanceof HTMLElement && toggleBtn.contains(target))) {
      return;
    }
    closeControlsDropdown();
  });
}

function bindSettingsInteractions() {
  const riskWrap = byId('ai-trader-risk-level-cards');
  const universeWrap = byId('ai-trader-setting-universe');
  const stopLoss = byId('ai-trader-setting-stop-loss');
  const takeProfit = byId('ai-trader-setting-take-profit');
  const maxPosition = byId('ai-trader-setting-max-position-size');
  const maxMinus = byId('ai-trader-setting-max-open-minus');
  const maxPlus = byId('ai-trader-setting-max-open-plus');
  const maxOpen = byId('ai-trader-setting-max-open-value');
  if (riskWrap) {
    riskWrap.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const card = target.closest('.ai-trader-risk-card');
      if (!(card instanceof HTMLButtonElement)) {
        return;
      }
      const level = String(card.dataset.riskLevel || '').trim().toLowerCase();
      if (!(level === 'conservative' || level === 'moderate' || level === 'aggressive')) {
        return;
      }
      state.selectedRiskLevel = level;
      renderRiskLevelSelection();
    });
  }
  if (universeWrap) {
    universeWrap.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const pill = target.closest('.ai-trader-pill');
      if (!(pill instanceof HTMLButtonElement)) {
        return;
      }
      const universe = String(pill.dataset.universe || '').trim().toLowerCase();
      if (!universe) {
        return;
      }
      state.selectedUniverse = universe;
      renderUniverseSelection();
    });
  }
  if (stopLoss instanceof HTMLInputElement) {
    stopLoss.addEventListener('input', updateStopLossText);
  }
  if (takeProfit instanceof HTMLInputElement) {
    takeProfit.addEventListener('input', updateTakeProfitText);
  }
  if (maxPosition instanceof HTMLInputElement) {
    maxPosition.addEventListener('input', updatePositionSizeText);
  }
  if (maxMinus instanceof HTMLButtonElement && maxOpen) {
    maxMinus.addEventListener('click', () => {
      const next = Math.max(1, toNum(maxOpen.textContent, 4) - 1);
      maxOpen.textContent = String(next);
    });
  }
  if (maxPlus instanceof HTMLButtonElement && maxOpen) {
    maxPlus.addEventListener('click', () => {
      const next = Math.min(12, toNum(maxOpen.textContent, 4) + 1);
      maxOpen.textContent = String(next);
    });
  }
}

function bindSetupGuideInteractions() {
  const tracker = byId('ai-trader-getting-started-steps');
  const showGuideLink = byId('ai-trader-show-setup-link');
  const stepSettingsBtn = byId('ai-trader-step-settings-btn');
  const stepBrokerNextBtn = byId('ai-trader-step-broker-next-btn');
  const stepStartBtn = byId('ai-trader-step-start-btn');
  const testBtn = byId('ai-trader-broker-test-btn');
  const saveContinueBtn = byId('ai-trader-broker-save-continue-btn');
  const retryBtn = byId('ai-trader-broker-try-again-btn');
  const secretToggle = byId('ai-trader-broker-secret-toggle');
  if (tracker) {
    tracker.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const stepBtn = target.closest('.ai-trader-tracker-step');
      if (!(stepBtn instanceof HTMLButtonElement)) {
        return;
      }
      const key = String(stepBtn.dataset.stepKey || '').trim();
      if (!SETUP_STEP_ORDER.includes(key)) {
        return;
      }
      const completed = Boolean(state.setup.steps[key]);
      if (completed || key === state.setup.currentStepKey) {
        state.forceShowSetupGuide = true;
        state.activeSetupStepKey = key;
        renderGettingStartedGuide();
      }
    });
  }
  if (showGuideLink instanceof HTMLAnchorElement) {
    showGuideLink.addEventListener('click', (event) => {
      event.preventDefault();
      state.forceShowSetupGuide = true;
      state.activeSetupStepKey = state.setup.currentStepKey;
      renderGettingStartedGuide();
      scrollToSection('ai-trader-getting-started');
    });
  }
  if (stepSettingsBtn instanceof HTMLButtonElement) {
    stepSettingsBtn.addEventListener('click', () => {
      scrollToSection('ai-trader-settings-panel');
    });
  }
  if (stepBrokerNextBtn instanceof HTMLButtonElement) {
    stepBrokerNextBtn.addEventListener('click', () => {
      trackStepThreeClick().catch(() => {});
      state.activeSetupStepKey = 'setup_step_4_complete';
      renderGettingStartedGuide();
      scrollToSection('ai-trader-getting-started');
    });
  }
  if (stepStartBtn instanceof HTMLButtonElement) {
    stepStartBtn.addEventListener('click', () => {
      scrollToSection('ai-trader-control-title');
      startBotFlow().catch(() => {});
    });
  }
  document.querySelectorAll('.ai-trader-broker-choice-link').forEach((link) => {
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }
    link.addEventListener('click', () => {
      trackStepThreeClick().catch(() => {});
    });
  });
  const brokerPills = byId('ai-trader-step4-broker-pills');
  if (brokerPills) {
    brokerPills.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const pill = target.closest('.ai-trader-broker-pill');
      if (!(pill instanceof HTMLButtonElement)) {
        return;
      }
      state.selectedBroker = normalizeBrokerChoice(pill.dataset.brokerChoice || 'alpaca');
      state.brokerTest = { passed: false, payload: null, checks: [], accountInfo: null };
      setBrokerSuccessCardVisible(false);
      setBrokerErrorCard('');
      applyBrokerFormState();
    });
  }
  const modePaper = byId('ai-trader-broker-mode-paper');
  const modeLive = byId('ai-trader-broker-mode-live');
  if (modePaper instanceof HTMLButtonElement) {
    modePaper.addEventListener('click', () => {
      state.selectedBrokerMode = 'paper';
      applyBrokerModeState();
    });
  }
  if (modeLive instanceof HTMLButtonElement) {
    modeLive.addEventListener('click', () => {
      state.selectedBrokerMode = 'live';
      applyBrokerModeState();
    });
  }
  if (testBtn instanceof HTMLButtonElement) {
    testBtn.addEventListener('click', () => {
      runBrokerTestFlow().catch(() => {});
    });
  }
  if (saveContinueBtn instanceof HTMLButtonElement) {
    saveContinueBtn.addEventListener('click', () => {
      saveBrokerAndContinueFlow().catch(() => {});
    });
  }
  if (retryBtn instanceof HTMLButtonElement) {
    retryBtn.addEventListener('click', () => {
      setBrokerErrorCard('');
      runBrokerTestFlow().catch(() => {});
    });
  }
  if (secretToggle instanceof HTMLButtonElement) {
    secretToggle.addEventListener('click', () => {
      const secretInput = byId('ai-trader-broker-secret-key');
      if (!(secretInput instanceof HTMLInputElement)) {
        return;
      }
      const nextType = secretInput.type === 'password' ? 'text' : 'password';
      secretInput.type = nextType;
      const shown = nextType === 'text';
      secretToggle.textContent = shown ? 'Hide' : 'Show';
      secretToggle.setAttribute('aria-pressed', shown ? 'true' : 'false');
    });
  }
  applyBrokerFormState();
  applyBrokerModeState();
}

function bindControls() {
  const startBtn = byId('ai-trader-start-btn');
  const pauseBtn = byId('ai-trader-pause-btn');
  const stopBtn = byId('ai-trader-stop-btn');
  const stopConfirmBtn = byId('ai-trader-stop-confirm-btn');
  const stopCancelBtn = byId('ai-trader-stop-cancel-btn');
  const settingsBtn = byId('ai-trader-save-settings-btn');
  const tabs = byId('ai-trader-performance-tabs');
  const positionsGrid = byId('ai-trader-positions-grid');
  if (startBtn instanceof HTMLButtonElement) {
    startBtn.addEventListener('click', () => {
      closeControlsDropdown();
      startBotFlow().catch(() => {});
    });
  }
  if (pauseBtn instanceof HTMLButtonElement) {
    pauseBtn.addEventListener('click', () => {
      closeControlsDropdown();
      pauseBotFlow().catch(() => {});
    });
  }
  if (stopBtn instanceof HTMLButtonElement) {
    stopBtn.addEventListener('click', () => {
      closeControlsDropdown();
      showStopInlineConfirm(true);
    });
  }
  if (stopConfirmBtn instanceof HTMLButtonElement) {
    stopConfirmBtn.addEventListener('click', () => {
      stopBotFlow().catch(() => {});
    });
  }
  if (stopCancelBtn instanceof HTMLButtonElement) {
    stopCancelBtn.addEventListener('click', () => {
      showStopInlineConfirm(false);
    });
  }
  if (settingsBtn instanceof HTMLButtonElement) {
    settingsBtn.addEventListener('click', () => {
      saveSettingsFlow().catch(() => {});
    });
  }
  if (tabs) {
    tabs.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest('.ai-trader-pill--tab');
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const period = String(button.dataset.performancePeriod || '').trim();
      if (!period) {
        return;
      }
      state.selectedPerformancePeriod = period;
      applyPerformancePeriodTabs();
      renderPerformance();
    });
  }
  if (positionsGrid) {
    positionsGrid.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const closeBtn = target.closest('.ai-trader-close-position-btn');
      if (!(closeBtn instanceof HTMLButtonElement)) {
        return;
      }
      const positionId = String(closeBtn.dataset.closePositionId || '').trim();
      if (!positionId) {
        return;
      }
      try {
        closeBtn.disabled = true;
        await closePosition(positionId);
        showToast('Position closed.', 'success');
        await Promise.all([pollStatus(), pollPositions(), pollActivity(), pollPerformance()]);
      } catch (error) {
        showToast(error?.message || 'Could not close position.', 'error');
      } finally {
        closeBtn.disabled = false;
      }
    });
  }
}

function bindNavShortcut() {
  const navLink = byId('ai-trader-nav-link');
  if (!(navLink instanceof HTMLAnchorElement)) {
    return;
  }
  navLink.addEventListener('click', (event) => {
    event.preventDefault();
    const hub = byId('ai-trader-hub');
    hub?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function oneSecondTick() {
  state.localMarket = computeLocalMarketStatus();
  if (statusVisualWord() === 'RUNNING') {
    if (state.nextScanSeconds === null) {
      state.nextScanSeconds = Math.max(1, state.scanIntervalSeconds);
    } else {
      state.nextScanSeconds -= 1;
      if (state.nextScanSeconds <= 0) {
        state.nextScanSeconds = Math.max(1, state.scanIntervalSeconds);
      }
    }
  } else {
    state.nextScanSeconds = null;
  }
  renderStatsBar();
  updateControlsDropdownStatus();
}

async function initialLoad() {
  await Promise.all([
    pollStatus(),
    pollPositions(),
    pollActivity(),
    pollScanner(),
    pollPerformance()
  ]);
  applyPerformancePeriodTabs();
  renderPerformance();
}

function startPolling() {
  Object.values(state.timers).forEach((timerId) => {
    if (timerId) {
      window.clearInterval(timerId);
    }
  });
  state.timers.oneSecond = window.setInterval(oneSecondTick, 1000);
  state.timers.activity = window.setInterval(() => {
    pollActivity().catch(() => {});
  }, 5000);
  state.timers.status = window.setInterval(() => {
    pollStatus().catch(() => {});
  }, 10000);
  state.timers.positions = window.setInterval(() => {
    pollPositions().catch(() => {});
  }, 10000);
  state.timers.scanner = window.setInterval(() => {
    pollScanner().catch(() => {});
  }, 10000);
  state.timers.performance = window.setInterval(() => {
    pollPerformance().catch(() => {});
  }, 30000);
}

function initAiTraderHub() {
  if (state.mounted) {
    return;
  }
  const hub = byId('ai-trader-hub');
  if (!hub) {
    return;
  }
  state.mounted = true;
  bindControls();
  bindControlsDropdown();
  bindSettingsInteractions();
  bindSetupGuideInteractions();
  bindNavShortcut();
  oneSecondTick();
  initialLoad().catch(() => {
    registerConnectionFailure();
  });
  startPolling();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAiTraderHub);
} else {
  initAiTraderHub();
}
