const express = require('express');
const { signAuthToken } = require('../services/authService');
const {
  requireApiAuth,
  getSessionTokenFromRequest
} = require('../services/routeAuth');
const {
  APP_URL,
  nowIso,
  getClientIp,
  passwordStrengthState,
  setSessionCookie,
  clearSessionCookie,
  ensureSchema,
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
  markUserEmailVerified,
  getUserEmailPreferences,
  saveUserEmailPreferences,
  listUserEmailLog,
  getUserEmailLogPreview,
  updateUserEmailAddress
} = require('../services/authDbService');
const { sendTypedEmail } = require('../services/reportEmailService');
const { providerReadiness } = require('../services/emailProviderService');
const {
  listUsers,
  findUserByEmail,
  createUser,
  setUserTraderModeById
} = require('../services/userStore');
const { createSecureToken } = require('../services/authSecurityService');

const router = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const REPORT_TIME_OPTIONS = new Set(['16:00', '16:30', '17:00', '18:00']);
const OAUTH_PROVIDERS = new Set(['google', 'apple', 'github', 'discord', 'x']);
const TRADER_MODES = new Set(['scalper', 'day', 'swing', 'long']);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

function sanitizeUser(authUser) {
  if (!authUser) {
    return null;
  }
  const legacy = findUserByEmail(authUser.email);
  return {
    id: legacy?.id || authUser.id,
    authUserId: authUser.id,
    email: authUser.email,
    plan: legacy?.plan || 'free',
    traderMode: legacy?.traderMode || 'day',
    emailVerified: Boolean(authUser.email_verified),
    emailVerifiedAt: authUser.email_verified_at || null,
    createdAt: authUser.created_at || nowIso()
  };
}

function canCreateLegacyUser() {
  try {
    return typeof createUser === 'function';
  } catch (_error) {
    return false;
  }
}

function normalizeReportTime(value) {
  const text = String(value || '').trim();
  if (REPORT_TIME_OPTIONS.has(text)) {
    return text;
  }
  return '16:30';
}

function normalizeTraderMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return TRADER_MODES.has(mode) ? mode : '';
}

function issueCompatibilityToken(user) {
  try {
    return signAuthToken({ userId: user.id, email: user.email });
  } catch (_error) {
    return '';
  }
}

function resolveLockoutMessage() {
  return 'Too many failed attempts — try again in 15 minutes';
}

