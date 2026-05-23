const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const configuredAuthStoreFile = String(
  process.env.AUTH_STORE_FILE || path.join(__dirname, '..', 'data', 'auth-db.json')
).trim();
const AUTH_STORE_FILE = path.isAbsolute(configuredAuthStoreFile)
  ? configuredAuthStoreFile
  : path.resolve(process.cwd(), configuredAuthStoreFile);

const DEFAULT_REPORT_TIME = '16:30';
const MAX_EMAIL_LOG_ENTRIES = 5000;

let store = null;

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function ensureDirExists() {
  const dir = path.dirname(AUTH_STORE_FILE);
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeTimestamp(value, fallback = null) {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return new Date(parsed).toISOString();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return Boolean(fallback);
}

function defaultTables() {
  return {
    users: [],
    sessions: [],
    password_reset_tokens: [],
    email_verification_tokens: [],
    email_preferences: [],
    email_log: [],
    broker_connections: [],
    broker_security_log: []
  };
}

function normalizeUserRow(row) {
  return {
    id: String(row?.id || '').trim(),
    email: normalizeEmail(row?.email || ''),
    password_hash: String(row?.password_hash || row?.passwordHash || '').trim(),
    email_verified: normalizeBoolean(row?.email_verified, false),
    email_verified_at: normalizeTimestamp(row?.email_verified_at, null),
    created_at: normalizeTimestamp(row?.created_at, nowIso()),
    account_suspended: normalizeBoolean(row?.account_suspended, false),
    failed_login_attempts: Math.max(0, Math.trunc(Number(row?.failed_login_attempts || 0))),
    lockout_until: normalizeTimestamp(row?.lockout_until, null)
  };
}

function normalizeSessionRow(row) {
  return {
    id: String(row?.id || '').trim(),
    user_id: String(row?.user_id || '').trim(),
    session_token_hash: String(row?.session_token_hash || '').trim(),
    created_at: normalizeTimestamp(row?.created_at, nowIso()),
    expires_at: normalizeTimestamp(row?.expires_at, null),
    last_used_at: normalizeTimestamp(row?.last_used_at, nowIso()),
    device_info: String(row?.device_info || '').trim().slice(0, 240),
    ip_address: String(row?.ip_address || '').trim().slice(0, 100),
    persistent: normalizeBoolean(row?.persistent, true)
  };
}

function normalizeTokenRow(row) {
  return {
    id: String(row?.id || '').trim(),
    user_id: String(row?.user_id || '').trim(),
    token_hash: String(row?.token_hash || '').trim(),
    created_at: normalizeTimestamp(row?.created_at, nowIso()),
    expires_at: normalizeTimestamp(row?.expires_at, null),
    used: normalizeBoolean(row?.used, false)
  };
}

function normalizeEmailPreferenceRow(row) {
  return {
    id: String(row?.id || '').trim(),
    user_id: String(row?.user_id || '').trim(),
    daily_report: normalizeBoolean(row?.daily_report, true),
    weekly_report: normalizeBoolean(row?.weekly_report, true),
    trade_alerts_buy: normalizeBoolean(row?.trade_alerts_buy, false),
    trade_alerts_sell: normalizeBoolean(row?.trade_alerts_sell, false),
    stop_loss_alerts: normalizeBoolean(row?.stop_loss_alerts, true),
    daily_loss_alerts: normalizeBoolean(row?.daily_loss_alerts, true),
    bot_status_alerts: normalizeBoolean(row?.bot_status_alerts, true),
    report_time: String(row?.report_time || DEFAULT_REPORT_TIME).trim() || DEFAULT_REPORT_TIME,
    unsubscribed_all: normalizeBoolean(row?.unsubscribed_all, false),
    unsubscribed_at: normalizeTimestamp(row?.unsubscribed_at, null)
  };
}

function normalizeEmailLogRow(row) {
  return {
    id: String(row?.id || '').trim(),
    user_id: String(row?.user_id || '').trim(),
    email_type: String(row?.email_type || '').trim().slice(0, 80),
    subject: String(row?.subject || '').trim().slice(0, 220),
    sent_at: normalizeTimestamp(row?.sent_at, nowIso()),
    status: String(row?.status || 'queued').trim().slice(0, 40),
    error_message: row?.error_message ? String(row.error_message).trim().slice(0, 500) : null,
    html_preview: row?.html_preview ? String(row.html_preview) : null
  };
}

function normalizeBrokerConnectionRow(row) {
  return {
    id: String(row?.id || '').trim(),
    user_id: String(row?.user_id || '').trim(),
    broker_name: String(row?.broker_name || '').trim().toLowerCase(),
    trading_mode: String(row?.trading_mode || 'paper').trim().toLowerCase() === 'live' ? 'live' : 'paper',
    api_key_encrypted: String(row?.api_key_encrypted || '').trim(),
    api_secret_encrypted: row?.api_secret_encrypted ? String(row.api_secret_encrypted).trim() : null,
    account_id_encrypted: row?.account_id_encrypted ? String(row.account_id_encrypted).trim() : null,
    extra_config_encrypted: row?.extra_config_encrypted ? String(row.extra_config_encrypted).trim() : null,
    connection_status: String(row?.connection_status || 'disconnected').trim().toLowerCase(),
    last_tested_at: normalizeTimestamp(row?.last_tested_at, null),
    last_successful_trade_at: normalizeTimestamp(row?.last_successful_trade_at, null),
    failed_auth_attempts: Math.max(0, Math.trunc(Number(row?.failed_auth_attempts || 0))),
    key_updated_at: normalizeTimestamp(row?.key_updated_at, null),
    created_at: normalizeTimestamp(row?.created_at, nowIso()),
    updated_at: normalizeTimestamp(row?.updated_at, nowIso())
  };
}

function normalizeBrokerSecurityLogRow(row) {
  return {
    id: String(row?.id || '').trim(),
    user_id: String(row?.user_id || '').trim(),
    action: String(row?.action || '').trim().slice(0, 80),
    ip_address: String(row?.ip_address || '').trim().slice(0, 120),
    result: String(row?.result || '').trim().toLowerCase().slice(0, 40) || 'unknown',
    detail: row?.detail ? String(row.detail).trim().slice(0, 500) : null,
    created_at: normalizeTimestamp(row?.created_at, nowIso())
  };
}

function ensureStoreLoaded() {
  if (store) {
    return;
  }
  store = defaultTables();
  try {
    if (!fs.existsSync(AUTH_STORE_FILE)) {
      return;
    }
    const raw = fs.readFileSync(AUTH_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const source = parsed && typeof parsed === 'object' ? parsed : {};
    store.users = Array.isArray(source.users)
      ? source.users.map((row) => normalizeUserRow(row)).filter((row) => row.id && row.email && row.password_hash)
      : [];
    store.sessions = Array.isArray(source.sessions)
      ? source.sessions.map((row) => normalizeSessionRow(row)).filter((row) => row.id && row.user_id && row.session_token_hash)
      : [];
    store.password_reset_tokens = Array.isArray(source.password_reset_tokens)
      ? source.password_reset_tokens.map((row) => normalizeTokenRow(row)).filter((row) => row.id && row.user_id && row.token_hash)
      : [];
    store.email_verification_tokens = Array.isArray(source.email_verification_tokens)
      ? source.email_verification_tokens.map((row) => normalizeTokenRow(row)).filter((row) => row.id && row.user_id && row.token_hash)
      : [];
    store.email_preferences = Array.isArray(source.email_preferences)
      ? source.email_preferences.map((row) => normalizeEmailPreferenceRow(row)).filter((row) => row.id && row.user_id)
      : [];
    store.email_log = Array.isArray(source.email_log)
      ? source.email_log.map((row) => normalizeEmailLogRow(row)).filter((row) => row.id && row.user_id)
      : [];
    store.broker_connections = Array.isArray(source.broker_connections)
      ? source.broker_connections
        .map((row) => normalizeBrokerConnectionRow(row))
        .filter((row) => row.id && row.user_id && row.broker_name)
      : [];
    store.broker_security_log = Array.isArray(source.broker_security_log)
      ? source.broker_security_log
        .map((row) => normalizeBrokerSecurityLogRow(row))
        .filter((row) => row.id && row.user_id && row.action)
      : [];
  } catch (_error) {
    store = defaultTables();
  }
}

function persistStore() {
  ensureStoreLoaded();
  ensureDirExists();
  const payload = JSON.stringify(store, null, 2);
  const tmpPath = `${AUTH_STORE_FILE}.tmp`;
  fs.writeFileSync(tmpPath, payload, 'utf8');
  fs.renameSync(tmpPath, AUTH_STORE_FILE);
}

function pruneExpiredRows() {
  ensureStoreLoaded();
  const now = Date.now();
  store.sessions = store.sessions.filter((row) => {
    const expires = Date.parse(String(row.expires_at || ''));
    return Number.isFinite(expires) && expires > now;
  });
  store.password_reset_tokens = store.password_reset_tokens.filter((row) => {
    const expires = Date.parse(String(row.expires_at || ''));
    return row.used !== true && Number.isFinite(expires) && expires > now;
  });
  store.email_verification_tokens = store.email_verification_tokens.filter((row) => {
    const expires = Date.parse(String(row.expires_at || ''));
    return row.used !== true && Number.isFinite(expires) && expires > now;
  });
}

function listUsers() {
  ensureStoreLoaded();
  pruneExpiredRows();
  return store.users.map((row) => ({ ...row }));
}

function getUserById(userId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const id = String(userId || '').trim();
  if (!id) {
    return null;
  }
  const row = store.users.find((entry) => entry.id === id);
  return row ? { ...row } : null;
}

function getUserByEmail(email) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  const row = store.users.find((entry) => entry.email === normalized);
  return row ? { ...row } : null;
}

function upsertUser(row) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalized = normalizeUserRow(row);
  if (!normalized.id || !normalized.email || !normalized.password_hash) {
    throw new Error('invalid_user_row');
  }
  const byIdIndex = store.users.findIndex((entry) => entry.id === normalized.id);
  const byEmailIndex = store.users.findIndex((entry) => entry.email === normalized.email);
  if (byIdIndex >= 0) {
    const next = {
      ...store.users[byIdIndex],
      ...normalized
    };
    store.users[byIdIndex] = normalizeUserRow(next);
  } else if (byEmailIndex >= 0) {
    const next = {
      ...store.users[byEmailIndex],
      ...normalized,
      id: store.users[byEmailIndex].id
    };
    store.users[byEmailIndex] = normalizeUserRow(next);
  } else {
    store.users.push(normalized);
  }
  persistStore();
  return getUserById(normalized.id) || getUserByEmail(normalized.email);
}

