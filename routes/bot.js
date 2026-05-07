const express = require('express');
const { setUserAiTraderSetupById } = require('../services/userStore');
const { requireApiAuthStrictSession } = require('../services/routeAuth');
const { getUserByEmailForAuth } = require('../services/authDbService');
const {
  sendTradeAlertEmail,
  sendStopLossAlertEmail,
  sendDailyLossAlertEmail
} = require('../services/schedulerService');
const {
  configureAutoTrader,
  getAutoTraderStatus,
  getAutoTraderAccountView,
  setBotActive,
  stopAutoTraderAutopilot,
  runAutoTraderCycle,
  manualCloseAutoTraderPosition
} = require('../services/autoTraderService');

const router = express.Router();

const SETUP_STEP_KEYS = Object.freeze([
  'accountCreated',
  'settingsSaved',
  'brokerageReady',
  'brokerConnected',
  'botStartedOnce'
]);

const BOT_CONTROL_STATE = new Map();

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

function requireSignedIn(req, res, next) {
  return requireApiAuthStrictSession(req, res, () => {
    const authUser = getUserByEmailForAuth(req.user?.email || '');
    if (!authUser?.email_verified) {
      return res.status(403).json({
        error: 'email_not_verified',
        message: 'Please verify your email before starting the bot or placing trades.'
      });
    }
    return next();
  });
}

function toNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundUsd(value) {
  return Number(Number(value || 0).toFixed(2));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toTradeAlertPayload(trade, side) {
  const entry = toNumber(trade?.entryPrice ?? trade?.entry, 0);
  const exit = toNumber(trade?.exitPrice ?? trade?.markPrice ?? trade?.exit ?? entry, entry);
  const shares = Math.max(1, toNumber(trade?.shares, 1));
  const pnlUsd = toNumber(trade?.pnlUsd, 0);
  const notionalUsd = toNumber(trade?.notionalUsd, entry * shares);
  const denominator = Math.max(0.01, entry * shares);
  const pnlPct = (pnlUsd / denominator) * 100;
  return {
    ticker: String(trade?.ticker || trade?.symbol || '').trim(),
    entry,
    exit,
    shares,
    notionalUsd,
    stopLoss: toNumber(trade?.stopLoss, 0),
    takeProfit: toNumber(trade?.takeProfit, 0),
    signalScore: toNumber(trade?.confidenceScore ?? trade?.websiteSignalScore, 0),
    pnlUsd,
    pnlPct,
    holdTime: '-',
    reason: String(trade?.result || trade?.reason || 'Signal').trim() || 'Signal',
    direction: side === 'sell' ? 'sell' : 'buy'
  };
}

async function sendCycleTradeAlerts(req, cycle) {
  const userForAlert = getUserByEmailForAuth(req.user?.email || '');
  if (!userForAlert?.id || !userForAlert?.email) {
    return;
  }
  const closedRows = Array.isArray(cycle?.closedPositions) ? cycle.closedPositions : [];
  for (const closedTrade of closedRows) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendTradeAlertEmail(userForAlert, toTradeAlertPayload(closedTrade, 'sell'), 'sell');
      if (String(closedTrade?.result || '').trim().toLowerCase() === 'stop_loss') {
        // eslint-disable-next-line no-await-in-loop
        await sendStopLossAlertEmail(userForAlert, toTradeAlertPayload(closedTrade, 'sell'));
      }
    } catch (_error) {
      // Best-effort per-trade alert.
    }
  }
}

async function sendDailyLossAlertIfNeeded(req, errorCode) {
  if (String(errorCode || '').trim() !== 'daily_loss_limit_reached') {
    return;
  }
  const userForAlert = getUserByEmailForAuth(req.user?.email || '');
  if (!userForAlert?.id || !userForAlert?.email) {
    return;
  }
  const { accountView, status } = loadStatusAndAccount(req);
  const equityUsd = Math.max(1, Number(accountView?.portfolio?.equityUsd || status?.cashUsd || 0));
  const dailyLossLimitUsd = Number(accountView?.riskSettings?.dailyLossLimitUsd || ((status?.config?.maxDailyLossPct || 3) / 100) * equityUsd);
  const closedTrades = Array.isArray(accountView?.tradeHistory?.closed) ? accountView.tradeHistory.closed : [];
  const nowParts = parseEasternParts(new Date());
  const dayKey = toDateStamp(nowParts);
  const dailyLossUsd = Math.abs(closedTrades
    .filter((trade) => {
      const stampSource = trade?.closedAt || trade?.openedAt;
      const parsed = new Date(String(stampSource || ''));
      if (Number.isNaN(parsed.getTime())) {
        return false;
      }
      return toDateStamp(parseEasternParts(parsed)) === dayKey;
    })
    .reduce((sum, trade) => sum + Math.min(0, Number(trade?.pnlUsd || 0)), 0));
  await sendDailyLossAlertEmail(userForAlert, {
    dailyLossUsd,
    dailyLossLimitUsd
  });
}

