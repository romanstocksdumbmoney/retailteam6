async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch (_error) {
      body = { message: `Request failed (${response.status})` };
    }
    const error = new Error(body.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return response.json();
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(window.getAuthHeaders ? window.getAuthHeaders() : {})
  };
}

function hasCurrentAuthToken() {
  if (typeof window.getStoredAuthToken === 'function') {
    return String(window.getStoredAuthToken() || '').trim().length > 0;
  }
  return String(localStorage.getItem('dumbdollars_token') || '').trim().length > 0;
}

function setStatus(text, isError = false) {
  const node = document.getElementById('settings-status');
  if (!node) {
    return;
  }
  node.textContent = String(text || '');
  node.className = isError ? 'small-note auth-error' : 'small-note auth-ok';
}

function redirectToLogin(nextPath = '/settings') {
  const safeNext = String(nextPath || '/settings').startsWith('/') ? String(nextPath) : '/settings';
  const url = `/ai-trade-access.html?mode=login&next=${encodeURIComponent(safeNext)}`;
  window.location.href = url;
}

function formatRelativeDate(iso) {
  if (!iso) {
    return 'Unknown';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSecurityHeader(payload) {
  const emailLine = document.getElementById('security-email-line');
  const verifiedLine = document.getElementById('email-verified-line');
  if (emailLine) {
    const status = payload?.emailVerified ? 'Verified' : 'Unverified';
    emailLine.textContent = `Email: ${payload?.email || '-'} (${status})`;
  }
  if (verifiedLine) {
    const badge = payload?.emailVerified ? '✓ Verified' : '⚠ Unverified';
    verifiedLine.textContent = `${payload?.email || '-'} — ${badge}`;
  }
}

function renderSessionsTable(rows = []) {
  const body = document.getElementById('security-sessions-body');
  if (!body) {
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="4">No active sessions.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((session) => `
    <tr>
      <td>${session.device || 'Unknown'} ${session.isCurrent ? '<span class="chip">This device</span>' : ''}</td>
      <td>${session.location || 'Unknown'}</td>
      <td>${formatRelativeDate(session.lastActive)}</td>
      <td>
        ${session.isCurrent ? '' : `<button type="button" class="btn-secondary" data-revoke-session-id="${session.id}">Sign Out</button>`}
      </td>
    </tr>
  `).join('');
}

function renderHistoryTable(rows = []) {
  const body = document.getElementById('email-history-body');
  if (!body) {
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="5">No email history yet.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${formatRelativeDate(row.sent_at)}</td>
      <td>${row.email_type || '-'}</td>
      <td>${row.subject || '-'}</td>
      <td>${row.status || '-'}</td>
      <td><button type="button" class="btn-secondary" data-email-log-id="${row.id}">View</button></td>
    </tr>
  `).join('');
}

function fillPreferences(pref = {}) {
  const setChecked = (id, value) => {
    const node = document.getElementById(id);
    if (node instanceof HTMLInputElement) {
      node.checked = Boolean(value);
    }
  };
  setChecked('pref-daily-report', pref.daily_report);
  setChecked('pref-weekly-report', pref.weekly_report);
  setChecked('pref-trade-buy', pref.trade_alerts_buy);
  setChecked('pref-trade-sell', pref.trade_alerts_sell);
  setChecked('pref-stop-loss', pref.stop_loss_alerts);
  setChecked('pref-daily-loss', pref.daily_loss_alerts);
  setChecked('pref-bot-status', pref.bot_status_alerts);
  setChecked('pref-unsub-all', pref.unsubscribed_all);
  const reportTime = document.getElementById('pref-report-time');
  if (reportTime instanceof HTMLSelectElement && pref.report_time) {
    reportTime.value = String(pref.report_time);
  }
}

function readPreferencesForm() {
  const getChecked = (id, fallback = false) => {
    const node = document.getElementById(id);
    return node instanceof HTMLInputElement ? Boolean(node.checked) : fallback;
  };
  const reportTimeNode = document.getElementById('pref-report-time');
  return {
    daily_report: getChecked('pref-daily-report', true),
    weekly_report: getChecked('pref-weekly-report', true),
    trade_alerts_buy: getChecked('pref-trade-buy', false),
    trade_alerts_sell: getChecked('pref-trade-sell', false),
    stop_loss_alerts: getChecked('pref-stop-loss', true),
    daily_loss_alerts: getChecked('pref-daily-loss', true),
    bot_status_alerts: getChecked('pref-bot-status', true),
    unsubscribed_all: getChecked('pref-unsub-all', false),
    report_time: reportTimeNode instanceof HTMLSelectElement ? reportTimeNode.value : '16:30'
  };
}

async function loadSessions() {
  const payload = await fetchJson('/api/auth/security/sessions', {
    headers: authHeaders(),
    credentials: 'include'
  });
  renderSessionsTable(payload.sessions || []);
}

async function loadEmailPreferences() {
  const payload = await fetchJson('/api/auth/email/preferences', {
    headers: authHeaders(),
    credentials: 'include'
  });
  renderSecurityHeader(payload);
  fillPreferences(payload.preferences || {});
  renderHistoryTable(payload.history || []);
}

function renderBrokerSecurityLog(rows = []) {
  const body = document.getElementById('broker-security-log-body');
  if (!body) {
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="4">No broker security activity yet.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${formatRelativeDate(row.created_at)}</td>
      <td>${row.action || '-'}</td>
      <td>${row.ip_address || '-'}</td>
      <td>${row.result || '-'}</td>
    </tr>
  `).join('');
}

async function loadBrokerSecurityLog() {
  const payload = await fetchJson('/api/broker/security-log?limit=200', {
    headers: authHeaders(),
    credentials: 'include'
  });
  renderBrokerSecurityLog(payload.entries || []);
}

async function loadEverything() {
  setStatus('Loading settings...');
  await Promise.all([loadSessions(), loadEmailPreferences(), loadBrokerSecurityLog()]);
  setStatus('Settings loaded.');
}

function handleRotateBrokerKeys() {
  window.location.href = '/settings/broker?rotate=1';
}

async function handleChangeEmail(event) {
  event.preventDefault();
  const input = document.getElementById('security-new-email');
  const email = input instanceof HTMLInputElement ? String(input.value || '').trim() : '';
  if (!email) {
    setStatus('Enter an email address.', true);
    return;
  }
  await fetchJson('/api/auth/security/email/change', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ email })
  });
  setStatus('Email updated. Verify your new email and sign in again.');
}

