const {
  APP_URL,
  getAllUsersForReports,
  getUserEmailPreferences,
  wasEmailTypeSentSince
} = require('./authDbService');
const { getAutoTraderStatus, getAutoTraderAccountView } = require('./autoTraderService');
const {
  buildDailyEmail,
  buildWeeklyEmail,
  buildTradeAlertEmail,
  buildStopLossAlertEmail,
  buildDailyLossAlertEmail,
  sendTypedEmail
} = require('./reportEmailService');

const ET_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

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

let timer = null;
let running = false;

function appUrl(path = '/') {
  const base = String(APP_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const suffix = String(path || '/');
  const safePath = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}${safePath}`;
}

function nowEtParts(value = new Date()) {
  const parts = ET_FORMAT.formatToParts(value);
  const bag = {};
  parts.forEach((part) => {
    bag[part.type] = part.value;
  });
  return {
    weekday: bag.weekday,
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute)
  };
}

function etDateStamp(parts) {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function etDateStampFromIso(value) {
  const parsed = new Date(String(value || ''));
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return etDateStamp(nowEtParts(parsed));
}

function isMarketDay(parts) {
  const weekday = String(parts.weekday || '');
  if (weekday === 'Sat' || weekday === 'Sun') {
    return false;
  }
  return !NYSE_HOLIDAYS_2026.has(etDateStamp(parts));
}

function summarizeDailyFromAccountView(accountView = {}) {
  const closed = Array.isArray(accountView?.tradeHistory?.closed) ? accountView.tradeHistory.closed : [];
  const todayKey = etDateStamp(nowEtParts());
  const todayClosed = closed.filter((trade) => etDateStampFromIso(trade?.closedAt || trade?.openedAt) === todayKey);
  const totalPnlUsd = todayClosed.reduce((sum, trade) => sum + Number(trade?.pnlUsd || 0), 0);
  const totalTrades = todayClosed.length;
  const wins = todayClosed.filter((trade) => Number(trade?.pnlUsd || 0) > 0).length;
  const winRatePct = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const bestTradeUsd = todayClosed.reduce((max, trade) => Math.max(max, Number(trade?.pnlUsd || 0)), 0);
  return {
    date: new Date(),
    totalPnlUsd,
    totalPnlPct: Number(accountView?.portfolio?.equityUsd || 0) > 0
      ? (totalPnlUsd / Number(accountView.portfolio.equityUsd)) * 100
      : 0,
    totalTrades,
    winRatePct,
    bestTradeUsd,
    avgHoldTime: '-',
    trades: todayClosed.map((trade) => ({
      ticker: trade?.ticker || '',
      action: String(trade?.direction || '').toLowerCase() === 'short' ? 'SELL' : 'BUY',
      entry: Number(trade?.entryPrice || trade?.entry || 0),
      exit: Number(trade?.exitPrice || trade?.entry || 0),
      pnlUsd: Number(trade?.pnlUsd || 0),
      holdTime: '-',
      reason: String(trade?.result || 'Signal')
    })),
    scannedCount: Number(accountView?.execution?.sourceAuditDetails?.rankedSymbolsCount || 0),
    opportunities: Number(accountView?.execution?.tradeIdeas?.length || 0),
    topSignals: (accountView?.execution?.sourceAuditDetails?.rankedSymbolsPreview || []).slice(0, 3),
    accountValueUsd: Number(accountView?.portfolio?.equityUsd || 0),
    todayChangeUsd: totalPnlUsd,
    weekToDateUsd: Number(accountView?.portfolio?.realizedPnlUsd || 0),
    monthToDateUsd: Number(accountView?.portfolio?.realizedPnlUsd || 0)
  };
}

function summarizeWeeklyFromAccountView(accountView = {}) {
  const closed = Array.isArray(accountView?.tradeHistory?.closed) ? accountView.tradeHistory.closed : [];
  const now = Date.now();
  const weekly = closed
    .filter((trade) => {
      const closedAt = Date.parse(String(trade?.closedAt || trade?.openedAt || ''));
      return Number.isFinite(closedAt) && (now - closedAt) <= (7 * 24 * 60 * 60 * 1000);
    })
    .sort((a, b) => Date.parse(String(b?.closedAt || b?.openedAt || 0)) - Date.parse(String(a?.closedAt || a?.openedAt || 0)));
  const totalPnlUsd = weekly.reduce((sum, trade) => sum + Number(trade?.pnlUsd || 0), 0);
  const wins = weekly.filter((trade) => Number(trade?.pnlUsd || 0) > 0).length;
  const totalTrades = weekly.length;
  const daily = new Map();
  weekly.forEach((trade) => {
    const key = etDateStampFromIso(trade?.closedAt || trade?.openedAt);
    if (!key) {
      return;
    }
    daily.set(key, (daily.get(key) || 0) + Number(trade?.pnlUsd || 0));
  });
  const dailyBars = [...daily.entries()].map(([day, pnlUsd]) => ({ day, pnlUsd }));
  const bestDayUsd = dailyBars.reduce((max, row) => Math.max(max, Number(row.pnlUsd || 0)), 0);
  const worstDayUsd = dailyBars.reduce((min, row) => Math.min(min, Number(row.pnlUsd || 0)), 0);
  return {
    totalPnlUsd,
    totalTrades,
    winRatePct: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
    bestDayUsd,
    worstDayUsd,
    dailyBars: dailyBars.slice(0, 7),
    topWinners: weekly
      .filter((trade) => Number(trade?.pnlUsd || 0) > 0)
      .sort((a, b) => Number(b?.pnlUsd || 0) - Number(a?.pnlUsd || 0))
      .slice(0, 3)
      .map((trade) => `${trade?.ticker || ''} ${Number(trade?.pnlUsd || 0).toFixed(2)}`),
    topLosers: weekly
      .filter((trade) => Number(trade?.pnlUsd || 0) < 0)
      .sort((a, b) => Number(a?.pnlUsd || 0) - Number(b?.pnlUsd || 0))
      .slice(0, 3)
      .map((trade) => `${trade?.ticker || ''} ${Number(trade?.pnlUsd || 0).toFixed(2)}`),
    outlook: 'Watch upcoming earnings and macro calendar for your tracked symbols.',
    activeDays: Math.min(5, dailyBars.filter((row) => Math.abs(Number(row?.pnlUsd || 0)) > 0).length)
  };
}

function wasBotActiveToday(status, accountView = {}) {
  if (status?.isActive) {
    return true;
  }
  const today = etDateStamp(nowEtParts());
  const cycleHistory = Array.isArray(status?.cycleHistory) ? status.cycleHistory : [];
  if (cycleHistory.some((row) => etDateStampFromIso(row?.executedAt || row?.closedAt || row?.openedAt) === today)) {
    return true;
  }
  const closed = Array.isArray(accountView?.tradeHistory?.closed) ? accountView.tradeHistory.closed : [];
  return closed.some((row) => etDateStampFromIso(row?.closedAt || row?.openedAt) === today);
}

async function sendDailyReportForUser(user) {
  const preferences = getUserEmailPreferences(user.id);
  if (preferences.unsubscribed_all || !preferences.daily_report) {
    return { skipped: true, reason: 'preference_disabled' };
  }
  const accountView = getAutoTraderAccountView(user);
  const status = getAutoTraderStatus(user);
  const summary = summarizeDailyFromAccountView(accountView);
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  if (wasEmailTypeSentSince(user.id, 'daily_report', since.toISOString())) {
    return { skipped: true, reason: 'already_sent_today' };
  }
  if (!wasBotActiveToday(status, accountView)) {
    return { skipped: true, reason: 'bot_not_active_today' };
  }
  const email = buildDailyEmail({
    user,
    summary,
    paused: !status.isActive
  });
  const delivery = await sendTypedEmail({
    user,
    emailType: 'daily_report',
    subject: email.subject,
    html: email.html
  });
  return { skipped: false, delivery };
}

async function sendWeeklyReportForUser(user) {
  const preferences = getUserEmailPreferences(user.id);
  if (preferences.unsubscribed_all || !preferences.weekly_report) {
    return { skipped: true, reason: 'preference_disabled' };
  }
  const since = new Date();
  since.setDate(since.getDate() - 7);
  if (wasEmailTypeSentSince(user.id, 'weekly_report', since.toISOString())) {
    return { skipped: true, reason: 'already_sent_recently' };
  }
  const summary = summarizeWeeklyFromAccountView(getAutoTraderAccountView(user));
  const email = buildWeeklyEmail({ user, summary });
  const delivery = await sendTypedEmail({
    user,
    emailType: 'weekly_report',
    subject: email.subject,
    html: email.html
  });
  return { skipped: false, delivery };
}

async function sendTradeAlertEmail(user, trade, side) {
  const preferences = getUserEmailPreferences(user.id);
  if (preferences.unsubscribed_all) {
    return { skipped: true, reason: 'unsubscribed_all' };
  }
  if (side === 'buy' && !preferences.trade_alerts_buy) {
    return { skipped: true, reason: 'buy_alert_disabled' };
  }
  if (side === 'sell' && !preferences.trade_alerts_sell) {
    return { skipped: true, reason: 'sell_alert_disabled' };
  }
  const email = buildTradeAlertEmail({ user, trade, side });
  const delivery = await sendTypedEmail({
    user,
    emailType: side === 'buy' ? 'trade_alert_buy' : 'trade_alert_sell',
    subject: email.subject,
    html: email.html
  });
  return { skipped: false, delivery };
}

async function sendStopLossAlertEmail(user, trade = {}) {
  const preferences = getUserEmailPreferences(user.id);
  if (preferences.unsubscribed_all || !preferences.stop_loss_alerts) {
    return { skipped: true, reason: 'preference_disabled' };
  }
  const email = buildStopLossAlertEmail({ user, trade });
  const delivery = await sendTypedEmail({
    user,
    emailType: 'stop_loss_alert',
    subject: email.subject,
    html: email.html
  });
  return { skipped: false, delivery };
}

async function sendDailyLossAlertEmail(user, summary = {}) {
  const preferences = getUserEmailPreferences(user.id);
  if (preferences.unsubscribed_all || !preferences.daily_loss_alerts) {
    return { skipped: true, reason: 'preference_disabled' };
  }
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  if (wasEmailTypeSentSince(user.id, 'daily_loss_alert', since.toISOString())) {
    return { skipped: true, reason: 'already_sent_today' };
  }
  const email = buildDailyLossAlertEmail({ user, summary });
  const delivery = await sendTypedEmail({
    user,
    emailType: 'daily_loss_alert',
    subject: email.subject,
    html: email.html
  });
  return { skipped: false, delivery };
}

async function sendDailyReports() {
  const users = getAllUsersForReports();
  for (const user of users) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendDailyReportForUser(user);
    } catch (_error) {
      // Non-fatal per user.
    }
  }
}

async function sendDailyReportsForTime(targetTime = '16:30') {
  const users = getAllUsersForReports();
  for (const user of users) {
    try {
      const prefs = getUserEmailPreferences(user.id);
      const preferredTime = String(prefs.report_time || '16:30').trim() || '16:30';
      if (preferredTime !== targetTime) {
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await sendDailyReportForUser(user);
    } catch (_error) {
      // Non-fatal per user.
    }
  }
}

async function sendWeeklyReports() {
  const users = getAllUsersForReports();
  for (const user of users) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendWeeklyReportForUser(user);
    } catch (_error) {
      // Non-fatal per user.
    }
  }
}

async function checkBotStatusAlerts() {
  const users = getAllUsersForReports();
  for (const user of users) {
    try {
      const preferences = getUserEmailPreferences(user.id);
      if (preferences.unsubscribed_all || !preferences.bot_status_alerts) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const status = getAutoTraderStatus(user);
      const brokerConnected = Boolean(status?.execution?.brokerConnection?.isConnected);
      if (status?.tradingMode === 'live' && status?.isActive && !brokerConnected) {
        const subject = '⚠ Bot status alert — broker connection lost';
        const html = `
          <p>Your bot appears to be active in live mode, but broker connection is down.</p>
          <p><a href="${appUrl('/ai-bot-trader.html')}">Open AI Trader</a> to investigate.</p>
        `;
        // eslint-disable-next-line no-await-in-loop
        await sendTypedEmail({
          user,
          emailType: 'bot_status_alert',
          subject,
          html
        });
      }
    } catch (_error) {
      // Ignore per-user failures.
    }
  }
}

async function schedulerTick() {
  if (running) {
    return;
  }
  running = true;
  try {
    const parts = nowEtParts();
    const currentTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
    if (isMarketDay(parts) && ['16:00', '16:30', '17:00', '18:00'].includes(currentTime)) {
      await sendDailyReportsForTime(currentTime);
    }
    if (parts.weekday === 'Sun' && parts.hour === 18 && parts.minute === 0) {
      await sendWeeklyReports();
    }
    const duringMarketHours = isMarketDay(parts) && (
      (parts.hour > 9 || (parts.hour === 9 && parts.minute >= 30))
      && (parts.hour < 16 || (parts.hour === 16 && parts.minute === 0))
    );
    if (duringMarketHours && parts.minute % 5 === 0) {
      await checkBotStatusAlerts();
    }
  } catch (_error) {
    // Scheduler must never crash server loop.
  } finally {
    running = false;
  }
}

function startScheduler() {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    schedulerTick();
  }, 60 * 1000);
}

function stopScheduler() {
  if (!timer) {
    return;
  }
  clearInterval(timer);
  timer = null;
}

module.exports = {
  sendDailyReportForUser,
  sendWeeklyReportForUser,
  sendTradeAlertEmail,
  sendStopLossAlertEmail,
  sendDailyLossAlertEmail,
  sendDailyReports,
  sendDailyReportsForTime,
  sendWeeklyReports,
  checkBotStatusAlerts,
  startScheduler,
  stopScheduler
};