function parseEasternParts(value = new Date()) {
  const source = value instanceof Date ? value : new Date(value);
  const parts = ET_TIME_FORMATTER.formatToParts(source);
  const bag = {};
  parts.forEach((part) => {
    bag[part.type] = part.value;
  });
  const weekdayMap = {
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
    weekday: weekdayMap[bag.weekday] ?? 0
  };
}

function toDateStamp(parts) {
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0')
  ].join('-');
}

function etComparable(parts) {
  return (
    (parts.year * 10_000_000_000)
    + (parts.month * 100_000_000)
    + (parts.day * 1_000_000)
    + (parts.hour * 10_000)
    + (parts.minute * 100)
    + parts.second
  );
}

function makeEtParts(parts, addDays = 0, hour = 0, minute = 0, second = 0) {
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + addDays, 0, 0, 0));
  const next = parseEasternParts(utcDate);
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

function formatDurationHhMm(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds || 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function computeMarketStatusSnapshot() {
  const nowEt = parseEasternParts(new Date());
  const todayStamp = toDateStamp(nowEt);
  const isWeekend = nowEt.weekday === 0 || nowEt.weekday === 6;
  const isHoliday = NYSE_HOLIDAYS_2026.has(todayStamp);
  const openEt = { ...nowEt, hour: 9, minute: 30, second: 0 };
  const closeEt = { ...nowEt, hour: 16, minute: 0, second: 0 };
  const nowValue = etComparable(nowEt);
  const openValue = etComparable(openEt);
  const closeValue = etComparable(closeEt);
  let state = 'CLOSED';
  let detail = 'CLOSED';
  let secondsUntilOpen = null;
  let secondsUntilClose = null;

  if (isWeekend) {
    detail = 'CLOSED — Weekend';
  } else if (isHoliday) {
    detail = 'CLOSED — Holiday';
  } else if (nowValue >= openValue && nowValue < closeValue) {
    state = 'OPEN';
    secondsUntilClose = secondsBetweenEt(nowEt, closeEt);
    detail = `OPEN • Closes in ${formatDurationHhMm(secondsUntilClose)}`;
  } else if (nowValue < openValue) {
    secondsUntilOpen = secondsBetweenEt(nowEt, openEt);
    detail = `CLOSED • Opens in ${formatDurationHhMm(secondsUntilOpen)}`;
  } else {
    let offset = 1;
    while (offset <= 7) {
      const candidate = makeEtParts(nowEt, offset, 9, 30, 0);
      const isCandidateWeekend = candidate.weekday === 0 || candidate.weekday === 6;
      const isCandidateHoliday = NYSE_HOLIDAYS_2026.has(toDateStamp(candidate));
      if (!isCandidateWeekend && !isCandidateHoliday) {
        secondsUntilOpen = secondsBetweenEt(nowEt, candidate);
        break;
      }
      offset += 1;
    }
    detail = `CLOSED • Opens in ${formatDurationHhMm(secondsUntilOpen || 0)}`;
  }

  return {
    state,
    detail,
    secondsUntilOpen,
    secondsUntilClose,
    observedAt: new Date().toISOString()
  };
}

function getPersistedSetup(user) {
  const rawSteps = user?.aiTraderSetup?.steps || {};
  return SETUP_STEP_KEYS.reduce((acc, key) => {
    acc[key] = Boolean(rawSteps[key]);
    return acc;
  }, {});
}

function persistSetup(req, patch = {}) {
  const userId = req.user?.id;
  if (!userId) {
    return null;
  }
  const current = getPersistedSetup(req.user);
  const mergedSteps = {
    ...current,
    accountCreated: true,
    ...Object.entries(patch).reduce((acc, [key, value]) => {
      if (SETUP_STEP_KEYS.includes(key)) {
        acc[key] = Boolean(value);
      }
      return acc;
    }, {})
  };
  const completed = SETUP_STEP_KEYS.every((key) => mergedSteps[key]);
  const updated = setUserAiTraderSetupById(userId, {
    steps: mergedSteps,
    completed,
    completedAt: completed ? new Date().toISOString() : null
  });
  if (updated?.aiTraderSetup) {
    req.user.aiTraderSetup = updated.aiTraderSetup;
  }
  return updated?.aiTraderSetup || null;
}

function deriveSetupGuide(req, status) {
  const persisted = getPersistedSetup(req.user);
  const hasCycle = Boolean(
    status?.lastCycle
    || (Array.isArray(status?.cycleHistory) && status.cycleHistory.length > 0)
  );
  const brokerConnected = Boolean(status?.execution?.brokerConnection?.isConnected) || persisted.brokerConnected;
  const settingsSaved = Boolean(persisted.settingsSaved);
  const botStartedOnce = Boolean(status?.isActive || hasCycle || persisted.botStartedOnce);
  const steps = {
    accountCreated: true,
    settingsSaved,
    brokerageReady: brokerConnected || persisted.brokerageReady,
    brokerConnected,
    botStartedOnce
  };
  const completedCount = SETUP_STEP_KEYS.filter((key) => steps[key]).length;
  const currentStepIndex = SETUP_STEP_KEYS.findIndex((key) => !steps[key]);
  return {
    steps,
    completedCount,
    totalSteps: SETUP_STEP_KEYS.length,
    completed: completedCount === SETUP_STEP_KEYS.length,
    currentStepIndex: currentStepIndex < 0 ? SETUP_STEP_KEYS.length - 1 : currentStepIndex
  };
}

function getControlState(req, status) {
  const userId = String(req.user?.id || '').trim();
  const mapped = BOT_CONTROL_STATE.get(userId);
  if (mapped === 'paused' || mapped === 'stopped' || mapped === 'running') {
    return mapped;
  }
  return status?.isActive ? 'running' : 'stopped';
}

function setControlState(req, state) {
  const userId = String(req.user?.id || '').trim();
  if (!userId) {
    return;
  }
  BOT_CONTROL_STATE.set(userId, state);
}

function isTodayInEt(isoValue) {
  if (!isoValue) {
    return false;
  }
  const date = new Date(String(isoValue));
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const dateParts = parseEasternParts(date);
  const nowParts = parseEasternParts(new Date());
  return (
    dateParts.year === nowParts.year
    && dateParts.month === nowParts.month
    && dateParts.day === nowParts.day
  );
}

function mapRiskProfile(profile) {
  const value = String(profile || '').trim().toLowerCase();
  if (value === 'conservative') {
    return {
      riskPerTradePct: 0.8,
      maxRiskPerTradePct: 0.8,
      maxTradesPerDay: 6
    };
  }
  if (value === 'aggressive') {
    return {
      riskPerTradePct: 2,
      maxRiskPerTradePct: 2,
      maxTradesPerDay: 12
    };
  }
  return {
    riskPerTradePct: 1.2,
    maxRiskPerTradePct: 1.2,
    maxTradesPerDay: 8
  };
}

function mapUniverseToSectors(universe, fallback) {
  const value = String(universe || '').trim().toLowerCase();
  if (value === 'nasdaq100') {
    return ['Technology', 'Semiconductors', 'Communication Services', 'Consumer Discretionary'];
  }
  if (value === 'sp500') {
    return ['Technology', 'Semiconductors', 'Financials', 'Healthcare', 'Industrials', 'Communication Services'];
  }
  if (Array.isArray(fallback) && fallback.length > 0) {
    return fallback;
  }
  return ['Technology', 'Healthcare', 'Financials'];
}

function getAccountBase(status, accountView, body = {}) {
  const direct = toNum(body.account_value || body.accountValue, 0);
  if (direct >= 100) {
    return direct;
  }
  const equity = toNum(accountView?.portfolio?.equityUsd, 0);
  if (equity >= 100) {
    return equity;
  }
  const cash = toNum(status?.cashUsd, 0);
  if (cash >= 100) {
    return cash;
  }
  const deposited = toNum(status?.totalDepositedUsd, 0);
  if (deposited >= 100) {
    return deposited;
  }
  return 10_000;
}

function buildSettingsConfigInput(status, accountView, body = {}) {
  const existing = status?.config || {};
  const profile = mapRiskProfile(body.risk_level || body.riskLevel || body.risk_profile);
  const accountBase = Math.max(100, getAccountBase(status, accountView, body));
  const stopLossPct = clamp(
    toNum(body.stop_loss_pct ?? body.stopLossPct, toNum(existing.stopLossPct, 2.5)),
    0.5,
    20
  );
  const takeProfitPct = clamp(
    toNum(body.take_profit_pct ?? body.takeProfitPct, toNum(existing.takeProfitPct, 5.5)),
    0.5,
    50
  );
  const maxOpenPositions = Math.trunc(clamp(
    toNum(body.max_open_positions ?? body.maxOpenPositions, toNum(existing.maxPositions, 4)),
    1,
    12
  ));
  const maxPositionSizeUsd = Math.max(100, toNum(
    body.max_position_size ?? body.maxPositionSize ?? body.position_size_usd,
    roundUsd((toNum(existing.allocationPerTradePct, 20) / 100) * accountBase)
  ));
  const allocationPerTradePct = clamp((maxPositionSizeUsd / accountBase) * 100, 2, 80);
  const dailyMaxLossUsd = Math.max(50, toNum(
    body.daily_max_loss ?? body.dailyMaxLoss,
    roundUsd((toNum(existing.maxDailyLossPct, 3) / 100) * accountBase)
  ));
  const maxDailyLossPct = clamp((dailyMaxLossUsd / accountBase) * 100, 0.5, 25);
  const sectors = mapUniverseToSectors(body.stock_universe || body.stockUniverse, existing.sectors);
  const tradingModeRaw = String(body.trading_mode || status?.tradingMode || 'paper').trim().toLowerCase();
  const tradingMode = tradingModeRaw === 'live' ? 'live' : 'paper';
  const liveToggleProvided = Object.prototype.hasOwnProperty.call(body, 'auto_execute_live')
    || Object.prototype.hasOwnProperty.call(body, 'hands_free_live_execution');

  return {
    prompt: String(existing.prompt || 'Momentum setups with disciplined risk.'),
    capitalUsd: Math.max(100, Math.round(accountBase)),
    tradingMode,
    timeframe: String(existing.timeframe || 'intraday'),
    chasePct: toNum(existing.chasePct, 0.8),
    riskPerTradePct: profile.riskPerTradePct,
    maxRiskPerTradePct: profile.maxRiskPerTradePct,
    maxDailyLossPct,
    maxTradesPerDay: profile.maxTradesPerDay,
    minRewardRiskRatio: toNum(existing.minRewardRiskRatio, 1.8),
    autoExecuteLive: liveToggleProvided
      ? Boolean(body.auto_execute_live || body.hands_free_live_execution)
      : Boolean(existing.autoExecuteLive),
    targetReturnPct: toNum(existing.targetReturnPct, 12),
    allocationPerTradePct,
    maxSectorExposurePct: toNum(existing.maxSectorExposurePct, 35),
    maxGrossExposurePct: toNum(existing.maxGrossExposurePct, 100),
    maxPositions: maxOpenPositions,
    stopLossPct,
    takeProfitPct,
    sectors
  };
}

function buildStatusPayload(req, status, accountView) {
  const localMarketStatus = computeMarketStatusSnapshot();
  const controlState = getControlState(req, status);
  const statusWord = controlState === 'paused'
    ? 'PAUSED'
    : controlState === 'stopped'
      ? 'STOPPED'
      : 'RUNNING';
  const openPositions = Array.isArray(accountView?.openPositions) ? accountView.openPositions : [];
  const maxOpenPositions = Math.max(1, Number(status?.config?.maxPositions || 1));
  const closedTrades = Array.isArray(accountView?.tradeHistory?.closed) ? accountView.tradeHistory.closed : [];
  const pnlToday = roundUsd(
    closedTrades
      .filter((row) => isTodayInEt(row?.closedAt || row?.openedAt))
      .reduce((sum, row) => sum + toNum(row?.pnlUsd, 0), 0)
  );
  const tradesToday = Number(accountView?.riskSettings?.tradesOpenedToday || 0);
  const winRateToday = Number(accountView?.tradeHistory?.summary?.winRatePct || accountView?.stats?.winRatePct || 0);
  const setupGuide = deriveSetupGuide(req, status);
  const nextScanInSeconds = status?.isActive
    ? Math.max(1, Math.round(Number(status?.execution?.autopilot?.intervalMs || 30_000) / 1000))
    : null;
  const persistedSetup = getPersistedSetup(req.user);

  return {
    status: statusWord,
    controlState,
    configured: Boolean(status?.configured),
    isActive: Boolean(status?.isActive),
    brokerConnected: Boolean(status?.execution?.brokerConnection?.isConnected),
    market: localMarketStatus,
    marketStatus: localMarketStatus,
    stats: {
      tradesToday,
      winRateToday,
      pnlToday,
      openPositions: openPositions.length,
      maxOpenPositions,
      nextScanInSeconds
    },
    setup: {
      ...setupGuide,
      persisted: persistedSetup
    },
    bot: status,
    updatedAt: status?.updatedAt || new Date().toISOString()
  };
}

router.get('/market-status', requireSignedIn, (_req, res) => {
  const marketSnapshot = computeMarketStatusSnapshot();
  return res.json({
    market: marketSnapshot,
    holidays: [...NYSE_HOLIDAYS_2026]
  });
});

function mapServiceError(error, fallbackMessage = 'Could not complete this action.') {
  const code = String(error?.message || '').trim();
  if (code === 'bot_not_configured') {
    return {
      status: 400,
      error: 'settings_required',
      message: 'Save your bot settings first.'
    };
  }
  if (code === 'live_funding_required') {
    return {
      status: 400,
      error: 'live_funding_required',
      message: 'Your live account is not funded yet.'
    };
  }
  if (code === 'insufficient_cash') {
    return {
      status: 400,
      error: 'insufficient_cash',
      message: 'Your available buying power is too low to run a scan cycle.'
    };
  }
  if (code === 'daily_loss_limit_reached') {
    return {
      status: 400,
      error: 'daily_loss_limit_reached',
      message: 'Trading is halted because your daily max loss limit was reached.'
    };
  }
  if (code === 'max_trades_per_day_reached') {
    return {
      status: 400,
      error: 'max_trades_per_day_reached',
      message: 'Trading is paused for today because max trades per day was reached.'
    };
  }
  return {
    status: 400,
    error: code || 'invalid_request',
    message: fallbackMessage
  };
}

function normalizeActivityType(row) {
  const value = String(row || '').trim().toLowerCase();
  if (value.includes('buy')) {
    return 'BUY';
  }
  if (value.includes('sell')) {
    return 'SELL';
  }
  if (value.includes('take_profit')) {
    return 'TAKE PROFIT';
  }
  if (value.includes('stop_loss')) {
    return 'STOP LOSS';
  }
  return 'SCAN';
}

function buildActivityFeed(status, accountView) {
  const rows = [];
  const brokerOrders = Array.isArray(status?.execution?.recentBrokerOrders)
    ? status.execution.recentBrokerOrders
    : [];
  const closedTrades = Array.isArray(accountView?.tradeHistory?.closed)
    ? accountView.tradeHistory.closed
    : [];
  const planned = Array.isArray(status?.lastCycle?.plannedTrades)
    ? status.lastCycle.plannedTrades
    : [];

  brokerOrders.slice(0, 20).forEach((order, index) => {
    const side = String(order?.orderPayload?.side || '').toUpperCase();
    const ticker = String(order?.orderPayload?.symbol || order?.ticker || '').trim() || 'N/A';
    const type = side.includes('SELL') ? 'SELL' : 'BUY';
    const actionWord = type === 'BUY' ? 'Bought' : 'Sold';
    const shares = Number(order?.orderPayload?.quantity || 0);
    const price = Number(order?.orderPayload?.limitPrice || order?.orderPayload?.markPrice || 0);
    rows.push({
      id: `ord-${index}-${String(order?.submittedAt || '')}`,
      type,
      ticker,
      timestamp: order?.submittedAt || new Date().toISOString(),
      description: `${actionWord} ${shares > 0 ? shares : ''} shares of ${ticker} at $${roundUsd(price).toFixed(2)}`.replace(/\s+/g, ' ').trim(),
      pnlUsd: null
    });
  });

  closedTrades.slice(0, 20).forEach((trade, index) => {
    const ticker = String(trade?.ticker || '').trim() || 'N/A';
    const pnlUsd = roundUsd(Number(trade?.pnlUsd || 0));
    const type = normalizeActivityType(trade?.result || '');
    const closePrice = roundUsd(Number(trade?.closePrice || trade?.markPrice || 0));
    rows.push({
      id: `cls-${index}-${String(trade?.closedAt || '')}`,
      type,
      ticker,
      timestamp: trade?.closedAt || trade?.openedAt || new Date().toISOString(),
      description: `${type === 'TAKE PROFIT' ? 'Take profit hit' : type === 'STOP LOSS' ? 'Stop loss hit' : 'Closed'} on ${ticker} at $${closePrice.toFixed(2)}`,
      pnlUsd
    });
  });

  planned.slice(0, 20).forEach((trade, index) => {
    const ticker = String(trade?.ticker || '').trim() || 'N/A';
    const score = Number(trade?.promptAlignment?.score || trade?.websiteSignalScore || 0);
    rows.push({
      id: `scn-${index}-${String(trade?.createdAt || '')}`,
      type: 'SCAN',
      ticker,
      timestamp: trade?.createdAt || status?.lastCycle?.executedAt || new Date().toISOString(),
      description: `Scanned ${ticker} — Score: ${score >= 0 ? '+' : ''}${Math.round(score)}`,
      pnlUsd: null
    });
  });

  rows.sort((a, b) => new Date(String(b.timestamp || 0)).getTime() - new Date(String(a.timestamp || 0)).getTime());
  return rows.slice(0, 40);
}

function scoreAction(score) {
  if (score >= 55) {
    return 'BUY';
  }
  if (score >= 20) {
    return 'WATCH';
  }
  if (score <= -35) {
    return 'SELL';
  }
  return 'SKIP';
}

function scoreTone(value) {
  if (value >= 60) {
    return 'green';
  }
  if (value <= 40) {
    return 'red';
  }
  return 'grey';
}

function buildScannerRows(status) {
  const snapshot = status?.execution?.lastWebsiteSignalSnapshot || {};
  const rankedSymbols = Array.isArray(snapshot.rankedSymbols) ? snapshot.rankedSymbols : [];
  const trendBySymbol = snapshot?.trendBySymbol && typeof snapshot.trendBySymbol === 'object'
    ? snapshot.trendBySymbol
    : {};
  const proposals = Array.isArray(status?.execution?.tradeIdeas) ? status.execution.tradeIdeas : [];
  return rankedSymbols.slice(0, 30).map((symbol) => {
    const trendSignal = trendBySymbol[symbol] || {};
    const proposal = proposals.find((row) => String(row?.symbol || row?.ticker || '').toUpperCase() === String(symbol).toUpperCase());
    const trendScore = clamp(toNum(trendSignal?.trendScore, 0), -100, 100);
    const confidence = clamp(toNum(proposal?.confidenceScore, 50), 0, 100);
    const score = Math.round(clamp((trendScore * 0.7) + ((confidence - 50) * 0.8), -100, 100));
    const base = clamp(50 + (trendScore / 2), 0, 100);
    const rsi = clamp(base + ((confidence - 50) * 0.22), 0, 100);
    const macd = clamp(base + ((confidence - 50) * 0.28), 0, 100);
    const volume = clamp(base + ((confidence - 50) * 0.18), 0, 100);
    const bb = clamp(base - ((confidence - 50) * 0.12), 0, 100);
    const ema = clamp(base + ((confidence - 50) * 0.15), 0, 100);
    return {
      ticker: symbol,
      company: String(proposal?.companyName || proposal?.company || `${symbol} Holdings`),
      score,
      action: scoreAction(score),
      signals: {
        RSI: { value: rsi, tone: scoreTone(rsi) },
        MACD: { value: macd, tone: scoreTone(macd) },
        VOL: { value: volume, tone: scoreTone(volume) },
        BB: { value: bb, tone: scoreTone(bb) },
        EMA: { value: ema, tone: scoreTone(ema) }
      }
    };
  });
}

function aggregateDailyBars(trades) {
  const map = new Map();
  trades.forEach((trade) => {
    const at = trade?.closedAt || trade?.openedAt;
    const parsed = new Date(String(at || ''));
    if (Number.isNaN(parsed.getTime())) {
      return;
    }
    const key = parsed.toISOString().slice(0, 10);
    map.set(key, toNum(map.get(key), 0) + toNum(trade?.pnlUsd, 0));
  });
  return Array.from(map.entries())
    .map(([day, pnl]) => ({ day, pnl: roundUsd(pnl) }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-30);
}

function withinLastDays(isoValue, days) {
  const at = new Date(String(isoValue || ''));
  if (Number.isNaN(at.getTime())) {
    return false;
  }
  return (Date.now() - at.getTime()) <= (days * 86400000);
}

function summarizeTrades(trades) {
  const totalPnl = roundUsd(trades.reduce((sum, trade) => sum + toNum(trade?.pnlUsd, 0), 0));
  const tradeCount = trades.length;
  const wins = trades.filter((trade) => toNum(trade?.pnlUsd, 0) > 0).length;
  const losses = trades.filter((trade) => toNum(trade?.pnlUsd, 0) < 0).length;
  const winRate = tradeCount > 0 ? Number(((wins / tradeCount) * 100).toFixed(1)) : 0;
  const best = trades.slice().sort((a, b) => toNum(b?.pnlUsd, 0) - toNum(a?.pnlUsd, 0))[0] || null;
  const worst = trades.slice().sort((a, b) => toNum(a?.pnlUsd, 0) - toNum(b?.pnlUsd, 0))[0] || null;
  const avgHoldMinutes = tradeCount > 0
    ? Math.round(trades.reduce((sum, trade) => {
      const opened = new Date(String(trade?.openedAt || ''));
      const closed = new Date(String(trade?.closedAt || trade?.openedAt || ''));
      if (Number.isNaN(opened.getTime()) || Number.isNaN(closed.getTime())) {
        return sum;
      }
      return sum + Math.max(0, Math.round((closed.getTime() - opened.getTime()) / 60000));
    }, 0) / tradeCount)
    : 0;
  return {
    totalPnl,
    tradeCount,
    wins,
    losses,
    winRate,
    bestTrade: best
      ? { ticker: best.ticker || 'N/A', pnlUsd: roundUsd(toNum(best.pnlUsd, 0)) }
      : null,
    worstTrade: worst
      ? { ticker: worst.ticker || 'N/A', pnlUsd: roundUsd(toNum(worst.pnlUsd, 0)) }
      : null,
    avgHoldMinutes
  };
}

function loadStatusAndAccount(req) {
  const status = getAutoTraderStatus(req.user);
  const accountView = getAutoTraderAccountView(req.user);
  return { status, accountView };
}

router.post('/start', requireSignedIn, (req, res) => {
  try {
    const { status } = loadStatusAndAccount(req);
    const setupSteps = getPersistedSetup(req.user);
    if (!status?.configured || !setupSteps.settingsSaved) {
      return res.status(400).json({
        error: 'settings_required',
        message: 'Save your bot settings first.'
      });
    }
    const connection = status?.execution?.brokerConnection || {};
    const auth = connection?.auth || {};
    const hasCredentials = Boolean(
      (auth.secretSaved && auth.apiKeyLast4)
      || auth.loginSaved
    );
    if (!connection?.isConnected || !hasCredentials) {
      return res.status(400).json({
        error: 'broker_not_connected',
        message: 'Connect a broker first and run a successful connection test.'
      });
    }
    setBotActive(req.user, true);
    setControlState(req, 'running');
    persistSetup(req, {
      settingsSaved: true,
      brokerageReady: true,
      brokerConnected: true,
      botStartedOnce: true
    });
    try {
      const cycle = runAutoTraderCycle(req.user);
      Promise.resolve(sendCycleTradeAlerts(req, cycle)).catch(() => {});
    } catch (cycleError) {
      Promise.resolve(sendDailyLossAlertIfNeeded(req, cycleError?.message || '')).catch(() => {});
      // Non-fatal for start; status remains RUNNING.
    }
    const refreshed = loadStatusAndAccount(req);
    return res.json({
      ok: true,
      message: 'Bot started and scanning is active.',
      ...buildStatusPayload(req, refreshed.status, refreshed.accountView)
    });
  } catch (error) {
    const mapped = mapServiceError(error, 'Could not start the bot.');
    return res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message
    });
  }
});