function updateUser(userId, patch = {}) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const id = String(userId || '').trim();
  const index = store.users.findIndex((entry) => entry.id === id);
  if (index < 0) {
    return null;
  }
  const current = store.users[index];
  const merged = {
    ...current,
    ...patch,
    id: current.id,
    created_at: current.created_at
  };
  if (Object.prototype.hasOwnProperty.call(patch, 'email')) {
    merged.email = normalizeEmail(patch.email);
  } else {
    merged.email = current.email;
  }
  const next = normalizeUserRow(merged);
  store.users[index] = next;
  persistStore();
  return { ...next };
}

function createSession(row) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalized = normalizeSessionRow({
    id: row?.id || makeId('sess'),
    user_id: row?.user_id,
    session_token_hash: row?.session_token_hash,
    created_at: row?.created_at || nowIso(),
    expires_at: row?.expires_at,
    last_used_at: row?.last_used_at || nowIso(),
    device_info: row?.device_info || '',
    ip_address: row?.ip_address || '',
    persistent: row?.persistent
  });
  if (!normalized.user_id || !normalized.session_token_hash || !normalized.expires_at) {
    throw new Error('invalid_session_row');
  }
  store.sessions = [
    normalized,
    ...store.sessions.filter((entry) => entry.id !== normalized.id)
  ].slice(0, 5000);
  persistStore();
  return { ...normalized };
}