function buildAppUrl(pathname) {
  const base = String(APP_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const suffix = String(pathname || '/');
  const path = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}${path}`;
}

function buildVerificationEmail(user, token) {
  const verifyUrl = buildAppUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  const unsubAllUrl = buildAppUrl(`/unsubscribe.html?scope=all&uid=${encodeURIComponent(user.id)}`);
  return {
    subject: 'Verify your DumbDollars account',
    html: `
      <p>Welcome to DumbDollars.</p>
      <p>Please verify your account email to unlock bot and broker features.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#f0b90b;color:#101010;text-decoration:none;font-weight:700;">Verify Email</a></p>
      <p>This link expires in 24 hours.</p>
      <p style="font-size:12px;color:#8a98ad;">Manage preferences: <a href="${buildAppUrl('/settings')}">Settings</a> · <a href="${unsubAllUrl}">Unsubscribe all</a></p>
    `
  };
}

function buildResetEmail(user, token) {
  const resetUrl = buildAppUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const unsubAllUrl = buildAppUrl(`/unsubscribe.html?scope=all&uid=${encodeURIComponent(user.id)}`);
  return {
    subject: 'Reset your DumbDollars password',
    html: `
      <p>We received a password reset request for your DumbDollars account.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#f0b90b;color:#101010;text-decoration:none;font-weight:700;">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p style="font-size:12px;color:#8a98ad;">Manage preferences: <a href="${buildAppUrl('/settings')}">Settings</a> · <a href="${unsubAllUrl}">Unsubscribe all</a></p>
    `
  };
}

async function sendVerificationEmail(user) {
  const token = issueEmailVerificationToken(user.id);
  const payload = buildVerificationEmail(user, token);
  await sendTypedEmail({
    user: { id: user.id, email: user.email },
    emailType: 'email_verification',
    subject: payload.subject,
    html: payload.html
  });
}

function parseLocationFromIp(ipAddress) {
  const ip = String(ipAddress || '').trim();
  return ip ? `Approx via ${ip}` : 'Unknown';
}

function readSessionToken(req) {
  return getSessionTokenFromRequest(req);
}

function readPublicUnsubscribeUserId(req) {
  return String(req.body?.userId || req.query?.uid || '').trim();
}

function parseOptionalBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === null || typeof value === 'undefined') {
    return undefined;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return undefined;
  }
  if (['1', 'true', 'yes', 'on'].includes(text)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(text)) {
    return false;
  }
  return undefined;
}

function ensureLegacyUserRecord(authUser, options = {}) {
  if (!canCreateLegacyUser()) {
    return null;
  }
  const existing = findUserByEmail(authUser.email);
  const traderMode = normalizeTraderMode(options.traderMode);
  if (existing) {
    if (traderMode) {
      setUserTraderModeById(existing.id, traderMode);
    }
    return existing;
  }
  const created = createUser({
    email: authUser.email,
    passwordHash: String(options.passwordHash || ''),
    authProvider: String(options.authProvider || 'password'),
    traderMode: traderMode || 'day'
  });
  return created;
}

router.get('/schema/snapshot', (_req, res) => {
  const snapshot = ensureSchema();
  return res.json({ ok: true, snapshot });
});

router.post('/migrate/password-hashes', async (_req, res) => {
  const summary = await runPlaintextPasswordMigration();
  return res.json({ ok: true, migrated: summary.migrated });
});

async function handleSignup(req, res) {
  try {
    const email = normalizeEmail(req.body?.email || '');
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || req.body?.passwordConfirm || '');
    const traderMode = normalizeTraderMode(req.body?.traderMode || '');
    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        message: 'Enter a valid email address.'
      });
    }
    const strength = passwordStrengthState(password);
    if (!strength.ok) {
      return res.status(400).json({
        error: 'weak_password',
        message: 'Password must be at least 8 characters with uppercase, number, and special character.',
        strength
      });
    }
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        error: 'password_mismatch',
        message: 'Passwords do not match.'
      });
    }
    const created = await createUserAccount({ email, password });
    const authUser = getUserByEmailForAuth(created.email);
    if (!authUser) {
      return res.status(500).json({
        error: 'signup_failed',
        message: 'Could not create account.'
      });
    }
    ensureLegacyUserRecord(authUser, {
      passwordHash: authUser.password_hash,
      authProvider: 'password',
      traderMode
    });
    await sendVerificationEmail(authUser);
    const responseUser = getUserByEmailForAuth(authUser.email) || authUser;
    return res.status(201).json({
      ok: true,
      user: sanitizeUser(responseUser),
      requiresEmailVerification: true,
      message: 'Account created. Please verify your email before signing in.'
    });
  } catch (error) {
    if (String(error?.message) === 'email_exists') {
      return res.status(409).json({
        error: 'email_in_use',
        message: 'An account with that email already exists.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not create account.'
    });
  }
}

router.post('/signup', handleSignup);
router.post('/register', handleSignup);

router.post('/resend-verification', async (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  if (!isValidEmail(email)) {
    return res.status(400).json({
      error: 'invalid_email',
      message: 'Enter a valid email address.'
    });
  }
  const user = getUserByEmailForAuth(email);
  if (!user) {
    return res.json({
      ok: true,
      message: 'If this email exists, a verification email was sent.'
    });
  }
  if (verifyEmailState(user)) {
    return res.json({
      ok: true,
      message: 'Email is already verified.'
    });
  }
  try {
    await sendVerificationEmail(user);
    return res.json({ ok: true, message: 'Verification email sent.' });
  } catch (_error) {
    return res.status(502).json({
      error: 'email_delivery_failed',
      message: 'Could not send verification email right now.'
    });
  }
});

function consumeVerifyTokenAndMark(token, res) {
  const consumed = consumeEmailVerificationTokenRaw(token);
  if (!consumed?.user_id) {
    return res.status(400).json({
      error: 'invalid_or_expired_token',
      message: 'Verification link is invalid or expired.'
    });
  }
  const updated = markUserEmailVerified(consumed.user_id);
  if (!updated) {
    return res.status(404).json({
      error: 'user_not_found',
      message: 'Account not found.'
    });
  }
  return res.json({ ok: true, message: 'Email verified successfully.' });
}

router.get('/verify-email', (req, res) => {
  const token = String(req.query?.token || '').trim();
  if (!token) {
    return res.status(400).json({
      error: 'invalid_token',
      message: 'Verification token is required.'
    });
  }
  return consumeVerifyTokenAndMark(token, res);
});

router.post('/verify-email', (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    return res.status(400).json({
      error: 'invalid_token',
      message: 'Verification token is required.'
    });
  }
  return consumeVerifyTokenAndMark(token, res);
});

router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  const password = String(req.body?.password || '');
  const rememberRaw = parseOptionalBoolean(req.body?.remember);
  const remember = typeof rememberRaw === 'boolean' ? rememberRaw : true;
  if (!isValidEmail(email)) {
    return res.status(400).json({
      error: 'invalid_email',
      message: 'Enter a valid email address.'
    });
  }
  const user = getUserByEmailForAuth(email);
  if (!user) {
    return res.status(404).json({
      error: 'unknown_email',
      message: 'No account found with that email'
    });
  }
  if (isLockedOut(user)) {
    return res.status(429).json({
      error: 'too_many_attempts',
      message: resolveLockoutMessage(),
      lockoutUntil: user.lockout_until
    });
  }
  const validPassword = await verifyPasswordAgainstUser(user, password);
  if (!validPassword) {
    const updated = incrementFailedLoginState(user);
    if (updated && isLockedOut(updated)) {
      return res.status(429).json({
        error: 'too_many_attempts',
        message: resolveLockoutMessage(),
        lockoutUntil: updated.lockout_until
      });
    }
    return res.status(401).json({
      error: 'incorrect_password',
      message: 'Incorrect password'
    });
  }
  if (!verifyEmailState(user)) {
    return res.status(403).json({
      error: 'email_not_verified',
      message: 'Please verify your email before signing in',
      resendPath: '/api/auth/resend-verification'
    });
  }
  resetFailedLoginState(user.id);
  const refreshed = getUserByIdForAuth(user.id) || user;
  ensureLegacyUserRecord(refreshed, {
    passwordHash: refreshed.password_hash,
    authProvider: 'password'
  });
  const { rawToken } = createSessionForUser(refreshed, {
    persistent: remember,
    userAgent: req.get('user-agent'),
    ipAddress: getClientIp(req)
  });
  setSessionCookie(res, rawToken, remember);
  return res.json({
    ok: true,
    token: issueCompatibilityToken(refreshed),
    user: sanitizeUser(refreshed)
  });
});

router.post('/oauth/signin', async (req, res) => {
  const rememberRaw = parseOptionalBoolean(req.body?.remember);
  const remember = typeof rememberRaw === 'boolean' ? rememberRaw : true;
  const provider = String(req.body?.provider || '').trim().toLowerCase();
  const email = normalizeEmail(req.body?.email || '');
  const traderMode = normalizeTraderMode(req.body?.traderMode || '');
  if (!OAUTH_PROVIDERS.has(provider)) {
    return res.status(400).json({
      error: 'invalid_provider',
      message: 'Unsupported social provider.'
    });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({
      error: 'invalid_email',
      message: 'Enter a valid email address.'
    });
  }
  let user = getUserByEmailForAuth(email);
  if (!user) {
    const generatedPassword = `OAuth#${createSecureToken(16)}Aa1!`;
    const created = await createUserAccount({ email, password: generatedPassword });
    user = getUserByEmailForAuth(created.email);
  }
  markUserEmailVerified(user.id);
  user = getUserByIdForAuth(user.id) || user;
  ensureLegacyUserRecord(user, {
    passwordHash: user.password_hash,
    authProvider: provider,
    traderMode
  });
  const legacy = findUserByEmail(user.email);
  if (legacy && traderMode) {
    setUserTraderModeById(legacy.id, traderMode);
  }
  const { rawToken } = createSessionForUser(user, {
    persistent: remember,
    userAgent: req.get('user-agent'),
    ipAddress: getClientIp(req)
  });
  setSessionCookie(res, rawToken, remember);
  return res.json({
    ok: true,
    token: issueCompatibilityToken(user),
    user: sanitizeUser(user),
    provider
  });
});