router.post('/pause', requireSignedIn, (req, res) => {
  try {
    setBotActive(req.user, false);
    setControlState(req, 'paused');
    const refreshed = loadStatusAndAccount(req);
    return res.json({
      ok: true,
      message: 'Bot paused. It will not open new positions.',
      ...buildStatusPayload(req, refreshed.status, refreshed.accountView)
    });
  } catch (error) {
    const mapped = mapServiceError(error, 'Could not pause the bot.');
    return res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message
    });
  }
});

router.post('/stop', requireSignedIn, (req, res) => {
  try {
    setBotActive(req.user, false);
    stopAutoTraderAutopilot(req.user?.id);
    setControlState(req, 'stopped');
    const refreshed = loadStatusAndAccount(req);
    return res.json({
      ok: true,
      message: 'Bot stopped. Scanning has fully halted.',
      ...buildStatusPayload(req, refreshed.status, refreshed.accountView)
    });
  } catch (error) {
    const mapped = mapServiceError(error, 'Could not stop the bot.');
    return res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message
    });
  }
});

function saveSettingsInternal(req) {
  const before = getAutoTraderStatus(req.user);
  const accountView = getAutoTraderAccountView(req.user);
  const payload = buildSettingsConfigInput(before, accountView, req.body || {});
  configureAutoTrader(req.user, payload);
  if (!before.isActive) {
    setBotActive(req.user, false);
    setControlState(req, getControlState(req, before));
  }
  const refreshed = loadStatusAndAccount(req);
  const brokerConnected = Boolean(refreshed.status?.execution?.brokerConnection?.isConnected);
  persistSetup(req, {
    settingsSaved: true,
    brokerageReady: brokerConnected,
    brokerConnected
  });
  return refreshed;
}

