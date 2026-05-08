const AI_TRADER_STATUS_PILL_EVENT = 'dumbdollars:bot-status-update';
const AUTH_TOKEN_STORAGE_KEY = 'dumbdollars_token';
const SETUP_COMPLETE_STORAGE_KEY = 'dumbdollars_ai_trader_setup_complete';
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
  connectionIssues: 0,
  scanIntervalSeconds: 300,
  nextScanSeconds: null,
  localMarket: null,
  seenActivityIds: new Set(),
  setupCompleteLocally: false,
  selectedBroker: 'alpaca',
  controlsDropdownOpen: false,
  timers: {
    oneSecond: null,
    marketStatus: null,
    status: null,
    positions: null,
    scanner: null,
    activity: null,
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStoredToken() {
  try {
    return String(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '').trim();
  } catch (_error) {
    return '';
  }
}

function getStoredSetupCompleted() {
  try {
    return localStorage.getItem(SETUP_COMPLETE_STORAGE_KEY) === '1';
  } catch (_error) {
    return false;
  }
}

function setStoredSetupCompleted(completed) {
  try {
    if (completed) {
      localStorage.setItem(SETUP_COMPLETE_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(SETUP_COMPLETE_STORAGE_KEY);
    }
  } catch (_error) {
    // Non-fatal.
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
      headers: { 'Content-Type': 'application/json' },
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
    const retryResponse = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...buildAuthHeaders()
      }
    });
    response = retryResponse;
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

function emitBotStatusPill(payload) {
  try {
    window.dispatchEvent(new CustomEvent(AI_TRADER_STATUS_PILL_EVENT, { detail: payload }));
  } catch (_error) {
    // Non-fatal.
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
    window.setTimeout(() => {
      toast.remove();
    }, 240);
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
    return {
      state: 'CLOSED',
      detail: 'CLOSED — Weekend',
      isOpen: false
    };
  }
  if (isHoliday) {
    return {
      state: 'CLOSED',
      detail: 'CLOSED — Holiday',
      isOpen: false
    };
  }
  if (nowValue >= openValue && nowValue < closeValue) {
    const closeIn = secondsBetweenEt(nowEt, closeEt);
    return {
      state: 'OPEN',
      detail: `Closes in ${formatHoursMinutes(closeIn)}`,
      isOpen: true
    };
  }
  if (nowValue < openValue) {
    const openIn = secondsBetweenEt(nowEt, openEt);
    return {
      state: 'CLOSED',
      detail: `Opens in ${formatHoursMinutes(openIn)}`,
      isOpen: false
    };
  }
  let offset = 1;
  while (offset <= 7) {
    const candidate = makeEtParts(nowEt, offset, 9, 30, 0);
    const candidateWeekend = candidate.weekday === 0 || candidate.weekday === 6;
    const candidateHoliday = NYSE_HOLIDAYS_2026.has(etDateStamp(candidate));
    if (!candidateWeekend && !candidateHoliday) {
      const openIn = secondsBetweenEt(nowEt, candidate);
      return {
        state: 'CLOSED',
        detail: `Opens in ${formatHoursMinutes(openIn)}`,
        isOpen: false
      };
    }
    offset += 1;
  }
  return {
    state: 'CLOSED',
    detail: 'Opens next session',
    isOpen: false
  };
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
  if (!dropdown || !(toggle instanceof HTMLButtonElement)) {
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
  const brokerConnected = isBrokerConnectedFromStatus();
  emitBotStatusPill({
    statusWord,
    stateClass: statusWord === 'RUNNING' ? 'running' : statusWord === 'PAUSED' ? 'paused' : 'off',
    isRunning: statusWord === 'RUNNING',
    brokerConnected,
    marketOpen: Boolean(market?.isOpen),
    href: '/#ai-trader-hub'
  });
  const navDot = byId('ai-trader-nav-dot');
  if (navDot) {
    navDot.classList.toggle('is-running', statusWord === 'RUNNING');
    navDot.classList.toggle('is-paused', statusWord === 'PAUSED');
  }
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
  updateControlsDropdownStatus();
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
  list.scrollTop = 0;
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
        <div class="ai-trader-empty-icon">📈</div>
        <h4>No open positions — the bot will display active trades here</h4>
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
        <div class="ai-trader-empty-icon">📡</div>
        <h4>Bot is not scanning. Press START to begin.</h4>
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
  return Math.max(100, value || deposited || 10_000);
}

function updatePositionSizeText() {
  const input = byId('ai-trader-setting-max-position-size');
  const text = byId('ai-trader-setting-position-size-text');
  if (!(input instanceof HTMLInputElement) || !text) {
    return;
  }
  const accountValue = currentAccountValue();
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
  const accountValue = currentAccountValue();
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
  }, 2000);
}