router.post('/logout', requireApiAuth, (req, res) => {
  const token = readSessionToken(req);
  if (token) {
    revokeSessionByToken(token);
  }
  clearSessionCookie(res);
  return res.json({ ok: true });
});

router.post('/session/revoke', requireApiAuth, (req, res) => {
  const token = readSessionToken(req);
  if (token) {
    revokeSessionByToken(token);
  }
  clearSessionCookie(res);
  return res.json({ ok: true });
});

router.post('/logout-all', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  if (authUser?.id) {
    revokeAllSessionsForUser(authUser.id);
  }
  clearSessionCookie(res);
  return res.json({ ok: true });
});

router.post('/session/restore', (req, res) => {
  const token = readSessionToken(req);
  const resolved = validateSessionFromToken(token);
  if (!resolved?.user || !resolved?.session) {
    clearSessionCookie(res);
    return res.status(401).json({
      error: 'invalid_session',
      message: 'Session expired. Please sign in again.'
    });
  }
  const touched = touchAndExtendSession(resolved.session, {
    userAgent: req.get('user-agent'),
    ipAddress: getClientIp(req)
  });
  if (!touched) {
    clearSessionCookie(res);
    return res.status(401).json({
      error: 'invalid_session',
      message: 'Session expired. Please sign in again.'
    });
  }
  setSessionCookie(res, token, Boolean(touched.persistent));
  return res.json({
    ok: true,
    token: issueCompatibilityToken(resolved.user),
    user: sanitizeUser(resolved.user)
  });
});