router.post('/settings', requireSignedIn, (req, res) => {
  try {
    const refreshed = saveSettingsInternal(req);
    return res.json({
      ok: true,
      saved: true,
      message: 'Settings saved successfully.',
      ...buildStatusPayload(req, refreshed.status, refreshed.accountView)
    });
  } catch (error) {
    const mapped = mapServiceError(error, 'Failed to save bot settings.');
    return res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message
    });
  }
});

router.post('/update-settings', requireSignedIn, (req, res) => {
  try {
    const refreshed = saveSettingsInternal(req);
    return res.json({
      ok: true,
      updated: true,
      message: 'Running bot settings were updated.',
      ...buildStatusPayload(req, refreshed.status, refreshed.accountView)
    });
  } catch (error) {
    const mapped = mapServiceError(error, 'Failed to update running bot settings.');
    return res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message
    });
  }
});

router.get('/status', requireSignedIn, (req, res) => {
  try {
    const { status, accountView } = loadStatusAndAccount(req);
    return res.json(buildStatusPayload(req, status, accountView));
  } catch (_error) {
    return res.status(500).json({
      error: 'status_unavailable',
      message: 'Could not load bot status right now. Please retry.'
    });
  }
});

router.get('/positions', requireSignedIn, (req, res) => {
  try {
    const { status, accountView } = loadStatusAndAccount(req);
    const positions = Array.isArray(accountView?.openPositions) ? accountView.openPositions : [];
    const maxOpenPositions = Math.max(1, Number(status?.config?.maxPositions || 1));
    const mapped = positions.map((position) => {
      const entry = roundUsd(toNum(position?.entry, 0));
      const mark = roundUsd(toNum(position?.markPrice ?? position?.entry, entry));
      const pnlUsd = roundUsd(toNum(position?.unrealizedPnlUsd, 0));
      const pnlPct = entry > 0 ? roundUsd(((mark - entry) / entry) * 100) : 0;
      const openedAtRaw = String(position?.openedAt || '');
      const openedAtMs = Date.parse(openedAtRaw);
      const heldSeconds = Number.isFinite(openedAtMs)
        ? Math.max(0, Math.round((Date.now() - openedAtMs) / 1000))
        : 0;
      return {
        id: position?.id,
        ticker: position?.ticker || 'N/A',
        companyName: position?.companyName || `${position?.ticker || 'Ticker'} Holdings`,
        currentPrice: mark,
        entryPrice: entry,
        pnlUsd,
        pnlPct,
        stopLoss: roundUsd(toNum(position?.stopLoss, 0)),
        takeProfit: roundUsd(toNum(position?.takeProfit, 0)),
        shares: Number(position?.shares || 0),
        heldSeconds,
        openedAt: position?.openedAt || null
      };
    });
    return res.json({
      positions: mapped,
      openPositionsCount: mapped.length,
      maxOpenPositions
    });
  } catch (_error) {
    return res.status(500).json({
      error: 'positions_unavailable',
      message: 'Could not load open positions right now. Please retry.'
    });
  }
});

