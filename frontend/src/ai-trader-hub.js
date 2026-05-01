const AI_TRADER_POLL_MS = 5000;
const AI_TRADER_STATUS_PILL_EVENT = 'dumbdollars:bot-status-update';
const AUTH_TOKEN_STORAGE_KEY = 'dumbdollars_token';
const REMEMBER_TOKEN_STORAGE_KEY = 'dumbdollars_remember_token';

const riskProfiles = Object.freeze({
  conservative: {
    riskPerTradePct: 0.8,
    maxRiskPerTradePct: 0.8,
    stopLossPct: 2.2,
    takeProfitPct: 4.4,
    maxPositions: 4,
    maxTradesPerDay: 6,
    maxDailyLossPct: 2
  },
  moderate: {
    riskPerTradePct: 1.2,
    maxRiskPerTradePct: 1.2,
    stopLossPct: 2.8,
    takeProfitPct: 6.2,
    maxPositions: 6,
    maxTradesPerDay: 8,
    maxDailyLossPct: 3
  },
  aggressive: {
    riskPerTradePct: 2,
    maxRiskPerTradePct: 2,
    stopLossPct: 3.8,
    takeProfitPct: 8.8,
    maxPositions: 8,
    maxTradesPerDay: 12,
    maxDailyLossPct: 5
  }
});

const state = {
  mounted: false,
  loading: true,
  authRequired: false,
  saveInFlight: false,
  latest: null,
  selectedPerformancePeriod: 'today',
  selectedRiskLevel: 'moderate',
  selectedUniverse: 'sp500',
  nextScanSeconds: null,
  scanIntervalMs: null,
  pollTimer: null,
  countdownTimer: null,
  saveFlashTimer: null,
  syncingForm: false,
  feedRows: [],
  signalRows: [],
  lastKnownPositionIds: new Set()
};

function promoteHubToTop() {
  const hub = byId('ai-trader-hub');
  const greeting = byId('dashboard-greeting');
  const hero = document.querySelector('.hero');
  if (!(hub instanceof HTMLElement) || !(greeting instanceof HTMLElement) || !(hero instanceof HTMLElement)) {
    return;
  }
  if (greeting.parentElement !== hero) {
    return;
  }
  if (hub.parentElement === hero && hub.nextElementSibling === greeting) {
    return;
  }
  hero.insertBefore(hub, greeting);
}