router.get('/me', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  if (!authUser) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Login required.'
    });
  }
  return res.json({
    user: sanitizeUser(authUser),
    emailPreferences: getUserEmailPreferences(authUser.id)
  });
});

router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body?.email || '');
  if (!isValidEmail(email)) {
    return res.status(400).json({
      error: 'invalid_email',
      message: 'Enter a valid email address.'
    });
  }
  const user = getUserByEmailForAuth(email);
  if (!user) {
    return res.json({
      ok: true,
      message: 'If this email exists, a reset link was sent.'
    });
  }
  const token = issuePasswordResetToken(user.id);
  const emailPayload = buildResetEmail(user, token);
  try {
    await sendTypedEmail({
      user: { id: user.id, email: user.email },
      emailType: 'password_reset',
      subject: emailPayload.subject,
      html: emailPayload.html
    });
  } catch (_error) {
    return res.status(502).json({
      error: 'email_delivery_failed',
      message: 'Could not send reset email right now.'
    });
  }
  return res.json({
    ok: true,
    message: 'If this email exists, a reset link was sent.'
  });
});

router.post('/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  const confirmPassword = String(req.body?.confirmPassword || '');
  if (!token) {
    return res.status(400).json({
      error: 'invalid_token',
      message: 'Reset token is required.'
    });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({
      error: 'password_mismatch',
      message: 'Passwords do not match.'
    });
  }
  const strength = passwordStrengthState(password);
  if (!strength.ok) {
    return res.status(400).json({
      error: 'weak_password',
      message: 'Password must be at least 8 characters with uppercase, number, and special character.',
      strength
    });
  }
  const consumed = consumePasswordResetTokenRaw(token);
  if (!consumed?.user_id) {
    return res.status(400).json({
      error: 'invalid_or_expired_token',
      message: 'Reset link is invalid or expired.'
    });
  }
  try {
    await setPasswordForUser(consumed.user_id, password);
  } catch (_error) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not reset password.'
    });
  }
  return res.json({
    ok: true,
    message: 'Password reset successful. Please sign in.'
  });
});