router.post('/positions/:id/close', requireSignedIn, (req, res) => {
  try {
    if (!req.user?.emailVerified) {
      return res.status(403).json({
        error: 'email_not_verified',
        message: 'Please verify your email before managing live positions.'
      });
    }
    const positionId = String(req.params?.id || '').trim();
    if (!positionId) {
      return res.status(400).json({
        error: 'invalid_position_id',
        message: 'Position ID is required.'
      });
    }
    const payload = manualCloseAutoTraderPosition(req.user, {
      positionId
    });
    try {
      if (payload?.closed) {
        const direction = String(payload.closed?.direction || '').toLowerCase();
        const userForAlert = getUserByEmailForAuth(req.user?.email || '');
        if (userForAlert) {
          sendTradeAlertEmail(userForAlert, {
            ticker: payload.closed.ticker,
            entry: payload.closed.entry,
            exit: payload.closed.markPrice,
            pnlUsd: payload.closed.pnlUsd,
            pnlPct: payload.closed.entry > 0
              ? ((Number(payload.closed.pnlUsd || 0) / (Number(payload.closed.entry || 1) * Math.max(1, Number(payload.closed.shares || 1)))) * 100)
              : 0,
            holdTime: '-',
            reason: payload.closed.result,
            direction
          }, 'sell');
        }
      }
    } catch (_alertError) {
      // Best-effort email alert.
    }
    return res.json({
      ok: true,
      ...payload
    });
  } catch (error) {
    const code = String(error?.message || '');
    if (code === 'position_not_found') {
      return res.status(404).json({
        error: 'position_not_found',
        message: 'Open position not found.'
      });
    }
    return res.status(400).json({
      error: 'close_failed',
      message: 'Could not close this position.'
    });
  }
});