async function saveSettingsFlow() {
  const button = byId('ai-trader-save-settings-btn');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  setButtonLoading(button, true);
  button.disabled = true;
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
    showSettingsFeedback('✓ Settings saved', 'success');
    showToast('✓ Settings saved', 'success');
    applyTopStatus();
    renderStatsBar();
    renderGettingStartedGuide();
  } catch (error) {
    showSettingsFeedback('✗ Failed to save — try again', 'error');
    showToast(error?.message || '✗ Failed to save — try again', 'error', 3200);
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
  if (chart) {
    const bars = Array.isArray(perf.chart) ? perf.chart : [];
    if (!bars.length) {
      chart.innerHTML = `
        <span class="ai-trader-chart-label">Daily P&amp;L</span>
        <div class="ai-trader-chart-bars">
          <span class="ai-trader-chart-empty">No trades yet — chart will appear as the bot trades</span>
        </div>
      `;
    } else {
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
  }
}

function setupGuideCompletion() {
  const setup = state.status?.setup || {};
  const completed = Boolean(setup.completed);
  if (completed) {
    state.setupCompleteLocally = true;
    setStoredSetupCompleted(true);
  }
  return completed || state.setupCompleteLocally;
}

function renderGettingStartedGuide() {
  const card = byId('ai-trader-getting-started');
  if (!card) {
    return;
  }
  if (setupGuideCompletion()) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const setup = state.status?.setup || {};
  const steps = setup.steps || {};
  const currentStepIndex = Math.max(0, toNum(setup.currentStepIndex, 0));
  document.querySelectorAll('#ai-trader-getting-started .ai-trader-tracker-step').forEach((stepNode, index) => {
    if (!(stepNode instanceof HTMLElement)) {
      return;
    }
    const key = String(stepNode.dataset.stepKey || '').trim();
    const done = Boolean(steps[key]);
    const isCurrent = !done && index === currentStepIndex;
    stepNode.classList.toggle('is-complete', done);
    stepNode.classList.toggle('is-current', isCurrent);
    const dot = stepNode.querySelector('.ai-trader-tracker-dot');
    if (dot) {
      dot.textContent = done ? '✓' : String(index + 1);
    }
  });
  document.querySelectorAll('#ai-trader-getting-started .ai-trader-setup-panel').forEach((panelNode, index) => {
    if (!(panelNode instanceof HTMLElement)) {
      return;
    }
    const key = String(panelNode.dataset.stepKey || '').trim();
    const done = Boolean(steps[key]);
    const isCurrent = !done && index === currentStepIndex;
    panelNode.classList.toggle('is-complete', done);
    panelNode.classList.toggle('is-active', isCurrent);
    panelNode.hidden = !isCurrent;
  });
  const accountBtn = byId('ai-trader-step-account-btn');
  if (accountBtn instanceof HTMLAnchorElement) {
    if (state.authRequired) {
      accountBtn.textContent = 'Sign In';
      accountBtn.href = '/ai-trade-access.html?mode=login&next=%2F';
      accountBtn.classList.remove('is-disabled');
    } else {
      accountBtn.textContent = 'Account Ready ✓';
      accountBtn.href = '#';
      accountBtn.classList.add('is-disabled');
    }
  }
}

async function pollMarketStatus() {
  try {
    const payload = await fetchJsonWithAuthRetry('/api/market/status', { method: 'GET' });
    if (payload?.market) {
      state.localMarket = payload.market;
      renderStatsBar();
    }
    registerConnectionSuccess();
  } catch (error) {
    if (error?.status !== 401) {
      registerConnectionFailure();
    }
  }
}

function openStopModal() {
  const modal = byId('ai-trader-stop-modal');
  if (!modal) {
    return;
  }
  modal.classList.remove('hidden');
}

function closeStopModal() {
  const modal = byId('ai-trader-stop-modal');
  if (!modal) {
    return;
  }
  modal.classList.add('hidden');
}

function openBrokerModal(step = 1) {
  const modal = byId('ai-trader-broker-modal');
  if (!modal) {
    return;
  }
  modal.classList.remove('hidden');
  showBrokerModalStep(step);
}

function closeBrokerModal() {
  const modal = byId('ai-trader-broker-modal');
  if (!modal) {
    return;
  }
  modal.classList.add('hidden');
}

function bindModalDismissShortcuts() {
  const stopModal = byId('ai-trader-stop-modal');
  const brokerModal = byId('ai-trader-broker-modal');
  if (stopModal) {
    stopModal.addEventListener('click', (event) => {
      if (event.target === stopModal) {
        closeStopModal();
      }
    });
  }
  if (brokerModal) {
    brokerModal.addEventListener('click', (event) => {
      if (event.target === brokerModal) {
        closeBrokerModal();
      }
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return;
    }
    if (state.controlsDropdownOpen) {
      closeControlsDropdown();
      return;
    }
    if (stopModal && !stopModal.classList.contains('hidden')) {
      closeStopModal();
      return;
    }
    if (brokerModal && !brokerModal.classList.contains('hidden')) {
      closeBrokerModal();
    }
  });
}

function showBrokerModalStep(step) {
  const step1 = byId('ai-trader-broker-step-1');
  const step2 = byId('ai-trader-broker-step-2');
  const step3 = byId('ai-trader-broker-step-3');
  if (step1) {
    step1.classList.toggle('hidden', step !== 1);
  }
  if (step2) {
    step2.classList.toggle('hidden', step !== 2);
  }
  if (step3) {
    step3.classList.toggle('hidden', step !== 3);
  }
}

function applyBrokerChoice() {
  document.querySelectorAll('.ai-trader-broker-modal-option').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const active = String(node.dataset.brokerChoice || '') === state.selectedBroker;
    node.classList.toggle('is-active', active);
  });
}