router.get('/reset-password/validate', (req, res) => {
  const token = String(req.query?.token || '').trim();
  if (!token) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_token',
      message: 'Reset token is required.'
    });
  }
  const resolved = validatePasswordResetTokenRaw(token);
  if (!resolved?.user_id) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_or_expired_token',
      message: 'Reset link is invalid or expired.'
    });
  }
  return res.json({ ok: true });
});

router.get('/security/sessions', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  if (!authUser?.id) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Login required.'
    });
  }
  const sessions = listActiveSessionsForUser(authUser.id);
  const currentToken = readSessionToken(req);
  const currentResolved = validateSessionFromToken(currentToken);
  return res.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      device: session.device_info || 'Unknown device',
      location: parseLocationFromIp(session.ip_address),
      lastActive: session.last_used_at || session.created_at,
      createdAt: session.created_at,
      isCurrent: Boolean(currentResolved?.session?.id && currentResolved.session.id === session.id)
    }))
  });
});

router.post('/security/sessions/revoke', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const sessionId = String(req.body?.sessionId || '').trim();
  if (!sessionId) {
    return res.status(400).json({
      error: 'invalid_session_id',
      message: 'Session ID is required.'
    });
  }
  const ownSession = listActiveSessionsForUser(authUser.id).find((row) => row.id === sessionId);
  if (!ownSession) {
    return res.status(404).json({
      error: 'session_not_found',
      message: 'Session not found.'
    });
  }
  revokeSessionById(sessionId);
  return res.json({ ok: true });
});

router.post('/security/sessions/revoke-all-others', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const token = readSessionToken(req);
  const resolved = validateSessionFromToken(token);
  revokeAllSessionsForUser(authUser.id, {
    exceptSessionId: resolved?.session?.id || ''
  });
  return res.json({ ok: true });
});

router.post('/security/password/change', requireApiAuth, async (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');
  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      error: 'password_mismatch',
      message: 'Passwords do not match.'
    });
  }
  try {
    await changeUserPassword({
      userId: authUser.id,
      currentPassword,
      nextPassword: newPassword
    });
  } catch (error) {
    if (String(error?.message) === 'incorrect_password') {
      return res.status(401).json({
        error: 'incorrect_password',
        message: 'Incorrect current password.'
      });
    }
    if (String(error?.message) === 'weak_password') {
      return res.status(400).json({
        error: 'weak_password',
        message: 'Password must be at least 8 characters with uppercase, number, and special character.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not change password.'
    });
  }
  clearSessionCookie(res);
  return res.json({
    ok: true,
    message: 'Password changed. Please sign in again.'
  });
});

router.post('/security/email/change', requireApiAuth, async (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const nextEmail = normalizeEmail(req.body?.email || '');
  if (!isValidEmail(nextEmail)) {
    return res.status(400).json({
      error: 'invalid_email',
      message: 'Enter a valid email address.'
    });
  }
  try {
    const updated = updateUserEmailAddress(authUser.id, nextEmail);
    await sendVerificationEmail(updated);
    revokeAllSessionsForUser(updated.id);
    clearSessionCookie(res);
    return res.json({
      ok: true,
      user: sanitizeUser(updated),
      message: 'Email updated. Please verify your new address.'
    });
  } catch (error) {
    if (String(error?.message) === 'email_exists') {
      return res.status(409).json({
        error: 'email_in_use',
        message: 'That email is already in use.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not update email.'
    });
  }
});

router.get('/email/preferences', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const prefs = getUserEmailPreferences(authUser.id);
  const history = listUserEmailLog(authUser.id, 10);
  return res.json({
    email: authUser.email,
    emailVerified: Boolean(authUser.email_verified),
    preferences: prefs,
    history
  });
});

