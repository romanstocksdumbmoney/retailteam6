const crypto = require('crypto');
const {
  ensureSchemaTables,
  listUsers,
  getUserById,
  getUserByEmail,
  upsertUser,
  updateUser,
  createSession,
  getSessionByTokenHash,
  touchSession,
  deleteSessionById,
  deleteSessionByTokenHash,
  deleteSessionsForUser,
  listSessionsForUser,
  createPasswordResetToken,
  createEmailVerificationToken,
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
  hasEmailLogForTypeSince
} = require('./authStore');
const {
  nowIso,
  hashSha256,
  createSecureToken,
  looksLikeBcryptHash,
  passwordStrengthState,
  hashPassword,
  comparePassword
} = require('./authSecurityService');

const SESSION_TTL_DAYS = 30;
const SESSION_MAX_AGE_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
const SESSION_COOKIE_NAME = String(process.env.SESSION_COOKIE_NAME || 'dd_session').trim() || 'dd_session';
const APP_URL = String(process.env.APP_URL || process.env.APP_BASE_URL || 'http://localhost:5000').trim();
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

function isProduction() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeUserForClient(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    emailVerifiedAt: row.email_verified_at || null,
    createdAt: row.created_at,
    failedLoginAttempts: Number(row.failed_login_attempts || 0),
    lockoutUntil: row.lockout_until || null,
    plan: 'free',
    traderMode: 'day'
  };
}

function parseUserAgent(userAgent) {
  const raw = String(userAgent || '').trim();
  if (!raw) {
    return 'Unknown device';
  }
  const browserMatch = raw.match(/(Chrome|Firefox|Safari|Edge|OPR|Opera|MSIE|Trident)\/?([0-9.]*)/i);
  const browser = browserMatch
    ? `${browserMatch[1].replace('OPR', 'Opera')}${browserMatch[2] ? ` ${browserMatch[2].split('.')[0]}` : ''}`
    : 'Browser';
  let os = 'OS';
  if (/windows/i.test(raw)) {
    os = 'Windows';
  } else if (/mac os x|macintosh/i.test(raw)) {
    os = 'macOS';
  } else if (/android/i.test(raw)) {
    os = 'Android';
  } else if (/iphone|ipad|ios/i.test(raw)) {
    os = 'iOS';
  } else if (/linux/i.test(raw)) {
    os = 'Linux';
  }
  return `${browser} on ${os}`.slice(0, 240);
}

function getClientIp(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  if (forwarded) {
    return forwarded;
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim().slice(0, 100) || 'unknown';
}

function buildSessionExpiryIso(persistent = true) {
  const now = Date.now();
  if (!persistent) {
    return new Date(now + 12 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
}

function sessionCookieOptions(persistent = true) {
  const base = {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/'
  };
  if (persistent) {
    return {
      ...base,
      maxAge: SESSION_MAX_AGE_SECONDS * 1000
    };
  }
  return base;
}

function setSessionCookie(res, token, persistent) {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(persistent));
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'strict',
    path: '/'
  });
}