async function handleChangePassword(event) {
  event.preventDefault();
  const current = document.getElementById('security-current-password');
  const next = document.getElementById('security-new-password');
  const confirm = document.getElementById('security-confirm-password');
  const currentPassword = current instanceof HTMLInputElement ? current.value : '';
  const newPassword = next instanceof HTMLInputElement ? next.value : '';
  const confirmPassword = confirm instanceof HTMLInputElement ? confirm.value : '';
  await fetchJson('/api/auth/security/password/change', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
  });
  setStatus('Password changed. Please sign in again.');
}

async function handleSavePreferences(event) {
  event.preventDefault();
  const payload = readPreferencesForm();
  await fetchJson('/api/auth/email/preferences', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  setStatus('Email preferences saved.');
  await loadEmailPreferences();
}

async function handleSendTestEmail() {
  await fetchJson('/api/auth/email/test', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include'
  });
  setStatus('✓ Test email sent — check your inbox.');
  await loadEmailPreferences();
}

async function revokeSessionById(sessionId) {
  await fetchJson('/api/auth/security/sessions/revoke', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ sessionId })
  });
  setStatus('Session revoked.');
  await loadSessions();
}

async function revokeAllOtherSessions() {
  const currentPassword = window.prompt('Enter your current password to sign out other devices:');
  if (!currentPassword) {
    return;
  }
  await fetchJson('/api/auth/security/sessions/revoke-all-others', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ currentPassword })
  });
  setStatus('Signed out of all other devices.');
  await loadSessions();
}