router.post('/email/preferences', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const body = req.body || {};
  const patch = {};
  const map = [
    ['daily_report', body.daily_report ?? body.dailyReport],
    ['weekly_report', body.weekly_report ?? body.weeklyReport],
    ['trade_alerts_buy', body.trade_alerts_buy ?? body.tradeAlertsBuy],
    ['trade_alerts_sell', body.trade_alerts_sell ?? body.tradeAlertsSell],
    ['stop_loss_alerts', body.stop_loss_alerts ?? body.stopLossAlerts],
    ['daily_loss_alerts', body.daily_loss_alerts ?? body.dailyLossAlerts],
    ['bot_status_alerts', body.bot_status_alerts ?? body.botStatusAlerts]
  ];
  map.forEach(([key, raw]) => {
    const parsed = parseOptionalBoolean(raw);
    if (typeof parsed === 'boolean') {
      patch[key] = parsed;
    }
  });
  if (Object.prototype.hasOwnProperty.call(body, 'report_time') || Object.prototype.hasOwnProperty.call(body, 'reportTime')) {
    patch.report_time = normalizeReportTime(body.report_time ?? body.reportTime);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'unsubscribed_all') || Object.prototype.hasOwnProperty.call(body, 'unsubscribedAll')) {
    const unsub = Boolean(body.unsubscribed_all ?? body.unsubscribedAll);
    patch.unsubscribed_all = unsub;
    patch.unsubscribed_at = unsub ? nowIso() : null;
  }
  const updated = saveUserEmailPreferences(authUser.id, patch);
  return res.json({
    ok: true,
    preferences: updated
  });
});

router.post('/email/test', requireApiAuth, async (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const html = `
    <p>Test email from DumbDollars.</p>
    <p>Your email notifications are configured correctly.</p>
  `;
  try {
    await sendTypedEmail({
      user: { id: authUser.id, email: authUser.email },
      emailType: 'test_email',
      subject: 'DumbDollars test email',
      html
    });
    return res.json({ ok: true, message: 'Test email sent.' });
  } catch (_error) {
    return res.status(502).json({
      error: 'email_delivery_failed',
      message: 'Could not send test email.'
    });
  }
});

router.get('/email/history', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  return res.json({
    history: listUserEmailLog(authUser.id, 10)
  });
});

router.get('/email/history/:id', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const row = getUserEmailLogPreview(authUser.id, req.params.id);
  if (!row) {
    return res.status(404).json({
      error: 'not_found',
      message: 'Email history item not found.'
    });
  }
  return res.json({ item: row });
});

router.get('/email-automation/settings', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const prefs = getUserEmailPreferences(authUser.id);
  const ready = providerReadiness();
  return res.json({
    accountEmail: authUser.email,
    transportReady: Boolean(ready.sendgrid || ready.smtp),
    settings: {
      enabled: !prefs.unsubscribed_all,
      freePromoEnabled: prefs.daily_report,
      proUpdateEnabled: prefs.weekly_report,
      cadenceDays: prefs.report_time === '18:00' ? 4 : 1
    }
  });
});