router.get('/activity', requireSignedIn, (req, res) => {
  try {
    const { status, accountView } = loadStatusAndAccount(req);
    return res.json({
      activity: buildActivityFeed(status, accountView)
    });
  } catch (_error) {
    return res.status(500).json({
      error: 'activity_unavailable',
      message: 'Could not load activity feed right now. Please retry.'
    });
  }
});

router.get('/scanner', requireSignedIn, (req, res) => {
  try {
    const status = getAutoTraderStatus(req.user);
    const scannerRows = buildScannerRows(status);
    return res.json({
      isScanning: Boolean(status?.isActive),
      rows: scannerRows
    });
  } catch (_error) {
    return res.status(500).json({
      error: 'scanner_unavailable',
      message: 'Could not load scanner data right now. Please retry.'
    });
  }
});

router.get('/performance', requireSignedIn, (req, res) => {
  try {
    const accountView = getAutoTraderAccountView(req.user);
    const closed = Array.isArray(accountView?.tradeHistory?.closed)
      ? accountView.tradeHistory.closed
      : [];
    const today = closed.filter((trade) => isTodayInEt(trade?.closedAt || trade?.openedAt));
    const week = closed.filter((trade) => withinLastDays(trade?.closedAt || trade?.openedAt, 7));
    const month = closed.filter((trade) => withinLastDays(trade?.closedAt || trade?.openedAt, 31));
    const all = closed;
    return res.json({
      periods: {
        today: summarizeTrades(today),
        week: summarizeTrades(week),
        month: summarizeTrades(month),
        all: summarizeTrades(all)
      },
      chart: aggregateDailyBars(all)
    });
  } catch (_error) {
    return res.status(500).json({
      error: 'performance_unavailable',
      message: 'Could not load performance metrics right now. Please retry.'
    });
  }
});

module.exports = router;