function mapBrokerAlias(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'tradier') {
    return 'tradier';
  }
  return raw;
}

async function runBrokerTestFlow() {
  const testBtn = byId('ai-trader-broker-test-btn');
  if (!(testBtn instanceof HTMLButtonElement)) {
    return;
  }
  const keyInput = byId('ai-trader-broker-api-key');
  const secretInput = byId('ai-trader-broker-secret-key');
  const modeSelect = byId('ai-trader-broker-mode');
  const apiKey = keyInput instanceof HTMLInputElement ? keyInput.value.trim() : '';
  const secretKey = secretInput instanceof HTMLInputElement ? secretInput.value.trim() : '';
  const mode = modeSelect instanceof HTMLSelectElement ? modeSelect.value : 'paper';
  if (!apiKey || !secretKey) {
    showToast('Enter both API key and secret key first.', 'error');
    return;
  }
  setButtonLoading(testBtn, true);
  testBtn.disabled = true;
  const checklist = byId('ai-trader-broker-test-checklist');
  const resultText = byId('ai-trader-broker-test-result');
  const doneBtn = byId('ai-trader-broker-test-done');
  if (doneBtn) {
    doneBtn.classList.add('hidden');
  }
  if (resultText) {
    resultText.textContent = '';
  }
  try {
    showBrokerModalStep(3);
    await fetchJsonWithAuthRetry('/api/broker/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        broker: state.selectedBroker,
        api_key: apiKey,
        secret_key: secretKey,
        mode
      })
    });
    const tested = await fetchJsonWithAuthRetry('/api/broker/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        broker: state.selectedBroker
      })
    });
    const checks = Array.isArray(tested?.checks) ? tested.checks : [];
    if (checklist) {
      checklist.innerHTML = '';
      for (let i = 0; i < checks.length; i += 1) {
        const check = checks[i];
        const li = document.createElement('li');
        li.className = 'ai-trader-broker-check-item is-pending';
        li.textContent = `⏳ ${check.label}...`;
        checklist.appendChild(li);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => window.setTimeout(resolve, 260));
        li.classList.remove('is-pending');
        li.classList.toggle('is-success', Boolean(check.ok));
        li.classList.toggle('is-failed', !Boolean(check.ok));
        li.textContent = `${check.ok ? '✓' : '✗'} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`;
      }
    }
    if (tested?.bridgeReady) {
      if (resultText) {
        resultText.textContent = '✅ Broker connected! You are ready to trade.';
      }
      if (doneBtn) {
        doneBtn.classList.remove('hidden');
      }
      showToast('Broker connected successfully.', 'success');
      await pollStatus();
      await pollPositions();
      await pollScanner();
    } else {
      const message = tested?.failure?.explanation || 'Connection test failed. Check API keys, permissions, and account mode.';
      if (resultText) {
        resultText.textContent = `✗ ${message}`;
      }
      showToast(message, 'error', 3600);
    }
  } catch (error) {
    if (resultText) {
      resultText.textContent = `✗ ${error?.message || 'Broker test failed.'}`;
    }
    showToast(error?.message || 'Broker test failed.', 'error', 3600);
  } finally {
    setButtonLoading(testBtn, false);
    setControlsDisabledState();
  }
}