router.post('/email-automation/settings', requireApiAuth, (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const body = req.body || {};
  const enabled = parseOptionalBoolean(body.enabled);
  const freePromoEnabled = parseOptionalBoolean(body.freePromoEnabled);
  const proUpdateEnabled = parseOptionalBoolean(body.proUpdateEnabled);
  const cadenceDays = Math.max(1, Math.min(30, Number.parseInt(String(body.cadenceDays || '1'), 10) || 1));
  const patch = {};
  if (typeof enabled === 'boolean') {
    patch.unsubscribed_all = !enabled;
    patch.unsubscribed_at = !enabled ? nowIso() : null;
  }
  if (typeof freePromoEnabled === 'boolean') {
    patch.daily_report = freePromoEnabled;
  }
  if (typeof proUpdateEnabled === 'boolean') {
    patch.weekly_report = proUpdateEnabled;
  }
  patch.report_time = cadenceDays >= 4 ? '18:00' : '16:30';
  const updated = saveUserEmailPreferences(authUser.id, patch);
  return res.json({
    accountEmail: authUser.email,
    transportReady: Boolean(providerReadiness().sendgrid || providerReadiness().smtp),
    settings: {
      enabled: !updated.unsubscribed_all,
      freePromoEnabled: Boolean(updated.daily_report),
      proUpdateEnabled: Boolean(updated.weekly_report),
      cadenceDays
    }
  });
});

router.post('/email-automation/send', requireApiAuth, async (req, res) => {
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  const html = '<p>DumbDollars email automation test message.</p>';
  try {
    await sendTypedEmail({
      user: { id: authUser.id, email: authUser.email },
      emailType: 'automation_test',
      subject: 'DumbDollars email automation test',
      html
    });
    return res.json({ ok: true });
  } catch (_error) {
    return res.status(502).json({
      error: 'email_delivery_failed',
      message: 'Email provider could not deliver this message right now.'
    });
  }
});

router.post('/unsubscribe', (req, res) => {
  const userId = readPublicUnsubscribeUserId(req);
  const scope = String(req.body?.scope || req.query?.scope || '').trim().toLowerCase();
  const emailType = String(req.body?.type || req.query?.type || '').trim().toLowerCase();
  if (!userId) {
    return res.status(400).json({
      error: 'invalid_user',
      message: 'User is required.'
    });
  }
  const current = getUserEmailPreferences(userId);
  let patch = {};
  if (scope === 'all') {
    patch = {
      ...current,
      unsubscribed_all: true,
      unsubscribed_at: nowIso()
    };
  } else if (scope === 'type') {
    if (emailType === 'daily_report') {
      patch = { ...current, daily_report: false };
    } else if (emailType === 'weekly_report') {
      patch = { ...current, weekly_report: false };
    } else if (emailType === 'trade_alert_buy') {
      patch = { ...current, trade_alerts_buy: false };
    } else if (emailType === 'trade_alert_sell') {
      patch = { ...current, trade_alerts_sell: false };
    } else if (emailType === 'bot_status_alert') {
      patch = { ...current, bot_status_alerts: false };
    } else {
      return res.status(400).json({
        error: 'invalid_type',
        message: 'Email type is invalid.'
      });
    }
  } else if (scope === 'cancel') {
    return res.json({ ok: true, message: 'No changes made.' });
  } else {
    return res.status(400).json({
      error: 'invalid_scope',
      message: 'Scope must be "type", "all", or "cancel".'
    });
  }
  const updated = saveUserEmailPreferences(userId, patch);
  return res.json({ ok: true, preferences: updated });
});

router.post('/trader-mode', requireApiAuth, (req, res) => {
  const traderMode = normalizeTraderMode(req.body?.traderMode || '');
  if (!traderMode) {
    return res.status(400).json({
      error: 'invalid_trader_mode',
      message: 'Trader mode must be one of: scalper, day, swing, long.'
    });
  }
  const legacy = findUserByEmail(req.user?.email || '');
  if (legacy) {
    setUserTraderModeById(legacy.id, traderMode);
  }
  return res.json({ ok: true, traderMode });
});

router.get('/readiness', (_req, res) => {
  return res.json({
    ok: true,
    emailProvider: providerReadiness()
  });
});

async function bootstrapAuthV2(options = {}) {
  ensureSchema();
  if (options.userStoreService) {
    await migrateLegacyUsersFromUserStore(options.userStoreService);
  } else {
    await migrateLegacyUsersFromUserStore({ listUsers });
  }
  await runPlaintextPasswordMigration();
}

module.exports = {
  authV2Router: router,
  bootstrapAuthV2
};