function getSessionByTokenHash(tokenHash) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedHash = String(tokenHash || '').trim();
  if (!normalizedHash) {
    return null;
  }
  const row = store.sessions.find((entry) => entry.session_token_hash === normalizedHash);
  return row ? { ...row } : null;
}

function getSessionById(sessionId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedId = String(sessionId || '').trim();
  if (!normalizedId) {
    return null;
  }
  const row = store.sessions.find((entry) => entry.id === normalizedId);
  return row ? { ...row } : null;
}

function touchSession(sessionId, patch = {}) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedId = String(sessionId || '').trim();
  const index = store.sessions.findIndex((entry) => entry.id === normalizedId);
  if (index < 0) {
    return null;
  }
  const current = store.sessions[index];
  const next = normalizeSessionRow({
    ...current,
    ...patch,
    id: current.id,
    user_id: current.user_id,
    session_token_hash: current.session_token_hash
  });
  store.sessions[index] = next;
  persistStore();
  return { ...next };
}

function deleteSessionById(sessionId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedId = String(sessionId || '').trim();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((row) => row.id !== normalizedId);
  if (store.sessions.length !== before) {
    persistStore();
    return true;
  }
  return false;
}

function deleteSessionByTokenHash(tokenHash) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedHash = String(tokenHash || '').trim();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((row) => row.session_token_hash !== normalizedHash);
  if (store.sessions.length !== before) {
    persistStore();
    return true;
  }
  return false;
}