async function signOutAllDevices() {
  const currentPassword = window.prompt('Enter your current password to sign out all devices:');
  if (!currentPassword) {
    return;
  }
  await fetchJson('/api/auth/logout-all', {
    method: 'POST',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ currentPassword })
  });
  if (window.setStoredAuthToken) {
    window.setStoredAuthToken('');
  }
  redirectToLogin('/settings');
}

async function viewEmailLog(logId) {
  const payload = await fetchJson(`/api/auth/email/history/${encodeURIComponent(logId)}`, {
    headers: authHeaders(),
    credentials: 'include'
  });
  const box = document.getElementById('email-preview-box');
  if (!box) {
    return;
  }
  const item = payload?.item || {};
  box.classList.remove('hidden');
  box.innerHTML = `
    <h4>${escapeHtml(item.subject || 'Email preview')}</h4>
    <p class="small-note">${escapeHtml(formatRelativeDate(item.sent_at))} • ${escapeHtml(item.status || '-')}</p>
    <div class="table-wrap"><pre>${escapeHtml(item.html_preview || 'No preview available.')}</pre></div>
  `;
}

function bindEvents() {
  const emailForm = document.getElementById('security-change-email-form');
  const passwordForm = document.getElementById('security-change-password-form');
  const prefForm = document.getElementById('email-preferences-form');
  const testButton = document.getElementById('send-test-email-btn');
  const signoutOthers = document.getElementById('security-signout-all-others');
  const signoutAll = document.getElementById('security-signout-all');
  const rotateBrokerKeysButton = document.getElementById('settings-rotate-broker-keys');

  if (emailForm instanceof HTMLFormElement) {
    emailForm.addEventListener('submit', async (event) => {
      try {
        await handleChangeEmail(event);
      } catch (error) {
        setStatus(error.message || 'Could not update email.', true);
      }
    });
  }
  if (passwordForm instanceof HTMLFormElement) {
    passwordForm.addEventListener('submit', async (event) => {
      try {
        await handleChangePassword(event);
      } catch (error) {
        setStatus(error.message || 'Could not change password.', true);
      }
    });
  }
  if (prefForm instanceof HTMLFormElement) {
    prefForm.addEventListener('submit', async (event) => {
      try {
        await handleSavePreferences(event);
      } catch (error) {
        setStatus(error.message || 'Could not save preferences.', true);
      }
    });
  }
  if (testButton instanceof HTMLButtonElement) {
    testButton.addEventListener('click', async () => {
      try {
        await handleSendTestEmail();
      } catch (error) {
        setStatus(error.message || 'Could not send test email.', true);
      }
    });
  }
  if (signoutOthers instanceof HTMLButtonElement) {
    signoutOthers.addEventListener('click', async () => {
      try {
        await revokeAllOtherSessions();
      } catch (error) {
        setStatus(error.message || 'Could not sign out other devices.', true);
      }
    });
  }
  if (signoutAll instanceof HTMLButtonElement) {
    signoutAll.addEventListener('click', async () => {
      try {
        await signOutAllDevices();
      } catch (error) {
        setStatus(error.message || 'Could not sign out all devices.', true);
      }
    });
  }
  if (rotateBrokerKeysButton instanceof HTMLElement) {
    rotateBrokerKeysButton.addEventListener('click', (event) => {
      event.preventDefault();
      handleRotateBrokerKeys();
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const sessionId = target.getAttribute('data-revoke-session-id');
    if (sessionId) {
      revokeSessionById(sessionId).catch((error) => {
        setStatus(error.message || 'Could not revoke session.', true);
      });
      return;
    }
    const logId = target.getAttribute('data-email-log-id');
    if (logId) {
      viewEmailLog(logId).catch((error) => {
        setStatus(error.message || 'Could not load email preview.', true);
      });
    }
  });
}

async function init() {
  try {
    if (window.restoreSessionIfNeeded) {
      await window.restoreSessionIfNeeded();
    }
    if (!hasCurrentAuthToken()) {
      redirectToLogin('/settings');
      return;
    }
    bindEvents();
    await loadEverything();
  } catch (error) {
    if (Number(error?.status || 0) === 401) {
      redirectToLogin('/settings');
      return;
    }
    setStatus(error.message || 'Could not load settings.', true);
  }
}

init();