function bindGuideFaqAccordion() {
  const wrap = byId('ai-trader-setup-faq');
  if (!wrap) {
    return;
  }
  wrap.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('.ai-trader-setup-faq-trigger');
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const item = button.closest('.ai-trader-setup-faq-item');
    const answer = item?.querySelector('.ai-trader-setup-faq-answer');
    if (!answer) {
      return;
    }
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    answer.hidden = expanded;
  });
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
      <a class="btn-secondary open-link" href="/ai-trade-access.html?mode=login&next=%2F">Sign In</a>
    </article>
  `;
  [list, grid, scanner, chart].forEach((node) => {
    if (node) {
      node.innerHTML = markup;
    }
  });
}

function applyStatusPayload(payload) {
  state.status = payload;
  state.authRequired = false;
  state.scanIntervalSeconds = Math.max(5, toNum(payload?.stats?.nextScanInSeconds, 300));
  if (statusVisualWord() === 'RUNNING') {
    state.nextScanSeconds = Math.max(1, state.scanIntervalSeconds);
  } else {
    state.nextScanSeconds = null;
  }
  applyTopStatus();
  setControlsDisabledState();
  renderStatsBar();
  applySettingsFromStatus();
  renderGettingStartedGuide();
}

async function pollStatus() {
  try {
    const payload = await fetchJsonWithAuthRetry('/api/bot/status', { method: 'GET' });
    state.localMarket = payload?.marketStatus || payload?.market || computeLocalMarketStatus();
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
    const settingsSavedStep = Boolean(status?.setup?.steps?.settingsSaved);
    if (!brokerConnected) {
      openBrokerModal(1);
      showToast('Connect a broker first.', 'error');
      return;
    }
    if (!Boolean(status?.configured) || !settingsSavedStep) {
      showToast('Save your bot settings first', 'error');
      const panel = byId('ai-trader-settings-panel');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const started = await fetchJsonWithAuthRetry('/api/bot/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    applyStatusPayload(started);
    showToast('Bot started successfully.', 'success');
    await Promise.all([pollActivity(), pollPositions(), pollScanner()]);
  } catch (error) {
    if (String(error?.body?.error || '').includes('broker')) {
      openBrokerModal(1);
    }
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
  const stopBtn = byId('ai-trader-stop-confirm-btn');
  if (!(stopBtn instanceof HTMLButtonElement)) {
    return;
  }
  setButtonLoading(stopBtn, true);
  stopBtn.disabled = true;
  try {
    const payload = await fetchJsonWithAuthRetry('/api/bot/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    applyStatusPayload(payload);
    closeStopModal();
    showToast('Bot stopped.', 'success');
  } catch (error) {
    showToast(error?.message || 'Could not stop bot.', 'error');
  } finally {
    setButtonLoading(stopBtn, false);
    setControlsDisabledState();
  }
}

function scrollToSection(sectionId) {
  const node = byId(sectionId);
  node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindControlsDropdown() {
  const toggleBtn = byId('ai-trader-controls-toggle');
  const closeBtn = byId('ai-trader-controls-close');
  const dropdown = byId('ai-trader-controls-dropdown');
  const settingsLink = byId('ai-trader-quick-settings-link');
  const brokerLink = byId('ai-trader-quick-broker-link');
  const performanceLink = byId('ai-trader-quick-performance-link');
  const emailLink = byId('ai-trader-quick-email-link');

  if (toggleBtn instanceof HTMLButtonElement) {
    toggleBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleControlsDropdown();
    });
  }
  if (closeBtn instanceof HTMLButtonElement) {
    closeBtn.addEventListener('click', () => {
      closeControlsDropdown();
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
      scrollToSection('ai-trader-getting-started');
    });
  }
  if (performanceLink instanceof HTMLButtonElement) {
    performanceLink.addEventListener('click', () => {
      closeControlsDropdown();
      scrollToSection('ai-trader-performance-title');
    });
  }
  if (emailLink instanceof HTMLAnchorElement) {
    emailLink.addEventListener('click', () => {
      closeControlsDropdown();
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

function bindControls() {
  const startBtn = byId('ai-trader-start-btn');
  const pauseBtn = byId('ai-trader-pause-btn');
  const stopBtn = byId('ai-trader-stop-btn');
  const stopConfirmBtn = byId('ai-trader-stop-confirm-btn');
  const stopCancelBtn = byId('ai-trader-stop-cancel-btn');
  const settingsBtn = byId('ai-trader-save-settings-btn');
  const tabs = byId('ai-trader-performance-tabs');
  const positionsGrid = byId('ai-trader-positions-grid');
  const connectStepBtn = byId('ai-trader-step-connect-btn');
  const settingsStepBtn = byId('ai-trader-step-settings-btn');
  const startStepBtn = byId('ai-trader-step-start-btn');
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
      openStopModal();
    });
  }
  if (stopConfirmBtn instanceof HTMLButtonElement) {
    stopConfirmBtn.addEventListener('click', () => {
      stopBotFlow().catch(() => {});
    });
  }
  if (stopCancelBtn instanceof HTMLButtonElement) {
    stopCancelBtn.addEventListener('click', closeStopModal);
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
  if (connectStepBtn instanceof HTMLButtonElement) {
    connectStepBtn.addEventListener('click', () => openBrokerModal(1));
  }
  if (settingsStepBtn instanceof HTMLButtonElement) {
    settingsStepBtn.addEventListener('click', () => {
      const panel = byId('ai-trader-settings-panel');
      panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (startStepBtn instanceof HTMLButtonElement) {
    startStepBtn.addEventListener('click', () => {
      const control = byId('ai-trader-control-title');
      control?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      startBotFlow().catch(() => {});
    });
  }
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

function bindBrokerModal() {
  const closeBtn = byId('ai-trader-broker-modal-close');
  const inlineOpen = byId('ai-trader-open-key-entry');
  const testBtn = byId('ai-trader-broker-test-btn');
  const doneBtn = byId('ai-trader-broker-test-done');
  if (closeBtn instanceof HTMLButtonElement) {
    closeBtn.addEventListener('click', closeBrokerModal);
  }
  if (inlineOpen instanceof HTMLButtonElement) {
    inlineOpen.addEventListener('click', () => showBrokerModalStep(2));
  }
  if (testBtn instanceof HTMLButtonElement) {
    testBtn.addEventListener('click', () => {
      runBrokerTestFlow().catch(() => {});
    });
  }
  if (doneBtn instanceof HTMLButtonElement) {
    doneBtn.addEventListener('click', async () => {
      closeBrokerModal();
      await pollStatus();
      showToast('Broker connection saved. You can start the bot now.', 'success');
    });
  }
  document.querySelectorAll('.ai-trader-broker-modal-option').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    node.addEventListener('click', () => {
      state.selectedBroker = mapBrokerAlias(node.dataset.brokerChoice || 'alpaca');
      applyBrokerChoice();
      const openAccountUrl = String(node.dataset.brokerUrl || '').trim();
      if (openAccountUrl) {
        window.open(openAccountUrl, '_blank', 'noopener,noreferrer');
      }
      showBrokerModalStep(2);
    });
  });
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
    Promise.all([
      pollStatus(),
      pollMarketStatus()
    ]).catch(() => {});
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
  state.setupCompleteLocally = getStoredSetupCompleted();
  bindControls();
  bindControlsDropdown();
  bindSettingsInteractions();
  bindBrokerModal();
  bindModalDismissShortcuts();
  bindGuideFaqAccordion();
  bindNavShortcut();
  applyBrokerChoice();
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