function deleteSessionsForUser(userId, options = {}) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  const exceptSessionId = String(options?.exceptSessionId || '').trim();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((row) => {
    if (row.user_id !== normalizedUserId) {
      return true;
    }
    if (exceptSessionId && row.id === exceptSessionId) {
      return true;
    }
    return false;
  });
  if (store.sessions.length !== before) {
    persistStore();
  }
  return before - store.sessions.length;
}

function listSessionsForUser(userId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  return store.sessions
    .filter((row) => row.user_id === normalizedUserId)
    .sort((a, b) => Date.parse(String(b.last_used_at || b.created_at || 0)) - Date.parse(String(a.last_used_at || a.created_at || 0)))
    .map((row) => ({ ...row }));
}

function createPasswordResetToken(row) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalized = normalizeTokenRow({
    id: row?.id || makeId('prt'),
    user_id: row?.user_id,
    token_hash: row?.token_hash,
    created_at: row?.created_at || nowIso(),
    expires_at: row?.expires_at,
    used: false
  });
  if (!normalized.user_id || !normalized.token_hash || !normalized.expires_at) {
    throw new Error('invalid_password_reset_token');
  }
  store.password_reset_tokens.unshift(normalized);
  store.password_reset_tokens = store.password_reset_tokens.slice(0, 5000);
  persistStore();
  return { ...normalized };
}

function invalidatePasswordResetTokensForUser(userId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return 0;
  }
  let changed = 0;
  store.password_reset_tokens = store.password_reset_tokens.map((row) => {
    if (row.user_id !== normalizedUserId || row.used === true) {
      return row;
    }
    changed += 1;
    return {
      ...row,
      used: true
    };
  });
  if (changed > 0) {
    persistStore();
  }
  return changed;
}

function createEmailVerificationToken(row) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalized = normalizeTokenRow({
    id: row?.id || makeId('evt'),
    user_id: row?.user_id,
    token_hash: row?.token_hash,
    created_at: row?.created_at || nowIso(),
    expires_at: row?.expires_at,
    used: false
  });
  if (!normalized.user_id || !normalized.token_hash || !normalized.expires_at) {
    throw new Error('invalid_email_verification_token');
  }
  store.email_verification_tokens.unshift(normalized);
  store.email_verification_tokens = store.email_verification_tokens.slice(0, 5000);
  persistStore();
  return { ...normalized };
}

function invalidateEmailVerificationTokensForUser(userId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return 0;
  }
  let changed = 0;
  store.email_verification_tokens = store.email_verification_tokens.map((row) => {
    if (row.user_id !== normalizedUserId || row.used === true) {
      return row;
    }
    changed += 1;
    return {
      ...row,
      used: true
    };
  });
  if (changed > 0) {
    persistStore();
  }
  return changed;
}

function consumePasswordResetToken(tokenHash) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedHash = String(tokenHash || '').trim();
  const now = Date.now();
  const index = store.password_reset_tokens.findIndex((row) => {
    if (row.used) {
      return false;
    }
    if (row.token_hash !== normalizedHash) {
      return false;
    }
    const expires = Date.parse(String(row.expires_at || ''));
    return Number.isFinite(expires) && expires > now;
  });
  if (index < 0) {
    return null;
  }
  const tokenRow = {
    ...store.password_reset_tokens[index],
    used: true
  };
  store.password_reset_tokens[index] = tokenRow;
  persistStore();
  return { ...tokenRow };
}

function getValidPasswordResetToken(tokenHash) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedHash = String(tokenHash || '').trim();
  const now = Date.now();
  const row = store.password_reset_tokens.find((entry) => {
    if (entry.used) {
      return false;
    }
    if (entry.token_hash !== normalizedHash) {
      return false;
    }
    const expires = Date.parse(String(entry.expires_at || ''));
    return Number.isFinite(expires) && expires > now;
  });
  return row ? { ...row } : null;
}