function byId(id) {
  return document.getElementById(id);
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmtUsd(value) {
  const parsed = num(value, 0);
  return `$${parsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtSignedUsd(value) {
  const parsed = num(value, 0);
  const sign = parsed > 0 ? '+' : parsed < 0 ? '-' : '';
  return `${sign}$${Math.abs(parsed).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(value, decimals = 1) {
  const parsed = num(value, 0);
  return `${parsed.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
}

function fmtSignedPct(value, decimals = 1) {
  const parsed = num(value, 0);
  const sign = parsed > 0 ? '+' : parsed < 0 ? '-' : '';
  return `${sign}${Math.abs(parsed).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
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

function getStoredRememberToken() {
  try {
    return String(localStorage.getItem(REMEMBER_TOKEN_STORAGE_KEY) || '').trim();
  } catch (_error) {
    return '';
  }
}

function buildAuthHeaders() {
  const token = getStoredToken();
  if (!token) {
    return {};
  }
  return {
    authorization: `Bearer ${token}`
  };
}

async function tryRestoreAuthSession() {
  const rememberToken = getStoredRememberToken();
  if (!rememberToken) {
    return false;
  }
  try {
    const response = await fetch('/api/auth/session/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rememberToken })
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

async function fetchJsonWithAuthRetry(url, options = {}) {
  const fetchOptions = {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...buildAuthHeaders()
    }
  };
  let response = await fetch(url, fetchOptions);
  if (response.status === 401) {
    await tryRestoreAuthSession();
    fetchOptions.headers = {
      ...(options.headers || {}),
      ...buildAuthHeaders()
    };
    response = await fetch(url, fetchOptions);
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.body = payload;
    throw error;
  }
  return payload;
}

function setTopStatusChip(statusWord, statusClass) {
  const chip = byId('ai-trader-hub-top-status');
  if (!chip) {
    return;
  }
  chip.className = `chip ai-trader-status-chip ${statusClass}`;
  chip.textContent = `BOT ${statusWord}`;
}

function setStatusOrb(statusWord, statusClass, subline) {
  const orb = byId('ai-trader-status-orb');
  const word = byId('ai-trader-status-word');
  const sub = byId('ai-trader-status-subline');
  if (orb) {
    orb.className = `ai-trader-status-orb ${statusClass}`;
  }
  if (word) {
    word.textContent = statusWord;
  }
  if (sub) {
    sub.textContent = subline;
  }
}

function inferBotVisualStatus(snapshot) {
  const bot = snapshot?.bot || snapshot?.status || snapshot || {};
  const isActive = Boolean(bot.isActive);
  const isConfigured = Boolean(bot.configured);
  const marketClosed = inferIsMarketClosed();
  const brokerConnected = Boolean(snapshot?.execution?.brokerConnection?.isConnected);
  if (!isConfigured) {
    return {
      word: 'STOPPED',
      chipClass: 'ai-trader-status-chip--stopped',
      orbClass: 'ai-trader-status-orb--stopped',
      navDotClass: 'off',
      subline: 'Save your bot settings to begin live scanning.'
    };
  }
  if (marketClosed) {
    return {
      word: 'MARKET CLOSED',
      chipClass: 'ai-trader-status-chip--closed',
      orbClass: 'ai-trader-status-orb--closed',
      navDotClass: isActive ? 'paused' : 'off',
      subline: 'Market is closed. Bot will resume scanning at open.'
    };
  }
  if (isActive && brokerConnected) {
    return {
      word: 'RUNNING',
      chipClass: 'ai-trader-status-chip--running',
      orbClass: 'ai-trader-status-orb--running',
      navDotClass: 'running',
      subline: 'Bot is active and scanning for trade opportunities.'
    };
  }
  if (isActive && !brokerConnected) {
    return {
      word: 'MARKET CLOSED',
      chipClass: 'ai-trader-status-chip--closed',
      orbClass: 'ai-trader-status-orb--closed',
      navDotClass: 'off',
      subline: 'Broker disconnected. Reconnect broker bridge to resume live trading.'
    };
  }
  return {
    word: 'STOPPED',
    chipClass: 'ai-trader-status-chip--stopped',
    orbClass: 'ai-trader-status-orb--stopped',
    navDotClass: 'off',
    subline: 'Bot is currently stopped. Press START to begin.'
  };
}

function emitBotStatusPill(payload) {
  try {
    window.dispatchEvent(new CustomEvent(AI_TRADER_STATUS_PILL_EVENT, { detail: payload }));
  } catch (_error) {
    // Non-fatal.
  }
}

function applyVisualBotStatus(visual) {
  emitBotStatusPill({
    statusWord: visual.word,
    stateClass: visual.navDotClass,
    isRunning: visual.word === 'RUNNING',
    href: '/#ai-trader-hub'
  });
  const navDot = byId('ai-trader-nav-dot');
  if (navDot) {
    navDot.classList.toggle('is-running', visual.word === 'RUNNING');
    navDot.classList.toggle('is-paused', visual.word === 'PAUSED' || visual.word === 'MARKET CLOSED');
  }
}

function inferIsMarketClosed() {
  const now = new Date();
  const utcDay = now.getUTCDay();
  if (utcDay === 0 || utcDay === 6) {
    return true;
  }
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const minutes = utcHour * 60 + utcMinute;
  const openMinutes = (13 * 60) + 30;
  const closeMinutes = 20 * 60;
  return minutes < openMinutes || minutes >= closeMinutes;
}

function computeMarketStatusLine() {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const minutes = utcHour * 60 + utcMinute;
  const openMinutes = (13 * 60) + 30;
  const closeMinutes = 20 * 60;
  const isWeekend = utcDay === 0 || utcDay === 6;
  if (isWeekend) {
    return 'CLOSED • opens Monday';
  }
  if (minutes < openMinutes) {
    const toOpen = openMinutes - minutes;
    return `CLOSED • opens in ${toOpen}m`;
  }
  if (minutes >= closeMinutes) {
    return 'CLOSED • opens tomorrow';
  }
  const toClose = closeMinutes - minutes;
  return `OPEN • closes in ${toClose}m`;
}

function renderStatsBar(snapshot) {
  const stats = snapshot?.stats || {};
  const risk = snapshot?.riskSettings || {};
  const history = snapshot?.tradeHistory || {};
  const openPositions = Array.isArray(snapshot?.openPositions) ? snapshot.openPositions : [];
  const maxOpenPositions = num(snapshot?.config?.maxPositions, Math.max(1, openPositions.length));
  const tradesToday = num(risk.tradesOpenedToday, 0);
  const winRate = num(history?.summary?.winRatePct ?? stats?.winRatePct, 0);
  const closedHistory = Array.isArray(history?.closed) ? history.closed : [];
  const todayPnl = closedHistory
    .filter((row) => isTodayIso(row.closedAt))
    .reduce((sum, row) => sum + num(row.pnlUsd, 0), 0);

  const pnlNode = byId('ai-trader-stat-pnl-today');
  const tradesNode = byId('ai-trader-stat-trades-today');
  const winRateNode = byId('ai-trader-stat-win-rate');
  const openNode = byId('ai-trader-stat-open-positions');
  const nextScanNode = byId('ai-trader-stat-next-scan');
  const marketNode = byId('ai-trader-stat-market-status');

  if (tradesNode) {
    tradesNode.textContent = String(tradesToday);
  }
  if (winRateNode) {
    winRateNode.textContent = fmtPct(winRate, 0);
  }
  if (pnlNode) {
    pnlNode.textContent = fmtSignedUsd(todayPnl);
    pnlNode.classList.toggle('is-positive', todayPnl > 0);
    pnlNode.classList.toggle('is-negative', todayPnl < 0);
  }
  if (openNode) {
    openNode.textContent = `${openPositions.length} / ${maxOpenPositions}`;
  }
  if (nextScanNode) {
    nextScanNode.textContent = state.nextScanSeconds === null ? '--s' : `${Math.max(0, Math.round(state.nextScanSeconds))}s`;
  }
  if (marketNode) {
    marketNode.textContent = computeMarketStatusLine();
  }
}

function isTodayIso(value) {
  if (!value) {
    return false;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear()
    && date.getUTCMonth() === now.getUTCMonth()
    && date.getUTCDate() === now.getUTCDate();
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

function makeActivityRows(snapshot) {
  const rows = [];
  const cycle = snapshot?.lastCycle || {};
  const recentBrokerOrders = Array.isArray(snapshot?.execution?.recentBrokerOrders)
    ? snapshot.execution.recentBrokerOrders
    : [];
  const pendingIdeas = Array.isArray(snapshot?.execution?.pendingTradeProposals)
    ? snapshot.execution.pendingTradeProposals
    : [];
  const openPositions = Array.isArray(snapshot?.openPositions) ? snapshot.openPositions : [];
  const closed = Array.isArray(cycle?.closedPositions) ? cycle.closedPositions : [];
  const planned = Array.isArray(cycle?.plannedTrades) ? cycle.plannedTrades : [];

  recentBrokerOrders.slice(0, 8).forEach((order) => {
    const status = String(order?.status || '').toLowerCase();
    const side = String(order?.orderPayload?.side || '').toUpperCase();
    const isBuy = side.includes('BUY');
    const icon = isBuy ? '🟢' : '🔴';
    const action = `${isBuy ? 'BUY' : 'SELL'} executed`;
    const ticker = order?.orderPayload?.symbol || order?.ticker || 'N/A';
    rows.push({
      at: order?.submittedAt,
      icon,
      type: action,
      ticker,
      description: status === 'submitted'
        ? `${isBuy ? 'Bought' : 'Sold'} ${ticker} via broker route.`
        : `Order rejected for ${ticker}.`,
      pnlUsd: null
    });
  });

  closed.slice(0, 8).forEach((row) => {
    const pnl = num(row?.pnlUsd, 0);
    const isProfit = pnl > 0;
    const isLoss = pnl < 0;
    let icon = '⚪';
    let type = 'Position closed';
    if (String(row?.result || '').includes('take_profit')) {
      icon = '🔵';
      type = 'Take profit triggered';
    } else if (String(row?.result || '').includes('stop_loss')) {
      icon = '⚪';
      type = 'Stop loss triggered';
    }
    rows.push({
      at: row?.closedAt,
      icon,
      type,
      ticker: row?.ticker || 'N/A',
      description: `${row?.ticker || 'Position'} closed at ${fmtSignedUsd(pnl)} (${isProfit ? 'gain' : isLoss ? 'loss' : 'flat'}).`,
      pnlUsd: pnl
    });
  });

  planned.slice(0, 6).forEach((trade) => {
    const score = num(trade?.promptAlignment?.score, 0);
    rows.push({
      at: trade?.createdAt || cycle?.executedAt,
      icon: '🟡',
      type: 'Signal scanned (no trade)',
      ticker: trade?.ticker || 'N/A',
      description: `Scanned ${trade?.ticker || 'symbol'} — Score: ${score >= 0 ? '+' : ''}${score} — awaiting approval.`,
      pnlUsd: null
    });
  });

  pendingIdeas.slice(0, 6).forEach((idea) => {
    rows.push({
      at: idea?.proposedAt || cycle?.executedAt,
      icon: '🟡',
      type: 'Signal scanned (no trade)',
      ticker: idea?.symbol || idea?.ticker || 'N/A',
      description: `Scanned ${idea?.symbol || idea?.ticker || 'symbol'} — Score: +${num(idea?.confidenceScore, 0)} — Below threshold, no trade.`,
      pnlUsd: null
    });
  });

  if (cycle?.executedAt) {
    rows.push({
      at: cycle.executedAt,
      icon: '⚙️',
      type: 'Bot cycle executed',
      ticker: 'SYSTEM',
      description: `Cycle complete — ${planned.length} planned trades, ${openPositions.length} open positions.`,
      pnlUsd: null
    });
  }

  const dailyLoss = num(snapshot?.riskSettings?.dailyRealizedLossUsd, 0);
  const dailyLimit = num(snapshot?.riskSettings?.maxDailyLossUsd, 0);
  if (dailyLimit > 0 && dailyLoss >= dailyLimit) {
    rows.push({
      at: new Date().toISOString(),
      icon: '🚨',
      type: 'Daily loss limit hit',
      ticker: 'RISK',
      description: `Daily max loss reached (${fmtUsd(dailyLoss)} / ${fmtUsd(dailyLimit)}). Bot halted for safety.`,
      pnlUsd: -Math.abs(dailyLoss)
    });
  }

  rows.sort((a, b) => new Date(String(b.at || 0)).getTime() - new Date(String(a.at || 0)).getTime());
  return rows.slice(0, 20);
}

function renderActivityFeed(rows) {
  const list = byId('ai-trader-activity-list');
  if (!list) {
    return;
  }
  if (!rows.length) {
    list.classList.remove('ai-trader-skeleton-wrap');
    list.innerHTML = `
      <article class="ai-trader-empty-state">
        <h4>No bot activity yet</h4>
        <p>Start the bot to see scans, trade actions, and safety events appear in real time.</p>
      </article>
    `;
    return;
  }
  list.classList.remove('ai-trader-skeleton-wrap');
  list.innerHTML = rows
    .map((row) => {
      const pnl = num(row.pnlUsd, 0);
      const pnlClass = pnl > 0 ? 'is-positive' : pnl < 0 ? 'is-negative' : '';
      const pnlText = row.pnlUsd === null || row.pnlUsd === undefined ? '' : `<span class="ai-trader-activity-pnl ${pnlClass}">${fmtSignedUsd(pnl)}</span>`;
      return `
        <article class="ai-trader-activity-item">
          <div class="ai-trader-activity-top">
            <span class="ai-trader-activity-time">${formatClock(row.at)}</span>
            <span class="ai-trader-activity-type">${row.icon} ${escapeHtml(row.type)}</span>
          </div>
          <p class="ai-trader-activity-desc"><strong>${escapeHtml(row.ticker)}</strong> ${escapeHtml(row.description)}</p>
          ${pnlText}
        </article>
      `;
    })
    .join('');
}

function pseudoSeries(seed, points = 18, amplitude = 0.03) {
  const out = [];
  let cursor = (seed % 97) / 97;
  for (let i = 0; i < points; i += 1) {
    cursor = (Math.sin((cursor + i) * 11.7) + 1) / 2;
    const val = 1 + ((cursor - 0.5) * 2 * amplitude);
    out.push(val);
  }
  return out;
}

function buildSparklinePath(series, width = 220, height = 60, padding = 6) {
  if (!series.length) {
    return '';
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = Math.max(0.0001, max - min);
  const usableW = width - (padding * 2);
  const usableH = height - (padding * 2);
  return series
    .map((value, index) => {
      const x = padding + ((index / Math.max(1, series.length - 1)) * usableW);
      const y = padding + ((max - value) / range) * usableH;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function heldDurationText(openedAt) {
  if (!openedAt) {
    return 'just opened';
  }
  const opened = new Date(String(openedAt));
  if (Number.isNaN(opened.getTime())) {
    return 'just opened';
  }
  const deltaMs = Math.max(0, Date.now() - opened.getTime());
  const hours = Math.floor(deltaMs / 3600000);
  const minutes = Math.floor((deltaMs % 3600000) / 60000);
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function renderPositionCards(snapshot) {
  const grid = byId('ai-trader-positions-grid');
  const chip = byId('ai-trader-positions-chip');
  if (!grid) {
    return;
  }
  const rows = Array.isArray(snapshot?.openPositions) ? snapshot.openPositions : [];
  if (chip) {
    chip.textContent = `${rows.length} open`;
  }
  if (!rows.length) {
    grid.classList.remove('ai-trader-skeleton-wrap');
    grid.innerHTML = `
      <article class="ai-trader-empty-state">
        <h4>No open positions</h4>
        <p>No active trades yet. The bot will open position cards here when trade ideas are approved and executed.</p>
      </article>
    `;
    state.lastKnownPositionIds = new Set();
    return;
  }
  const previousIds = state.lastKnownPositionIds;
  const nextIds = new Set(rows.map((row) => String(row?.id || '')));

  grid.classList.remove('ai-trader-skeleton-wrap');
  grid.innerHTML = rows
    .map((row) => {
      const entry = num(row.entry, 0);
      const mark = num(row.markPrice || row.entry, entry);
      const shares = Math.max(0, num(row.shares, 0));
      const pnlUsd = num(row.unrealizedPnlUsd, 0);
      const pnlPct = entry > 0 ? ((mark - entry) / entry) * 100 : 0;
      const positive = pnlUsd >= 0;
      const cardClass = positive ? 'is-positive' : 'is-negative';
      const symbolSeed = Array.from(String(row.ticker || ''))
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const series = pseudoSeries(symbolSeed);
      const path = buildSparklinePath(series);
      const hasStop = num(row.stopLoss, 0) > 0;
      const hasTake = num(row.takeProfit, 0) > 0;
      const stopY = hasStop ? clamp(((Math.max(...series) - (num(row.stopLoss, entry) / Math.max(1, entry))) / Math.max(0.0001, Math.max(...series) - Math.min(...series))) * 60, 2, 58) : 56;
      const takeY = hasTake ? clamp(((Math.max(...series) - (num(row.takeProfit, entry) / Math.max(1, entry))) / Math.max(0.0001, Math.max(...series) - Math.min(...series))) * 60, 2, 58) : 8;
      const animClass = previousIds.has(String(row?.id || '')) ? '' : 'ai-trader-card-enter';
      return `
        <article class="ai-trader-position-card ${cardClass} ${animClass}" data-position-id="${escapeHtml(row.id)}">
          <div class="ai-trader-position-top">
            <div>
              <h4>${escapeHtml(row.ticker || 'N/A')}</h4>
              <p class="small-note">${escapeHtml(row.companyName || `${row.ticker || 'Ticker'} Holdings`)}</p>
            </div>
            <span class="ai-trader-pnl-badge ${cardClass}">${fmtSignedUsd(pnlUsd)} (${fmtSignedPct(pnlPct, 2)})</span>
          </div>
          <div class="ai-trader-position-prices">
            <p class="ai-trader-position-price">${fmtUsd(mark)}</p>
            <p class="small-note">Entry ${fmtUsd(entry)}</p>
          </div>
          <svg class="ai-trader-position-sparkline" viewBox="0 0 220 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="${path}" class="ai-trader-sparkline-path"></path>
            <line x1="0" y1="${stopY}" x2="220" y2="${stopY}" class="ai-trader-sparkline-stop"></line>
            <line x1="0" y1="${takeY}" x2="220" y2="${takeY}" class="ai-trader-sparkline-take"></line>
          </svg>
          <p class="small-note">SL ${fmtUsd(row.stopLoss)} • TP ${fmtUsd(row.takeProfit)}</p>
          <div class="ai-trader-position-meta">
            <span>${escapeHtml(row.sector || 'Watchlist')} • Held ${heldDurationText(row.openedAt)}</span>
            <span>${shares.toLocaleString()} shares</span>
          </div>
          <button type="button" class="ai-trader-close-position-btn" data-close-position-id="${escapeHtml(row.id)}">CLOSE</button>
        </article>
      `;
    })
    .join('');
  state.lastKnownPositionIds = nextIds;
}

function scoreClass(score) {
  const value = num(score, 0);
  if (value > 50) {
    return 'score-strong-buy';
  }
  if (value >= 20) {
    return 'score-buy';
  }
  if (value > -20) {
    return 'score-neutral';
  }
  if (value > -50) {
    return 'score-sell';
  }
  return 'score-strong-sell';
}

function scoreBadge(score) {
  const value = num(score, 0);
  if (value > 50) {
    return 'BUY';
  }
  if (value >= 20) {
    return 'WATCH';
  }
  if (value > -20) {
    return 'SKIP';
  }
  return 'SELL';
}

function makeSignalRows(snapshot) {
  const rows = [];
  const ranked = Array.isArray(snapshot?.execution?.lastWebsiteSignalSnapshot?.rankedSymbols)
    ? snapshot.execution.lastWebsiteSignalSnapshot.rankedSymbols
    : [];
  const ideas = Array.isArray(snapshot?.execution?.tradeIdeas) ? snapshot.execution.tradeIdeas : [];
  const trendMap = snapshot?.execution?.lastWebsiteSignalSnapshot?.trendBySymbol || {};
  const promptControl = snapshot?.execution?.promptControl || {};

  ranked.slice(0, 15).forEach((symbol, index) => {
    const idea = ideas.find((row) => String(row?.symbol || row?.ticker || '').toUpperCase() === String(symbol).toUpperCase());
    const trend = trendMap?.[symbol] || {};
    const bullishBias = num(trend.trendScore, 0) / 100;
    const promptBias = promptControl.preferredTickers?.includes(symbol) ? 0.2 : 0;
    const score = clamp(Math.round((bullishBias * 85) + (promptBias * 55) + (num(idea?.confidenceScore, 35) - 35)), -100, 100);
    rows.push({
      symbol,
      company: `${symbol} Holdings`,
      score,
      action: scoreBadge(score),
      bars: {
        rsi: clamp(Math.round((score + 100) / 2), 0, 100),
        macd: clamp(Math.round((score + 75) / 1.8), 0, 100),
        volume: clamp(Math.round((score + 90) / 1.9), 0, 100),
        bollinger: clamp(Math.round((score + 60) / 1.6), 0, 100),
        ema: clamp(Math.round((score + 80) / 1.7), 0, 100)
      },
      index
    });
  });

  if (!rows.length) {
    ideas.slice(0, 15).forEach((idea, index) => {
      const symbol = idea?.symbol || idea?.ticker || `SCAN-${index + 1}`;
      const score = clamp(Math.round(num(idea?.confidenceScore, 20) - 20), -100, 100);
      rows.push({
        symbol,
        company: `${symbol} Holdings`,
        score,
        action: scoreBadge(score),
        bars: {
          rsi: clamp(Math.round((score + 100) / 2), 0, 100),
          macd: clamp(Math.round((score + 100) / 2), 0, 100),
          volume: clamp(Math.round((score + 100) / 2), 0, 100),
          bollinger: clamp(Math.round((score + 100) / 2), 0, 100),
          ema: clamp(Math.round((score + 100) / 2), 0, 100)
        },
        index
      });
    });
  }

  return rows.slice(0, 15);
}

function barTone(value) {
  const parsed = num(value, 0);
  if (parsed >= 65) {
    return 'bullish';
  }
  if (parsed <= 35) {
    return 'bearish';
  }
  return 'neutral';
}

function renderSignalScanner(rows) {
  const list = byId('ai-trader-signal-list');
  if (!list) {
    return;
  }
  if (!rows.length) {
    list.classList.remove('ai-trader-skeleton-wrap');
    list.innerHTML = `
      <article class="ai-trader-empty-state">
        <h4>Scanner warming up</h4>
        <p>Signal bars will populate after the next completed scan cycle.</p>
      </article>
    `;
    return;
  }
  list.classList.remove('ai-trader-skeleton-wrap');
  list.innerHTML = rows.map((row) => {
    const scoreTone = scoreClass(row.score);
    const signalBar = (label, key) => `
      <span class="ai-trader-signal-metric">
        <span>${label}</span>
        <span class="ai-trader-signal-meter ai-trader-signal-meter--${barTone(row.bars[key])}">
          <span style="width:${clamp(num(row.bars[key], 0), 0, 100)}%"></span>
        </span>
      </span>
    `;
    return `
      <article class="ai-trader-signal-row">
        <div class="ai-trader-signal-symbol">
          <strong>${escapeHtml(row.symbol)}</strong>
          <span>${escapeHtml(row.company)}</span>
        </div>
        <div class="ai-trader-signal-bars">
          ${signalBar('RSI', 'rsi')}
          ${signalBar('MACD', 'macd')}
          ${signalBar('Volume', 'volume')}
          ${signalBar('Bollinger', 'bollinger')}
          ${signalBar('EMA', 'ema')}
        </div>
        <div class="ai-trader-signal-score ${scoreTone}">
          <strong>${row.score >= 0 ? '+' : ''}${row.score}</strong>
          <span class="chip">${escapeHtml(row.action)}</span>
        </div>
      </article>
    `;
  }).join('');
}

function inferRiskLevelFromConfig(config) {
  const risk = num(config?.riskPerTradePct, 1.2);
  if (risk <= 1) {
    return 'conservative';
  }
  if (risk >= 1.8) {
    return 'aggressive';
  }
  return 'moderate';
}

function inferUniverseFromConfig(config) {
  const sectors = Array.isArray(config?.sectors) ? config.sectors : [];
  const lower = sectors.map((sector) => String(sector).toLowerCase());
  if (lower.includes('technology') && lower.includes('communication services') && lower.includes('consumer discretionary')) {
    return 'nasdaq100';
  }
  if (sectors.length >= 6) {
    return 'sp500';
  }
  return 'custom';
}

function applyVisualSettingsFromConfig(config, snapshot) {
  state.syncingForm = true;
  const stopLoss = clamp(num(config?.stopLossPct, 2.5), 0.5, 15);
  const takeProfit = clamp(num(config?.takeProfitPct, 5.5), 1, 30);
  const maxPositions = Math.max(1, Math.round(num(config?.maxPositions, 4)));
  const maxPositionSizeNode = byId('ai-trader-setting-max-position-size');
  const portfolioBase = Math.max(1, num(snapshot?.portfolio?.equityUsd ?? snapshot?.cashUsd, 10000));
  const allocationPct = clamp(num(config?.allocationPerTradePct, 20), 1, 90);
  const estimatedPositionSize = Math.round((allocationPct / 100) * portfolioBase);
  const maxPositionSize = Math.max(100, estimatedPositionSize);
  const dailyLossUsd = Math.round((Math.max(1, num(config?.maxDailyLossPct, 3)) / 100) * portfolioBase);

  const stopNode = byId('ai-trader-setting-stop-loss');
  const takeNode = byId('ai-trader-setting-take-profit');
  const maxOpenValueNode = byId('ai-trader-setting-max-open-value');
  const dailyLossNode = byId('ai-trader-setting-daily-max-loss');

  if (stopNode instanceof HTMLInputElement) {
    stopNode.value = String(stopLoss);
  }
  if (takeNode instanceof HTMLInputElement) {
    takeNode.value = String(takeProfit);
  }
  if (maxOpenValueNode) {
    maxOpenValueNode.textContent = String(maxPositions);
  }
  if (maxPositionSizeNode instanceof HTMLInputElement) {
    maxPositionSizeNode.value = String(maxPositionSize);
  }
  if (dailyLossNode instanceof HTMLInputElement) {
    dailyLossNode.value = String(Math.max(50, dailyLossUsd));
  }

  updateStopLossText();
  updateTakeProfitText();
  updatePositionSizeVisual(portfolioBase);
  updateDailyLossText();

  state.selectedRiskLevel = inferRiskLevelFromConfig(config);
  state.selectedUniverse = inferUniverseFromConfig(config);
  renderRiskLevelSelection();
  renderUniverseSelection();
  state.syncingForm = false;
}

function updateStopLossText() {
  const input = byId('ai-trader-setting-stop-loss');
  const text = byId('ai-trader-setting-stop-loss-text');
  if (!(input instanceof HTMLInputElement) || !text) {
    return;
  }
  const value = clamp(num(input.value, 2.5), 0.5, 15);
  text.textContent = `Sell if down ${value.toFixed(1)}%`;
}

function updateTakeProfitText() {
  const input = byId('ai-trader-setting-take-profit');
  const text = byId('ai-trader-setting-take-profit-text');
  if (!(input instanceof HTMLInputElement) || !text) {
    return;
  }
  const value = clamp(num(input.value, 5.5), 1, 30);
  text.textContent = `Sell if up ${value.toFixed(1)}%`;
}

function updatePositionSizeVisual(portfolioBase = null) {
  const input = byId('ai-trader-setting-max-position-size');
  const text = byId('ai-trader-setting-position-size-text');
  const fill = byId('ai-trader-setting-position-size-fill');
  const snapshot = state.latest;
  const base = Math.max(1, portfolioBase ?? num(snapshot?.portfolio?.equityUsd ?? snapshot?.cashUsd, 10000));
  if (!(input instanceof HTMLInputElement) || !text || !fill) {
    return;
  }
  const value = Math.max(100, num(input.value, 1000));
  const pct = clamp((value / base) * 100, 0, 100);
  fill.style.width = `${pct}%`;
  text.textContent = `${pct.toFixed(1)}% of portfolio per position`;
}

function updateDailyLossText() {
  const input = byId('ai-trader-setting-daily-max-loss');
  const text = byId('ai-trader-setting-daily-max-loss-text');
  if (!(input instanceof HTMLInputElement) || !text) {
    return;
  }
  const value = Math.max(50, num(input.value, 500));
  text.textContent = `Bot stops for the day if portfolio drops $${Math.round(value).toLocaleString()}.`;
}

function renderRiskLevelSelection() {
  document.querySelectorAll('.ai-trader-risk-card').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const isActive = String(node.dataset.riskLevel || '') === state.selectedRiskLevel;
    node.classList.toggle('is-active', isActive);
    node.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function renderUniverseSelection() {
  document.querySelectorAll('#ai-trader-setting-universe .ai-trader-pill').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const isActive = String(node.dataset.universe || '') === state.selectedUniverse;
    node.classList.toggle('is-active', isActive);
    node.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function flashSavedState() {
  const flash = byId('ai-trader-settings-save-flash');
  if (!flash) {
    return;
  }
  if (state.saveFlashTimer) {
    window.clearTimeout(state.saveFlashTimer);
  }
  flash.classList.remove('hidden');
  state.saveFlashTimer = window.setTimeout(() => {
    flash.classList.add('hidden');
  }, 1500);
}

function collectSettingsPayload() {
  const snapshot = state.latest || {};
  const previousConfig = snapshot.config || {};
  const currentCash = Math.max(100, num(snapshot.cashUsd ?? snapshot?.portfolio?.equityUsd, 10000));
  const stopLossNode = byId('ai-trader-setting-stop-loss');
  const takeProfitNode = byId('ai-trader-setting-take-profit');
  const maxPositionSizeNode = byId('ai-trader-setting-max-position-size');
  const maxOpenValueNode = byId('ai-trader-setting-max-open-value');
  const dailyMaxLossNode = byId('ai-trader-setting-daily-max-loss');

  const stopLossPct = clamp(num(stopLossNode?.value, previousConfig.stopLossPct || 2.5), 0.5, 15);
  const takeProfitPct = clamp(num(takeProfitNode?.value, previousConfig.takeProfitPct || 5.5), 1, 30);
  const maxPositionSizeUsd = Math.max(100, num(maxPositionSizeNode?.value, 1000));
  const allocationPerTradePct = clamp((maxPositionSizeUsd / currentCash) * 100, 2, 80);
  const maxPositions = Math.max(1, Math.round(num(maxOpenValueNode?.textContent, previousConfig.maxPositions || 4)));
  const dailyMaxLossUsd = Math.max(50, num(dailyMaxLossNode?.value, 500));
  const maxDailyLossPct = clamp((dailyMaxLossUsd / currentCash) * 100, 0.5, 25);
  const selectedRiskProfile = riskProfiles[state.selectedRiskLevel] || riskProfiles.moderate;
  const selectedSectors = state.selectedUniverse === 'nasdaq100'
    ? ['Technology', 'Semiconductors', 'Communication Services', 'Consumer Discretionary']
    : state.selectedUniverse === 'sp500'
      ? ['Technology', 'Semiconductors', 'Financials', 'Healthcare', 'Industrials', 'Communication Services']
      : (Array.isArray(previousConfig.sectors) && previousConfig.sectors.length
        ? previousConfig.sectors
        : ['Technology', 'Healthcare', 'Financials']);

  return {
    prompt: String(previousConfig.prompt || 'Momentum setups with disciplined risk.'),
    capitalUsd: Math.max(100, Math.round(currentCash)),
    tradingMode: String(snapshot.tradingMode || previousConfig.tradingMode || 'paper').toLowerCase() === 'live' ? 'live' : 'paper',
    timeframe: previousConfig.timeframe || 'intraday',
    chasePct: num(previousConfig.chasePct, 0.8),
    riskPerTradePct: selectedRiskProfile.riskPerTradePct,
    maxRiskPerTradePct: selectedRiskProfile.maxRiskPerTradePct,
    maxDailyLossPct,
    maxTradesPerDay: selectedRiskProfile.maxTradesPerDay,
    minRewardRiskRatio: num(previousConfig.minRewardRiskRatio, 1.8),
    autoExecuteLive: Boolean(previousConfig.autoExecuteLive),
    targetReturnPct: num(previousConfig.targetReturnPct, 12),
    allocationPerTradePct,
    maxSectorExposurePct: num(previousConfig.maxSectorExposurePct, 35),
    maxGrossExposurePct: num(previousConfig.maxGrossExposurePct, 100),
    maxPositions,
    stopLossPct,
    takeProfitPct,
    sectors: selectedSectors,
    testAreaCapitalUsd: Math.max(100, Math.round(currentCash)),
    testAreaRiskPct: selectedRiskProfile.riskPerTradePct
  };
}

async function saveSettings() {
  if (state.syncingForm || state.saveInFlight || state.authRequired) {
    return;
  }
  state.saveInFlight = true;
  const payload = collectSettingsPayload();
  try {
    const saved = await fetchJsonWithAuthRetry('/api/market/auto-trader/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    state.latest = saved;
    flashSavedState();
    renderFromSnapshot(saved);
  } catch (error) {
    if (error?.status === 401) {
      state.authRequired = true;
      renderAuthRequiredState();
      return;
    }
    // Keep silent status-driven UX for instant save to avoid noisy errors on every slider move.
  } finally {
    state.saveInFlight = false;
  }
}

function bindSettingsControls() {
  const stopLossNode = byId('ai-trader-setting-stop-loss');
  const takeProfitNode = byId('ai-trader-setting-take-profit');
  const maxPositionSizeNode = byId('ai-trader-setting-max-position-size');
  const dailyMaxLossNode = byId('ai-trader-setting-daily-max-loss');
  const maxMinus = byId('ai-trader-setting-max-open-minus');
  const maxPlus = byId('ai-trader-setting-max-open-plus');
  const maxOpenValue = byId('ai-trader-setting-max-open-value');
  const riskCardsWrap = byId('ai-trader-risk-level-cards');
  const universeWrap = byId('ai-trader-setting-universe');

  if (stopLossNode instanceof HTMLInputElement) {
    stopLossNode.addEventListener('input', () => {
      updateStopLossText();
      saveSettings();
    });
  }
  if (takeProfitNode instanceof HTMLInputElement) {
    takeProfitNode.addEventListener('input', () => {
      updateTakeProfitText();
      saveSettings();
    });
  }
  if (maxPositionSizeNode instanceof HTMLInputElement) {
    maxPositionSizeNode.addEventListener('input', () => {
      updatePositionSizeVisual();
      saveSettings();
    });
  }
  if (dailyMaxLossNode instanceof HTMLInputElement) {
    dailyMaxLossNode.addEventListener('input', () => {
      updateDailyLossText();
      saveSettings();
    });
  }
  if (maxMinus instanceof HTMLButtonElement && maxOpenValue) {
    maxMinus.addEventListener('click', () => {
      const next = Math.max(1, num(maxOpenValue.textContent, 4) - 1);
      maxOpenValue.textContent = String(next);
      saveSettings();
    });
  }
  if (maxPlus instanceof HTMLButtonElement && maxOpenValue) {
    maxPlus.addEventListener('click', () => {
      const next = Math.min(12, num(maxOpenValue.textContent, 4) + 1);
      maxOpenValue.textContent = String(next);
      saveSettings();
    });
  }
  if (riskCardsWrap) {
    riskCardsWrap.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const card = target.closest('.ai-trader-risk-card');
      if (!(card instanceof HTMLButtonElement)) {
        return;
      }
      const level = String(card.dataset.riskLevel || '').toLowerCase();
      if (!riskProfiles[level]) {
        return;
      }
      state.selectedRiskLevel = level;
      renderRiskLevelSelection();
      const profile = riskProfiles[level];
      const stop = byId('ai-trader-setting-stop-loss');
      const take = byId('ai-trader-setting-take-profit');
      const maxOpen = byId('ai-trader-setting-max-open-value');
      if (stop instanceof HTMLInputElement) {
        stop.value = String(profile.stopLossPct);
      }
      if (take instanceof HTMLInputElement) {
        take.value = String(profile.takeProfitPct);
      }
      if (maxOpen) {
        maxOpen.textContent = String(profile.maxPositions);
      }
      updateStopLossText();
      updateTakeProfitText();
      saveSettings();
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
      const value = String(pill.dataset.universe || '').toLowerCase();
      if (!value) {
        return;
      }
      state.selectedUniverse = value;
      renderUniverseSelection();
      saveSettings();
    });
  }
}

function periodFilter(daysBack) {
  const now = Date.now();
  const msBack = daysBack * 86400000;
  return (row) => {
    const closedAt = new Date(String(row?.closedAt || row?.openedAt || ''));
    if (Number.isNaN(closedAt.getTime())) {
      return false;
    }
    return (now - closedAt.getTime()) <= msBack;
  };
}

function filterTradesForPeriod(trades, period) {
  const rows = Array.isArray(trades) ? trades : [];
  if (period === 'today') {
    return rows.filter((row) => isTodayIso(row.closedAt || row.openedAt));
  }
  if (period === 'week') {
    return rows.filter(periodFilter(7));
  }
  if (period === 'month') {
    return rows.filter(periodFilter(31));
  }
  return rows;
}

function aggregateDailyBars(trades) {
  const map = new Map();
  trades.forEach((row) => {
    const date = new Date(String(row?.closedAt || row?.openedAt || ''));
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    map.set(key, num(map.get(key), 0) + num(row?.pnlUsd, 0));
  });
  return Array.from(map.entries())
    .map(([day, pnl]) => ({ day, pnl }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14);
}

function renderPerformance(snapshot) {
  const period = state.selectedPerformancePeriod;
  const allClosed = Array.isArray(snapshot?.tradeHistory?.closed)
    ? snapshot.tradeHistory.closed
    : Array.isArray(snapshot?.tradeHistory)
      ? snapshot.tradeHistory.filter((row) => String(row?.status || '').toLowerCase() === 'closed')
      : [];
  const trades = filterTradesForPeriod(allClosed, period);
  const totalPnl = trades.reduce((sum, row) => sum + num(row.pnlUsd, 0), 0);
  const wins = trades.filter((row) => num(row.pnlUsd, 0) > 0).length;
  const losses = trades.filter((row) => num(row.pnlUsd, 0) < 0).length;
  const tradeCount = trades.length;
  const winRate = tradeCount > 0 ? (wins / tradeCount) * 100 : 0;
  const best = trades.slice().sort((a, b) => num(b.pnlUsd, 0) - num(a.pnlUsd, 0))[0];
  const worst = trades.slice().sort((a, b) => num(a.pnlUsd, 0) - num(b.pnlUsd, 0))[0];

  const avgHoldMinutes = trades.length
    ? trades.reduce((sum, row) => {
      const opened = new Date(String(row.openedAt || ''));
      const closed = new Date(String(row.closedAt || row.openedAt || ''));
      if (Number.isNaN(opened.getTime()) || Number.isNaN(closed.getTime())) {
        return sum;
      }
      return sum + Math.max(0, Math.round((closed.getTime() - opened.getTime()) / 60000));
    }, 0) / trades.length
    : 0;

  const baseEquity = Math.max(1, num(snapshot?.portfolio?.equityUsd ?? snapshot?.totalDepositedUsd, 10000));
  const pnlPct = (totalPnl / baseEquity) * 100;
  const bars = aggregateDailyBars(trades);

  const metricPnl = byId('ai-trader-metric-pnl');
  const metricTrades = byId('ai-trader-metric-trades');
  const metricWinRate = byId('ai-trader-metric-win-rate');
  const metricBest = byId('ai-trader-metric-best');
  const metricWorst = byId('ai-trader-metric-worst');
  const metricHold = byId('ai-trader-metric-hold-time');
  const chart = byId('ai-trader-performance-chart');

  if (metricPnl) {
    metricPnl.textContent = `${fmtSignedUsd(totalPnl)} (${fmtSignedPct(pnlPct, 2)})`;
    metricPnl.classList.toggle('is-positive', totalPnl > 0);
    metricPnl.classList.toggle('is-negative', totalPnl < 0);
  }
  if (metricTrades) {
    metricTrades.textContent = String(tradeCount);
  }
  if (metricWinRate) {
    metricWinRate.textContent = fmtPct(winRate, 1);
  }
  if (metricBest) {
    metricBest.textContent = best ? `${best.ticker || 'N/A'} ${fmtSignedUsd(best.pnlUsd)}` : 'None';
  }
  if (metricWorst) {
    metricWorst.textContent = worst ? `${worst.ticker || 'N/A'} ${fmtSignedUsd(worst.pnlUsd)}` : 'None';
  }
  if (metricHold) {
    const hours = Math.floor(avgHoldMinutes / 60);
    const mins = Math.round(avgHoldMinutes % 60);
    metricHold.textContent = `${hours > 0 ? `${hours}h ` : ''}${mins}m`;
  }
  if (chart) {
    const maxAbs = Math.max(1, ...bars.map((row) => Math.abs(num(row.pnl, 0))));
    const barsMarkup = bars.length
      ? bars.map((row) => {
        const pnl = num(row.pnl, 0);
        const height = clamp((Math.abs(pnl) / maxAbs) * 100, 8, 100);
        const cls = pnl >= 0 ? 'is-positive' : 'is-negative';
        return `
          <span class="ai-trader-chart-col">
            <span class="ai-trader-chart-bar ${cls}" style="height:${height}%"></span>
            <span class="ai-trader-chart-day">${escapeHtml(row.day.slice(5))}</span>
          </span>
        `;
      }).join('')
      : '<span class="ai-trader-chart-empty">No closed trades in this period.</span>';
    chart.classList.remove('ai-trader-skeleton-wrap');
    chart.innerHTML = `
      <span class="ai-trader-chart-label">Daily P&amp;L</span>
      <div class="ai-trader-chart-bars">${barsMarkup}</div>
    `;
  }
}

function renderPerformanceTabState() {
  document.querySelectorAll('#ai-trader-performance-tabs .ai-trader-pill--tab').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return;
    }
    const active = String(node.dataset.performancePeriod || '') === state.selectedPerformancePeriod;
    node.classList.toggle('is-active', active);
    node.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

async function setBotActive(targetActive) {
  const endpoint = targetActive
    ? '/api/market/auto-trader/bot/resume'
    : '/api/market/auto-trader/bot/pause';
  await fetchJsonWithAuthRetry(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (targetActive) {
    // Best effort: when live + auto execute are enabled, also trigger autopilot loop.
    try {
      await fetchJsonWithAuthRetry('/api/market/auto-trader/autopilot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMs: 30000 })
      });
    } catch (_error) {
      // Some plans/modes won't allow autopilot start; bot resume still succeeded.
    }
  }
  await refreshSnapshot();
}

async function stopBotCompletely() {
  const stopAutopilotPromise = fetchJsonWithAuthRetry('/api/market/auto-trader/autopilot/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).catch(() => null);
  const pausePromise = setBotActive(false);
  await Promise.all([stopAutopilotPromise, pausePromise]);
}

function setControlButtonsState(snapshot, visualStatus) {
  const startBtn = byId('ai-trader-start-btn');
  const pauseBtn = byId('ai-trader-pause-btn');
  const stopBtn = byId('ai-trader-stop-btn');
  const isRunning = visualStatus.word === 'RUNNING';
  const isPaused = visualStatus.word === 'PAUSED';
  const isStopped = visualStatus.word === 'STOPPED' || visualStatus.word === 'MARKET CLOSED';
  if (startBtn instanceof HTMLButtonElement) {
    startBtn.disabled = isRunning;
  }
  if (pauseBtn instanceof HTMLButtonElement) {
    pauseBtn.disabled = isPaused || isStopped;
  }
  if (stopBtn instanceof HTMLButtonElement) {
    stopBtn.disabled = isStopped;
  }
}

function renderAuthRequiredState() {
  const list = byId('ai-trader-activity-list');
  const positions = byId('ai-trader-positions-grid');
  const scanner = byId('ai-trader-signal-list');
  const perf = byId('ai-trader-performance-chart');
  const text = `
    <article class="ai-trader-empty-state">
      <h4>Sign in required</h4>
      <p>Log in to view your AI Trader data and controls.</p>
      <a class="open-link btn-secondary" href="/ai-trade-access.html?mode=login&next=%2F">Log in</a>
    </article>
  `;
  [list, positions, scanner, perf].forEach((node) => {
    if (node) {
      node.classList.remove('ai-trader-skeleton-wrap');
      node.innerHTML = text;
    }
  });
}

function renderLoadingSkeletonState() {
  const targetIds = ['ai-trader-activity-list', 'ai-trader-positions-grid', 'ai-trader-signal-list', 'ai-trader-performance-chart'];
  targetIds.forEach((id) => {
    const node = byId(id);
    if (!node) {
      return;
    }
    node.classList.add('ai-trader-skeleton-wrap');
  });
}

function renderLoadErrorState(message = 'Could not load AI Trader data.') {
  const html = `
    <article class="ai-trader-empty-state">
      <h4>Data temporarily unavailable</h4>
      <p>${escapeHtml(message)}</p>
      <button id="ai-trader-retry-load" type="button" class="btn-secondary">Retry</button>
    </article>
  `;
  ['ai-trader-activity-list', 'ai-trader-positions-grid', 'ai-trader-signal-list', 'ai-trader-performance-chart'].forEach((id) => {
    const node = byId(id);
    if (node) {
      node.classList.remove('ai-trader-skeleton-wrap');
      node.innerHTML = html;
    }
  });
  const retryButton = byId('ai-trader-retry-load');
  if (retryButton instanceof HTMLButtonElement) {
    retryButton.addEventListener('click', () => {
      renderLoadingSkeletonState();
      refreshSnapshot().catch(() => {});
    }, { once: true });
  }
}

function renderFromSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }
  const visual = inferBotVisualStatus(snapshot);
  setTopStatusChip(visual.word, visual.chipClass);
  setStatusOrb(visual.word, visual.orbClass, visual.subline);
  setControlButtonsState(snapshot, visual);
  renderStatsBar(snapshot);

  const feedRows = makeActivityRows(snapshot);
  const signalRows = makeSignalRows(snapshot);
  state.feedRows = feedRows;
  state.signalRows = signalRows;
  renderActivityFeed(feedRows);
  renderPositionCards(snapshot);
  renderSignalScanner(signalRows);
  applyVisualSettingsFromConfig(snapshot.config || {}, snapshot);
  renderPerformanceTabState();
  renderPerformance(snapshot);
  applyVisualBotStatus(visual);
}

async function closePosition(positionId) {
  if (!positionId) {
    return;
  }
  await fetchJsonWithAuthRetry(`/api/market/auto-trader/positions/${encodeURIComponent(positionId)}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  await refreshSnapshot();
}

function bindMainInteractions() {
  const startBtn = byId('ai-trader-start-btn');
  const pauseBtn = byId('ai-trader-pause-btn');
  const stopBtn = byId('ai-trader-stop-btn');
  const positionsGrid = byId('ai-trader-positions-grid');
  const tabs = byId('ai-trader-performance-tabs');
  const aiTraderNav = byId('ai-trader-nav-link');

  if (startBtn instanceof HTMLButtonElement) {
    startBtn.addEventListener('click', async () => {
      try {
        startBtn.disabled = true;
        await setBotActive(true);
      } catch (_error) {
        // silent
      } finally {
        startBtn.disabled = false;
      }
    });
  }
  if (pauseBtn instanceof HTMLButtonElement) {
    pauseBtn.addEventListener('click', async () => {
      try {
        pauseBtn.disabled = true;
        await setBotActive(false);
      } catch (_error) {
        // silent
      } finally {
        pauseBtn.disabled = false;
      }
    });
  }
  if (stopBtn instanceof HTMLButtonElement) {
    stopBtn.addEventListener('click', async () => {
      try {
        stopBtn.disabled = true;
        await stopBotCompletely();
      } catch (_error) {
        // silent
      } finally {
        stopBtn.disabled = false;
      }
    });
  }

  if (positionsGrid) {
    positionsGrid.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const closeButton = target.closest('.ai-trader-close-position-btn');
      if (!(closeButton instanceof HTMLButtonElement)) {
        return;
      }
      const positionId = String(closeButton.dataset.closePositionId || '').trim();
      if (!positionId) {
        return;
      }
      const card = closeButton.closest('.ai-trader-position-card');
      const positive = card?.classList.contains('is-positive');
      const negative = card?.classList.contains('is-negative');
      try {
        closeButton.disabled = true;
        if (card) {
          card.classList.add(positive ? 'ai-trader-card-exit-positive' : negative ? 'ai-trader-card-exit-negative' : 'ai-trader-card-exit-positive');
        }
        await new Promise((resolve) => window.setTimeout(resolve, 220));
        await closePosition(positionId);
      } finally {
        closeButton.disabled = false;
      }
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
      const next = String(button.dataset.performancePeriod || '').trim();
      if (!next) {
        return;
      }
      state.selectedPerformancePeriod = next;
      renderPerformanceTabState();
      if (state.latest) {
        renderPerformance(state.latest);
      }
    });
  }

  if (aiTraderNav instanceof HTMLAnchorElement) {
    aiTraderNav.addEventListener('click', (event) => {
      event.preventDefault();
      const hub = byId('ai-trader-hub');
      if (hub) {
        hub.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}

async function fetchSnapshot() {
  const [botPayload, accountPayload] = await Promise.all([
    fetchJsonWithAuthRetry('/api/market/auto-trader/bot', { method: 'GET' }),
    fetchJsonWithAuthRetry('/api/market/auto-trader/account-view', { method: 'GET' })
  ]);
  return {
    ...botPayload,
    account: accountPayload.account,
    portfolio: accountPayload.portfolio,
    tradeHistory: accountPayload.tradeHistory || botPayload.tradeHistory,
    riskSettings: accountPayload.riskSettings || botPayload.riskSettings,
    execution: {
      ...(botPayload.execution || {}),
      ...(accountPayload.execution || {})
    },
    openPositions: Array.isArray(accountPayload.openPositions) ? accountPayload.openPositions : (botPayload.openPositions || [])
  };
}

function syncTimersFromSnapshot(snapshot) {
  const intervalMs = num(snapshot?.execution?.autopilot?.intervalMs, 0);
  state.scanIntervalMs = intervalMs > 0 ? intervalMs : 30000;
  const shouldCountdown = Boolean(snapshot?.isActive);
  state.nextScanSeconds = shouldCountdown
    ? Math.max(1, Math.round(state.scanIntervalMs / 1000))
    : null;
}

async function refreshSnapshot() {
  try {
    const snapshot = await fetchSnapshot();
    state.authRequired = false;
    state.latest = snapshot;
    state.loading = false;
    syncTimersFromSnapshot(snapshot);
    renderFromSnapshot(snapshot);
  } catch (error) {
    if (error?.status === 401) {
      state.authRequired = true;
      renderAuthRequiredState();
      applyVisualBotStatus({
        word: 'STOPPED',
        navDotClass: 'off'
      });
      return;
    }
    if (state.latest) {
      // keep last successful UI data on transient errors
      return;
    }
    renderLoadErrorState(error?.message || 'Could not load AI Trader data right now.');
  }
}

function startPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
  }
  if (state.countdownTimer) {
    window.clearInterval(state.countdownTimer);
  }
  state.pollTimer = window.setInterval(() => {
    refreshSnapshot().catch(() => {});
  }, AI_TRADER_POLL_MS);
  state.countdownTimer = window.setInterval(() => {
    if (state.nextScanSeconds === null) {
      return;
    }
    const next = state.nextScanSeconds - 1;
    if (next <= 0) {
      state.nextScanSeconds = Math.max(1, Math.round(Math.max(1000, state.scanIntervalMs || 30000) / 1000));
    } else {
      state.nextScanSeconds = next;
    }
    if (state.latest) {
      renderStatsBar(state.latest);
    }
  }, 1000);
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
  promoteHubToTop();
  renderLoadingSkeletonState();
  bindMainInteractions();
  bindSettingsControls();
  refreshSnapshot().catch(() => {});
  startPolling();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAiTraderHub);
} else {
  initAiTraderHub();
}

