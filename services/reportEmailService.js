const { APP_URL, appendUserEmailLog } = require('./authDbService');
const { sendEmail, htmlToText } = require('./emailProviderService');

function appUrl(path = '/') {
  const base = String(APP_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const suffix = String(path || '/').startsWith('/') ? String(path || '/') : `/${String(path || '')}`;
  return `${base}${suffix}`;
}

function unsubscribeLinks(userId, emailType) {
  const scoped = `/unsubscribe.html?scope=type&type=${encodeURIComponent(emailType)}&uid=${encodeURIComponent(userId)}`;
  const all = `/unsubscribe.html?scope=all&uid=${encodeURIComponent(userId)}`;
  return {
    scoped: appUrl(scoped),
    all: appUrl(all),
    manage: appUrl('/settings')
  };
}

function renderEmailShell({ title, subtitle, bodyHtml, footerHtml }) {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <style>
      body { background:#0b0f14; color:#e6edf3; font-family:Arial,sans-serif; margin:0; padding:24px; }
      .card { max-width:760px; margin:0 auto; background:#101821; border:1px solid #223143; border-radius:14px; overflow:hidden; }
      .header { padding:18px 20px; background:#131f2c; border-bottom:1px solid #223143; }
      .header h1 { margin:0; font-size:22px; color:#f0b90b; }
      .header p { margin:6px 0 0; color:#9fb0c3; font-size:13px; }
      .content { padding:18px 20px; }
      .footer { padding:14px 20px; border-top:1px solid #223143; color:#93a6ba; font-size:12px; }
      a { color:#f0b90b; text-decoration:none; }
      table { width:100%; border-collapse:collapse; }
      th, td { border-bottom:1px solid #1f2b39; padding:8px; text-align:left; font-size:13px; }
      .pill { display:inline-block; border-radius:999px; padding:4px 10px; font-size:12px; font-weight:700; }
      .pill-green { background:#0f5132; color:#b7f6cf; }
      .pill-red { background:#5e1f1f; color:#ffc7c7; }
      .hero { border-radius:12px; padding:14px; margin:12px 0; font-size:18px; font-weight:700; }
      .hero-green { background:#133a2a; color:#c9f8dd; }
      .hero-red { background:#4a1f24; color:#ffd5da; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <h1>DumbDollars</h1>
        <p>${subtitle}</p>
      </div>
      <div class="content">
        ${bodyHtml}
      </div>
      <div class="footer">
        ${footerHtml}
      </div>
    </div>
  </body>
</html>
  `.trim();
}

function formatUsd(value) {
  const amount = Number(value || 0);
  return `$${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedUsd(value) {
  const amount = Number(value || 0);
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${formatUsd(amount)}`;
}

function formatPct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function toDateLabel(value = new Date()) {
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

function renderTradeRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '<p>No trades were executed.</p>';
  }
  const body = rows.map((row) => {
    const pnl = Number(row?.pnlUsd || 0);
    const border = pnl >= 0 ? '#28a745' : '#ff4d4f';
    return `
      <tr style="border-left:4px solid ${border}">
        <td>${String(row?.ticker || '')}</td>
        <td>${String(row?.action || '')}</td>
        <td>${formatUsd(row?.entry || 0)}</td>
        <td>${formatUsd(row?.exit || 0)}</td>
        <td>${formatSignedUsd(pnl)}</td>
        <td>${String(row?.holdTime || '-')}</td>
        <td>${String(row?.reason || '-')}</td>
      </tr>
    `;
  }).join('');
  return `
    <table>
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Action</th>
          <th>Entry</th>
          <th>Exit</th>
          <th>P&L</th>
          <th>Hold Time</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function dailySubject(perf) {
  const pnl = Number(perf?.totalPnlUsd || 0);
  if (Number(perf?.totalTrades || 0) === 0) {
    return '🔍 Market scanned, no trades taken — DumbDollars Report';
  }
  if (pnl >= 0) {
    return `📈 Your bot made ${formatUsd(pnl)} today — DumbDollars Report`;
  }
  return "📉 Today's trading summary — DumbDollars Report";
}

function buildDailyEmail({ user, summary, paused = false }) {
  const pnl = Number(summary?.totalPnlUsd || 0);
  const heroClass = pnl >= 0 ? 'hero hero-green' : 'hero hero-red';
  const links = unsubscribeLinks(user.id, 'daily_report');
  const body = `
    <p><strong>Daily Trading Report — ${toDateLabel(summary?.date || new Date())}</strong></p>
    <div class="${heroClass}">
      Your bot ${pnl >= 0 ? 'made' : 'lost'} ${formatUsd(pnl)} today (${formatPct(summary?.totalPnlPct || 0)})
    </div>
    <table>
      <tr>
        <th>Total Trades</th><th>Win Rate</th><th>Best Trade</th><th>Avg Hold Time</th>
      </tr>
      <tr>
        <td>${Number(summary?.totalTrades || 0)}</td>
        <td>${formatPct(summary?.winRatePct || 0)}</td>
        <td>${formatUsd(summary?.bestTradeUsd || 0)}</td>
        <td>${String(summary?.avgHoldTime || '-')}</td>
      </tr>
    </table>
    <h3>Trades</h3>
    ${renderTradeRows(summary?.trades || [])}
    <h3>Signal Summary</h3>
    <p>The bot scanned ${Number(summary?.scannedCount || 0)} stocks and found ${Number(summary?.opportunities || 0)} opportunities.</p>
    <p>Top signals: ${(summary?.topSignals || []).slice(0, 3).join(', ') || 'None'}</p>
    <h3>Portfolio Snapshot</h3>
    <p>Account value: ${formatUsd(summary?.accountValueUsd || 0)}<br/>
    Today: ${formatSignedUsd(summary?.todayChangeUsd || 0)}<br/>
    WTD: ${formatSignedUsd(summary?.weekToDateUsd || 0)}<br/>
    MTD: ${formatSignedUsd(summary?.monthToDateUsd || 0)}</p>
    ${paused ? `<p><strong>Your bot was paused today.</strong> <a href="${appUrl('/ai-bot-trader.html')}">Resume Bot →</a></p>` : ''}
  `;
  const footer = `
    <a href="${links.manage}">Manage email preferences</a> |
    <a href="${links.scoped}">Unsubscribe from daily reports</a> |
    <a href="${links.all}">Unsubscribe from all</a>
  `;
  return {
    subject: dailySubject(summary),
    html: renderEmailShell({
      title: 'Daily DumbDollars Report',
      subtitle: 'Daily Trading Report',
      bodyHtml: body,
      footerHtml: footer
    })
  };
}

function buildWeeklyEmail({ user, summary }) {
  const links = unsubscribeLinks(user.id, 'weekly_report');
  const dailyBars = (summary?.dailyBars || []).map((row) => {
    const positive = Number(row?.pnlUsd || 0) >= 0;
    const bg = positive ? '#163f2d' : '#4a1f24';
    return `<td style="background:${bg};padding:8px;">${String(row?.day || '')}<br/>${formatSignedUsd(row?.pnlUsd || 0)}</td>`;
  }).join('');
  const body = `
    <p><strong>Your week in trading</strong></p>
    <div class="${Number(summary?.totalPnlUsd || 0) >= 0 ? 'hero hero-green' : 'hero hero-red'}">
      Week Total: ${formatSignedUsd(summary?.totalPnlUsd || 0)}
    </div>
    <table>
      <tr><th>Total Trades</th><th>Win Rate</th><th>Best Day</th><th>Worst Day</th></tr>
      <tr>
        <td>${Number(summary?.totalTrades || 0)}</td>
        <td>${formatPct(summary?.winRatePct || 0)}</td>
        <td>${formatSignedUsd(summary?.bestDayUsd || 0)}</td>
        <td>${formatSignedUsd(summary?.worstDayUsd || 0)}</td>
      </tr>
    </table>
    <h3>Daily P&L Bar</h3>
    <table><tr>${dailyBars || '<td>No data</td>'}</tr></table>
    <h3>Top Winners</h3>
    <p>${(summary?.topWinners || []).join(', ') || 'None'}</p>
    <h3>Top Losers</h3>
    <p>${(summary?.topLosers || []).join(', ') || 'None'}</p>
    <h3>Next Week Outlook</h3>
    <p>${String(summary?.outlook || 'No major events configured.')}</p>
    <p>Bot uptime: active ${Number(summary?.activeDays || 0)} out of 5 trading days.</p>
  `;
  const footer = `
    <a href="${links.manage}">Manage email preferences</a> |
    <a href="${links.scoped}">Unsubscribe from weekly reports</a> |
    <a href="${links.all}">Unsubscribe from all</a>
  `;
  return {
    subject: '📊 Your week in trading — DumbDollars Weekly Report',
    html: renderEmailShell({
      title: 'Weekly DumbDollars Report',
      subtitle: 'Weekly Trading Summary',
      bodyHtml: body,
      footerHtml: footer
    })
  };
}

function buildTradeAlertEmail({ user, trade, side }) {
  const links = unsubscribeLinks(user.id, side === 'buy' ? 'trade_alert_buy' : 'trade_alert_sell');
  const isBuy = side === 'buy';
  const pnl = Number(trade?.pnlUsd || 0);
  const subject = isBuy
    ? `🟢 Bot bought ${String(trade?.ticker || '')} — ${formatUsd(trade?.notionalUsd || 0)}`
    : `🔴 Bot sold ${String(trade?.ticker || '')} — ${formatSignedUsd(pnl)} (${formatPct(trade?.pnlPct || 0)})`;
  const body = isBuy
    ? `
      <p>Entry price: ${formatUsd(trade?.entry || 0)}</p>
      <p>Shares: ${Number(trade?.shares || 0)}</p>
      <p>Position size: ${formatUsd(trade?.notionalUsd || 0)}</p>
      <p>Stop loss: ${formatUsd(trade?.stopLoss || 0)}</p>
      <p>Take profit: ${formatUsd(trade?.takeProfit || 0)}</p>
      <p>Signal score: ${Number(trade?.signalScore || 0)}</p>
      <p>Reason: ${String(trade?.reason || 'Signal')}</p>
    `
    : `
      <p>Entry: ${formatUsd(trade?.entry || 0)} → Exit: ${formatUsd(trade?.exit || 0)}</p>
      <p>P&L: ${formatSignedUsd(pnl)} (${formatPct(trade?.pnlPct || 0)})</p>
      <p>Hold time: ${String(trade?.holdTime || '-')}</p>
      <p>Reason: ${String(trade?.reason || 'Manual')}</p>
    `;
  const footer = `
    <a href="${links.manage}">Manage email preferences</a> |
    <a href="${links.scoped}">Unsubscribe from this alert type</a> |
    <a href="${links.all}">Unsubscribe from all</a>
  `;
  return {
    subject,
    html: renderEmailShell({
      title: 'Trade Alert',
      subtitle: 'DumbDollars Bot Trade Notification',
      bodyHtml: body,
      footerHtml: footer
    })
  };
}

function buildStopLossAlertEmail({ user, trade }) {
  const links = unsubscribeLinks(user.id, 'stop_loss_alert');
  const subject = `🛑 Stop loss triggered — ${String(trade?.ticker || 'Position')}`;
  const body = `
    <p>A stop loss order was triggered by your bot.</p>
    <p>Ticker: <strong>${String(trade?.ticker || '-')}</strong></p>
    <p>Entry: ${formatUsd(trade?.entry || 0)} → Exit: ${formatUsd(trade?.exit || trade?.markPrice || 0)}</p>
    <p>P&L: ${formatSignedUsd(trade?.pnlUsd || 0)} (${formatPct(trade?.pnlPct || 0)})</p>
    <p>Reason: Stop Loss</p>
  `;
  const footer = `
    <a href="${links.manage}">Manage email preferences</a> |
    <a href="${links.scoped}">Unsubscribe from stop loss alerts</a> |
    <a href="${links.all}">Unsubscribe from all</a>
  `;
  return {
    subject,
    html: renderEmailShell({
      title: 'Stop Loss Alert',
      subtitle: 'DumbDollars Risk Alert',
      bodyHtml: body,
      footerHtml: footer
    })
  };
}

function buildDailyLossAlertEmail({ user, summary }) {
  const links = unsubscribeLinks(user.id, 'daily_loss_alert');
  const subject = '⚠ Daily loss limit reached — bot halted';
  const body = `
    <p>Your bot has reached its daily loss threshold and halted new trading activity.</p>
    <p>Realized daily loss: <strong>${formatSignedUsd(summary?.dailyLossUsd || 0)}</strong></p>
    <p>Configured daily max loss: <strong>${formatUsd(summary?.dailyLossLimitUsd || 0)}</strong></p>
    <p><a href="${appUrl('/ai-bot-trader.html')}">Open AI Trader</a> to review settings and resume when ready.</p>
  `;
  const footer = `
    <a href="${links.manage}">Manage email preferences</a> |
    <a href="${links.scoped}">Unsubscribe from daily loss alerts</a> |
    <a href="${links.all}">Unsubscribe from all</a>
  `;
  return {
    subject,
    html: renderEmailShell({
      title: 'Daily Loss Alert',
      subtitle: 'DumbDollars Risk Alert',
      bodyHtml: body,
      footerHtml: footer
    })
  };
}

async function sendTypedEmail({ user, emailType, subject, html }) {
  const delivery = await sendEmail({
    to: user.email,
    subject,
    html,
    text: htmlToText(html)
  });
  appendUserEmailLog({
    user_id: user.id,
    email_type: emailType,
    subject,
    sent_at: new Date().toISOString(),
    status: delivery.status === 'sent' ? 'delivered' : 'failed',
    error_message: delivery.detail || null,
    html_preview: htmlToText(html).slice(0, 1200)
  });
  return delivery;
}

module.exports = {
  buildDailyEmail,
  buildWeeklyEmail,
  buildTradeAlertEmail,
  buildStopLossAlertEmail,
  buildDailyLossAlertEmail,
  sendTypedEmail
};