function buildResetUrl(token) {
  return `${APP_URL.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}

function buildVerifyUrl(token) {
  return `${APP_URL.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
}

async function migrateLegacyUsersFromUserStore(userStoreService) {
  const users = Array.isArray(userStoreService?.listUsers?.()) ? userStoreService.listUsers() : [];
  for (const user of users) {
    const email = normalizeEmail(user?.email || '');
    const id = String(user?.id || '').trim();
    const passwordHash = String(user?.passwordHash || '').trim();
    if (!email || !id || !passwordHash) {
      continue;
    }
    let finalPasswordHash = passwordHash;
    if (!looksLikeBcryptHash(passwordHash)) {
      finalPasswordHash = await hashPassword(passwordHash);
    }
    const existing = getUserByEmail(email);
    if (existing) {
      continue;
    }
    upsertUser({
      id,
      email,
      password_hash: finalPasswordHash,
      email_verified: false,
      email_verified_at: null,
      created_at: nowIso(),
      failed_login_attempts: 0,
      lockout_until: null
    });
  }
}

function ensureSchema() {
  return ensureSchemaTables();
}

function getAllUsersForReports() {
  return listUsers().map((row) => sanitizeUserForClient(row));
}

async function runPlaintextPasswordMigration() {
  const users = listUsers();
  let migrated = 0;
  for (const user of users) {
    if (looksLikeBcryptHash(user.password_hash)) {
      continue;
    }
    const nextHash = await hashPassword(user.password_hash);
    updateUser(user.id, { password_hash: nextHash });
    migrated += 1;
  }
  return { migrated };
}

async function createUserAccount({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('invalid_email');
  }
  if (getUserByEmail(normalizedEmail)) {
    throw new Error('email_exists');
  }
  const passwordState = passwordStrengthState(password);
  if (!passwordState.ok) {
    throw new Error('weak_password');
  }
  const password_hash = await hashPassword(password);
  const now = nowIso();
  const user = upsertUser({
    id: crypto.randomUUID(),
    email: normalizedEmail,
    password_hash,
    email_verified: false,
    email_verified_at: null,
    created_at: now,
    failed_login_attempts: 0,
    lockout_until: null
  });
  return sanitizeUserForClient(user);
}

function getUserByEmailForAuth(email) {
  const row = getUserByEmail(email);
  return row ? { ...row } : null;
}

function getUserByIdForAuth(userId) {
  const row = getUserById(userId);
  return row ? { ...row } : null;
}

function resetFailedLoginState(userId) {
  return updateUser(userId, {
    failed_login_attempts: 0,
    lockout_until: null
  });
}

function incrementFailedLoginState(user) {
  const attempts = Math.max(0, Number(user?.failed_login_attempts || 0)) + 1;
  if (attempts >= 5) {
    const lockout_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return updateUser(user.id, {
      failed_login_attempts: 0,
      lockout_until
    });
  }
  return updateUser(user.id, {
    failed_login_attempts: attempts
  });
}

function isLockedOut(user) {
  const lockoutUntil = Date.parse(String(user?.lockout_until || ''));
  return Number.isFinite(lockoutUntil) && lockoutUntil > Date.now();
}

function verifyEmailState(user) {
  return Boolean(user?.email_verified);
}

async function verifyPasswordAgainstUser(user, password) {
  if (!user?.password_hash) {
    return false;
  }
  if (looksLikeBcryptHash(user.password_hash)) {
    return comparePassword(password, user.password_hash);
  }
  if (String(password || '') !== String(user.password_hash || '')) {
    return false;
  }
  const nextHash = await hashPassword(password);
  updateUser(user.id, { password_hash: nextHash });
  return true;
}

function createSessionForUser(user, metadata = {}) {
  const persistent = metadata.persistent !== false;
  const rawToken = createSecureToken(32);
  const row = createSession({
    user_id: user.id,
    session_token_hash: hashSha256(rawToken),
    created_at: nowIso(),
    expires_at: buildSessionExpiryIso(persistent),
    last_used_at: nowIso(),
    device_info: parseUserAgent(metadata.userAgent),
    ip_address: String(metadata.ipAddress || '').trim().slice(0, 100),
    persistent
  });
  return {
    session: row,
    rawToken
  };
}

function validateSessionFromToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) {
    return null;
  }
  const tokenHash = hashSha256(token);
  const session = getSessionByTokenHash(tokenHash);
  if (!session) {
    return null;
  }
  const user = getUserById(session.user_id);
  if (!user) {
    deleteSessionById(session.id);
    return null;
  }
  return {
    session,
    user
  };
}

function touchAndExtendSession(session, metadata = {}) {
  if (!session?.id) {
    return null;
  }
  const persistent = Boolean(session.persistent);
  const next = touchSession(session.id, {
    last_used_at: nowIso(),
    expires_at: buildSessionExpiryIso(persistent),
    device_info: metadata.userAgent ? parseUserAgent(metadata.userAgent) : session.device_info,
    ip_address: metadata.ipAddress ? String(metadata.ipAddress).trim().slice(0, 100) : session.ip_address
  });
  return next ? { ...next } : null;
}

function revokeSessionByToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) {
    return false;
  }
  return deleteSessionByTokenHash(hashSha256(token));
}

function revokeSessionById(sessionId) {
  return deleteSessionById(sessionId);
}

function revokeAllSessionsForUser(userId, options = {}) {
  return deleteSessionsForUser(userId, options);
}

function listActiveSessionsForUser(userId) {
  return listSessionsForUser(userId).map((row) => ({ ...row }));
}

async function changeUserPassword({ userId, currentPassword, nextPassword }) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('user_not_found');
  }
  const okCurrent = await verifyPasswordAgainstUser(user, currentPassword);
  if (!okCurrent) {
    throw new Error('incorrect_password');
  }
  const strength = passwordStrengthState(nextPassword);
  if (!strength.ok) {
    throw new Error('weak_password');
  }
  const nextHash = await hashPassword(nextPassword);
  updateUser(user.id, {
    password_hash: nextHash,
    failed_login_attempts: 0,
    lockout_until: null
  });
  revokeAllSessionsForUser(user.id);
  return true;
}