function consumeEmailVerificationToken(tokenHash) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedHash = String(tokenHash || '').trim();
  const now = Date.now();
  const index = store.email_verification_tokens.findIndex((row) => {
    if (row.used) {
      return false;
    }
    if (row.token_hash !== normalizedHash) {
      return false;
    }
    const expires = Date.parse(String(row.expires_at || ''));
    return Number.isFinite(expires) && expires > now;
  });
  if (index < 0) {
    return null;
  }
  const tokenRow = {
    ...store.email_verification_tokens[index],
    used: true
  };
  store.email_verification_tokens[index] = tokenRow;
  persistStore();
  return { ...tokenRow };
}

function getValidEmailVerificationToken(tokenHash) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedHash = String(tokenHash || '').trim();
  const now = Date.now();
  const row = store.email_verification_tokens.find((entry) => {
    if (entry.used) {
      return false;
    }
    if (entry.token_hash !== normalizedHash) {
      return false;
    }
    const expires = Date.parse(String(entry.expires_at || ''));
    return Number.isFinite(expires) && expires > now;
  });
  return row ? { ...row } : null;
}

function markEmailVerified(userId) {
  const now = nowIso();
  return updateUser(userId, {
    email_verified: true,
    email_verified_at: now
  });
}

function getEmailPreferences(userId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  let row = store.email_preferences.find((entry) => entry.user_id === normalizedUserId);
  if (!row) {
    row = normalizeEmailPreferenceRow({
      id: makeId('ep'),
      user_id: normalizedUserId
    });
    store.email_preferences.push(row);
    persistStore();
  }
  return { ...row };
}

function updateEmailPreferences(userId, patch = {}) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  const existing = getEmailPreferences(normalizedUserId);
  const next = normalizeEmailPreferenceRow({
    ...existing,
    ...patch,
    id: existing.id,
    user_id: normalizedUserId
  });
  const index = store.email_preferences.findIndex((entry) => entry.id === existing.id);
  if (index >= 0) {
    store.email_preferences[index] = next;
  } else {
    store.email_preferences.push(next);
  }
  persistStore();
  return { ...next };
}

function appendEmailLog(row) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalized = normalizeEmailLogRow({
    id: row?.id || makeId('elog'),
    user_id: row?.user_id,
    email_type: row?.email_type || 'unknown',
    subject: row?.subject || '',
    sent_at: row?.sent_at || nowIso(),
    status: row?.status || 'queued',
    error_message: row?.error_message || null,
    html_preview: row?.html_preview || null
  });
  if (!normalized.user_id) {
    throw new Error('invalid_email_log_row');
  }
  store.email_log.unshift(normalized);
  if (store.email_log.length > MAX_EMAIL_LOG_ENTRIES) {
    store.email_log = store.email_log.slice(0, MAX_EMAIL_LOG_ENTRIES);
  }
  persistStore();
  return { ...normalized };
}

function listEmailLogForUser(userId, limit = 10) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  const requestedLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 10)));
  return store.email_log
    .filter((row) => row.user_id === normalizedUserId)
    .sort((a, b) => Date.parse(String(b.sent_at || 0)) - Date.parse(String(a.sent_at || 0)))
    .slice(0, requestedLimit)
    .map((row) => ({ ...row }));
}

function getEmailLogByIdForUser(userId, logId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  const normalizedLogId = String(logId || '').trim();
  const row = store.email_log.find((entry) => entry.user_id === normalizedUserId && entry.id === normalizedLogId);
  return row ? { ...row } : null;
}

function hasEmailLogForTypeSince(userId, emailType, sinceIso) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  const normalizedType = String(emailType || '').trim();
  const sinceTs = Date.parse(String(sinceIso || ''));
  if (!Number.isFinite(sinceTs)) {
    return false;
  }
  return store.email_log.some((row) => {
    if (row.user_id !== normalizedUserId || row.email_type !== normalizedType) {
      return false;
    }
    const sentAtTs = Date.parse(String(row.sent_at || ''));
    return Number.isFinite(sentAtTs) && sentAtTs >= sinceTs;
  });
}