async function setPasswordForUser(userId, nextPassword) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('user_not_found');
  }
  const strength = passwordStrengthState(nextPassword);
  if (!strength.ok) {
    throw new Error('weak_password');
  }
  const nextHash = await hashPassword(nextPassword);
  updateUser(user.id, {
    password_hash: nextHash,
    failed_login_attempts: 0,
    lockout_until: null
  });
  revokeAllSessionsForUser(user.id);
  return true;
}

function issuePasswordResetToken(userId) {
  const rawToken = createSecureToken(32);
  createPasswordResetToken({
    user_id: userId,
    token_hash: hashSha256(rawToken),
    created_at: nowIso(),
    expires_at: new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString(),
    used: false
  });
  return rawToken;
}

function consumePasswordResetTokenRaw(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) {
    return null;
  }
  return consumePasswordResetToken(hashSha256(token));
}

function validatePasswordResetTokenRaw(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) {
    return null;
  }
  return getValidPasswordResetToken(hashSha256(token));
}

function issueEmailVerificationToken(userId) {
  const rawToken = createSecureToken(32);
  createEmailVerificationToken({
    user_id: userId,
    token_hash: hashSha256(rawToken),
    created_at: nowIso(),
    expires_at: new Date(Date.now() + EMAIL_VERIFY_TTL_MS).toISOString(),
    used: false
  });
  return rawToken;
}

function consumeEmailVerificationTokenRaw(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) {
    return null;
  }
  return consumeEmailVerificationToken(hashSha256(token));
}

function validateEmailVerificationTokenRaw(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) {
    return null;
  }
  return getValidEmailVerificationToken(hashSha256(token));
}

function markUserEmailVerified(userId) {
  return markEmailVerified(userId);
}

function getUserEmailPreferences(userId) {
  return getEmailPreferences(userId);
}

function saveUserEmailPreferences(userId, patch) {
  return updateEmailPreferences(userId, patch);
}

function appendUserEmailLog(entry) {
  return appendEmailLog(entry);
}

function listUserEmailLog(userId, limit = 10) {
  return listEmailLogForUser(userId, limit);
}

function getUserEmailLogPreview(userId, logId) {
  return getEmailLogByIdForUser(userId, logId);
}

function wasEmailTypeSentSince(userId, emailType, sinceIso) {
  return hasEmailLogForTypeSince(userId, emailType, sinceIso);
}

function updateUserEmailAddress(userId, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('invalid_email');
  }
  const existing = getUserByEmail(normalizedEmail);
  if (existing && existing.id !== userId) {
    throw new Error('email_exists');
  }
  return updateUser(userId, {
    email: normalizedEmail,
    email_verified: false,
    email_verified_at: null
  });
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  APP_URL,
  nowIso,
  normalizeEmail,
  sanitizeUserForClient,
  parseUserAgent,
  getClientIp,
  passwordStrengthState,
  sessionCookieOptions,
  setSessionCookie,
  clearSessionCookie,
  buildResetUrl,
  buildVerifyUrl,
  ensureSchema,
  getAllUsersForReports,
  runPlaintextPasswordMigration,
  migrateLegacyUsersFromUserStore,
  createUserAccount,
  getUserByEmailForAuth,
  getUserByIdForAuth,
  resetFailedLoginState,
  incrementFailedLoginState,
  isLockedOut,
  verifyEmailState,
  verifyPasswordAgainstUser,
  createSessionForUser,
  validateSessionFromToken,
  touchAndExtendSession,
  revokeSessionByToken,
  revokeSessionById,
  revokeAllSessionsForUser,
  listActiveSessionsForUser,
  changeUserPassword,
  setPasswordForUser,
  issuePasswordResetToken,
  consumePasswordResetTokenRaw,
  validatePasswordResetTokenRaw,
  issueEmailVerificationToken,
  consumeEmailVerificationTokenRaw,
  validateEmailVerificationTokenRaw,
  markUserEmailVerified,
  getUserEmailPreferences,
  saveUserEmailPreferences,
  appendUserEmailLog,
  listUserEmailLog,
  getUserEmailLogPreview,
  wasEmailTypeSentSince,
  updateUserEmailAddress
};