function getSchemaSnapshot() {
  ensureStoreLoaded();
  pruneExpiredRows();
  return {
    users: store.users.length,
    sessions: store.sessions.length,
    password_reset_tokens: store.password_reset_tokens.length,
    email_verification_tokens: store.email_verification_tokens.length,
    email_preferences: store.email_preferences.length,
    email_log: store.email_log.length,
    broker_connections: store.broker_connections.length,
    broker_security_log: store.broker_security_log.length
  };
}

function getBrokerConnectionByUserId(userId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return null;
  }
  const row = store.broker_connections.find((entry) => entry.user_id === normalizedUserId);
  return row ? { ...row } : null;
}

function upsertBrokerConnection(row) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalized = normalizeBrokerConnectionRow({
    ...row,
    id: row?.id || makeId('bc'),
    updated_at: row?.updated_at || nowIso(),
    created_at: row?.created_at || nowIso()
  });
  if (!normalized.user_id || !normalized.broker_name) {
    throw new Error('invalid_broker_connection_row');
  }
  const byUserIndex = store.broker_connections.findIndex((entry) => entry.user_id === normalized.user_id);
  if (byUserIndex >= 0) {
    const current = store.broker_connections[byUserIndex];
    const merged = normalizeBrokerConnectionRow({
      ...current,
      ...normalized,
      id: current.id,
      user_id: current.user_id,
      created_at: current.created_at,
      updated_at: nowIso()
    });
    store.broker_connections[byUserIndex] = merged;
    persistStore();
    return { ...merged };
  }
  store.broker_connections.push(normalized);
  persistStore();
  return { ...normalized };
}

function deleteBrokerConnectionByUserId(userId) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return false;
  }
  const before = store.broker_connections.length;
  store.broker_connections = store.broker_connections.filter((entry) => entry.user_id !== normalizedUserId);
  if (store.broker_connections.length !== before) {
    persistStore();
    return true;
  }
  return false;
}

function appendBrokerSecurityLog(row) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalized = normalizeBrokerSecurityLogRow({
    ...row,
    id: row?.id || makeId('bsl'),
    created_at: row?.created_at || nowIso()
  });
  if (!normalized.user_id || !normalized.action) {
    throw new Error('invalid_broker_security_log_row');
  }
  store.broker_security_log.unshift(normalized);
  if (store.broker_security_log.length > MAX_EMAIL_LOG_ENTRIES) {
    store.broker_security_log = store.broker_security_log.slice(0, MAX_EMAIL_LOG_ENTRIES);
  }
  persistStore();
  return { ...normalized };
}

function listBrokerSecurityLogForUser(userId, limit = 100) {
  ensureStoreLoaded();
  pruneExpiredRows();
  const normalizedUserId = String(userId || '').trim();
  const requestedLimit = Math.max(1, Math.min(500, Math.trunc(Number(limit) || 100)));
  return store.broker_security_log
    .filter((row) => row.user_id === normalizedUserId)
    .sort((a, b) => Date.parse(String(b.created_at || 0)) - Date.parse(String(a.created_at || 0)))
    .slice(0, requestedLimit)
    .map((row) => ({ ...row }));
}

function ensureSchemaTables() {
  ensureStoreLoaded();
  pruneExpiredRows();
  persistStore();
  return getSchemaSnapshot();
}

module.exports = {
  AUTH_STORE_FILE,
  nowIso,
  makeId,
  normalizeEmail,
  ensureSchemaTables,
  getSchemaSnapshot,
  listUsers,
  getUserById,
  getUserByEmail,
  upsertUser,
  updateUser,
  createSession,
  getSessionByTokenHash,
  getSessionById,
  touchSession,
  deleteSessionById,
  deleteSessionByTokenHash,
  deleteSessionsForUser,
  listSessionsForUser,
  createPasswordResetToken,
  invalidatePasswordResetTokensForUser,
  createEmailVerificationToken,
  invalidateEmailVerificationTokensForUser,
  consumePasswordResetToken,
  getValidPasswordResetToken,
  consumeEmailVerificationToken,
  getValidEmailVerificationToken,
  markEmailVerified,
  getEmailPreferences,
  updateEmailPreferences,
  appendEmailLog,
  listEmailLogForUser,
  getEmailLogByIdForUser,
  hasEmailLogForTypeSince,
  getBrokerConnectionByUserId,
  upsertBrokerConnection,
  deleteBrokerConnectionByUserId,
  appendBrokerSecurityLog,
  listBrokerSecurityLogForUser
};
