const express = require('express');
const {
  createUser,
  findUserByEmail,
  findOrCreateUserByAuthProvider,
  normalizeAuthProvider,
  getUserById,
  sanitizeUser,
  setUserPlanById,
  createRememberSessionForUser,
  restoreRememberSession,
  revokeRememberSession
} = require('../services/userStore');
const {
  verifyPassword,
  signAuthToken,
  parseAuthToken
} = require('../services/authService');
const {
  createCheckoutSession,
  createBillingPortalSession,
  confirmCheckoutSessionForUser,
  processWebhookEvent,
  getBillingPublicInfo,
  getBillingReadinessSnapshot
} = require('../services/stripeService');
const {
  PURPOSE_PRO_RECOVERY,
  issueAccessCode,
  deliverAccessCode,
  verifyAccessCode
} = require('../services/accessCodeService');
const {
  getEmailAutomationSettings,
  saveEmailAutomationSettings,
  sendEmailAutomationEvent
} = require('../services/emailAutomationService');

const router = express.Router();
const PASSWORD_REQUIREMENT_MESSAGES = {
  weak_password_length: 'Use at least 10 characters.',
  weak_password_uppercase: 'Add at least one uppercase letter.',
  weak_password_lowercase: 'Add at least one lowercase letter.',
  weak_password_number: 'Add at least one number.',
  weak_password_symbol: 'Add at least one special character.',
  weak_password: 'Use at least 10 characters with uppercase, lowercase, number, and special character.'
};
const OAUTH_PROVIDER_LABELS = {
  google: 'Google',
  apple: 'Apple',
  github: 'GitHub',
  discord: 'Discord',
  x: 'X'
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_EMAIL_FAILURE_LIMIT = 6;
const LOGIN_EMAIL_IP_FAILURE_LIMIT = 8;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginFailuresByEmail = new Map();
const loginFailuresByEmailAndIp = new Map();
const ACCESS_CODE_ALLOW_FREE_UPGRADE = String(process.env.ACCESS_CODE_ALLOW_FREE_UPGRADE || '0').trim() === '1';

function nowMs() {
  return Date.now();
}

function getClientIp(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  if (forwarded) {
    return forwarded;
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim() || 'unknown';
}

function normalizeFailureState(entry, atMs) {
  const state = entry && typeof entry === 'object'
    ? {
      failures: Number(entry.failures || 0),
      firstFailureAtMs: Number(entry.firstFailureAtMs || 0),
      lockedUntilMs: Number(entry.lockedUntilMs || 0)
    }
    : {
      failures: 0,
      firstFailureAtMs: 0,
      lockedUntilMs: 0
    };

  if (state.lockedUntilMs > 0 && state.lockedUntilMs <= atMs) {
    state.failures = 0;
    state.firstFailureAtMs = 0;
    state.lockedUntilMs = 0;
  }
  if (state.firstFailureAtMs > 0 && atMs - state.firstFailureAtMs > LOGIN_FAILURE_WINDOW_MS) {
    state.failures = 0;
    state.firstFailureAtMs = 0;
  }
  return state;
}

function readFailureState(map, key, atMs) {
  const state = normalizeFailureState(map.get(key), atMs);
  map.set(key, state);
  return state;
}

function recordFailure(map, key, atMs, limit) {
  const state = readFailureState(map, key, atMs);
  if (!state.firstFailureAtMs) {
    state.firstFailureAtMs = atMs;
  }
  state.failures += 1;
  if (state.failures >= limit) {
    state.lockedUntilMs = atMs + LOGIN_LOCKOUT_MS;
    state.failures = 0;
    state.firstFailureAtMs = 0;
  }
  map.set(key, state);
  return state;
}

function clearFailureState(map, key) {
  if (map.has(key)) {
    map.delete(key);
  }
}

function clearLoginFailureStates(email, clientIp) {
  clearFailureState(loginFailuresByEmail, email);
  clearFailureState(loginFailuresByEmailAndIp, `${email}|${clientIp}`);
}

function lockoutPayload(lockedUntilMs) {
  const retryAfterMs = Math.max(1000, lockedUntilMs - nowMs());
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return {
    retryAfterSeconds,
    message: `Too many login attempts. Try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`
  };
}

function checkLoginLockout(email, clientIp, atMs) {
  const emailState = readFailureState(loginFailuresByEmail, email, atMs);
  const emailIpState = readFailureState(loginFailuresByEmailAndIp, `${email}|${clientIp}`, atMs);
  const lockedUntilMs = Math.max(Number(emailState.lockedUntilMs || 0), Number(emailIpState.lockedUntilMs || 0));
  return lockedUntilMs > atMs ? lockedUntilMs : 0;
}

function registerFailedLoginAttempt(email, clientIp, atMs) {
  const emailState = recordFailure(loginFailuresByEmail, email, atMs, LOGIN_EMAIL_FAILURE_LIMIT);
  const emailIpState = recordFailure(
    loginFailuresByEmailAndIp,
    `${email}|${clientIp}`,
    atMs,
    LOGIN_EMAIL_IP_FAILURE_LIMIT
  );
  return Math.max(Number(emailState.lockedUntilMs || 0), Number(emailIpState.lockedUntilMs || 0));
}

async function delayFailedLoginResponse() {
  const ms = 200 + Math.floor(Math.random() * 200);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function wantsRememberSession(req) {
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'remember')) {
    return true;
  }
  return Boolean(req.body?.remember);
}

function maybeCreateRememberSession(user, req) {
  if (!user?.id || !wantsRememberSession(req)) {
    return null;
  }
  const remember = createRememberSessionForUser(user.id, {
    userAgent: req.get('user-agent')
  });
  return remember || null;
}

function candidatePasswords(rawPassword) {
  const password = String(rawPassword || '');
  const trimmed = password.trim();
  if (trimmed && trimmed !== password) {
    return [password, trimmed];
  }
  return [password];
}

async function matchesAnyPassword(passwordHash, rawPassword) {
  const attempts = candidatePasswords(rawPassword);
  for (const attempt of attempts) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await verifyPassword(attempt, passwordHash);
    if (ok) {
      return true;
    }
  }
  return false;
}

function authRequired(req, res, next) {
  const parsed = parseAuthToken(req.header('authorization'));
  if (!parsed.ok) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }

  let user = getUserById(parsed.userId);
  if (!user && parsed.email) {
    // Backward-compatible recovery when local user IDs were regenerated.
    user = findUserByEmail(parsed.email);
  }
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: 'User not found.' });
  }

  req.user = user;
  return next();
}

function canUseProRecoveryCode(userRecord) {
  if (!userRecord) {
    return false;
  }
  if (ACCESS_CODE_ALLOW_FREE_UPGRADE) {
    return true;
  }
  const sanitized = sanitizeUser(userRecord);
  const normalizedStatus = String(sanitized.subscriptionStatus || '').trim().toLowerCase();
  return Boolean(
    sanitized.ownerAccess
    || sanitized.plan === 'pro'
    || normalizedStatus === 'active'
    || normalizedStatus === 'trialing'
  );
}

async function triggerEmailAutomationForUser(user, options = {}) {
  if (!user?.id || !user?.email) {
    return;
  }
  try {
    await sendEmailAutomationEvent(user, options);
  } catch (_error) {
    // Keep auth flows resilient if email provider is unavailable.
  }
}

router.get('/billing-info', (_req, res) => {
  return res.json(getBillingPublicInfo());
});

router.get('/billing/readiness', async (_req, res) => {
  try {
    const snapshot = await getBillingReadinessSnapshot();
    const checks = snapshot.checks || {};
    const stripeAccount = snapshot.stripeAccount || {};
    const cardPaymentsCapability = String(stripeAccount.cardPaymentsCapability || '').toLowerCase();
    const cardPaymentsReady = !cardPaymentsCapability || cardPaymentsCapability === 'active';
    const isReady = Boolean(
      snapshot.configured
      && checks.secretKeyFormatValid
      && checks.webhookSecretPresent
      && snapshot.stripeAccount?.reachable
      && stripeAccount.chargesEnabled
      && cardPaymentsReady
      && snapshot.price?.valid
    );
    const report = {
      ...snapshot,
      ready: isReady
    };
    const httpStatus = report.ready ? 200 : 503;
    return res.status(httpStatus).json(report);
  } catch (_error) {
    return res.status(500).json({
      ready: false,
      error: 'readiness_check_failed',
      message: 'Could not run Stripe readiness checks.'
    });
  }
});

router.get('/billing/checkout-preview', (_req, res) => {
  const billingInfo = getBillingPublicInfo();
  if (!billingInfo.configured) {
    return res.status(503).json({
      error: 'billing_not_configured',
      message: 'Stripe is not configured. Set STRIPE_SECRET_KEY.'
    });
  }
  return res.json({
    planName: 'DumbDollars Pro',
    monthlyAmountUsd: billingInfo.amountMonthly,
    currency: billingInfo.currency,
    securePaymentProvider: billingInfo.provider,
    benefits: [
      'Trend Trades from TikTok, YouTube, Reels, Spotlight, Facebook, and X in one pro feed',
      'High IV Tracker with IV rank, IV percentile, catalysts, and expected move context',
      'Call / Put Premium Spikes monitor showing timing, spike size, and post-spike reaction',
      'Advanced options pricing + gamma exposure toolkit for risk and scenario planning',
      'Full scanner methods and unusual flow modules for earlier signal detection',
      'Pro-only module unlocks, faster refresh cadence, and consolidated market workflow'
    ],
    cancellationPolicy: 'Cancel anytime from Manage Billing.',
    renewalPolicy: 'Recurring monthly subscription until canceled.'
  });
});

router.post('/signup', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        message: 'Enter a valid email address.'
      });
    }
    const user = createUser({ email, password });
    const token = signAuthToken({ userId: user.id, email: user.email });
    const remember = maybeCreateRememberSession(user, req);
    await triggerEmailAutomationForUser(user, {
      type: 'free_promo',
      reason: 'signup'
    });
    return res.status(201).json({
      token,
      user,
      rememberToken: remember?.rememberToken || null,
      rememberTokenExpiresAt: remember?.expiresAt || null
    });
  } catch (error) {
    if (String(error.message) === 'email_exists') {
      const existing = findUserByEmail(String(req.body?.email || '').trim().toLowerCase());
      if (existing) {
        const authProviders = Array.isArray(existing.authProviders) ? existing.authProviders : [];
        if (!authProviders.includes('password')) {
          return res.status(409).json({
            error: 'email_in_use_social',
            message: 'This email is already linked to social sign-in. Use Continue with Google/Apple/GitHub/Discord/X.'
          });
        }
      }
      return res.status(409).json({
        error: 'email_in_use',
        message: 'An account already exists for this email. Use the same email + password to log in.'
      });
    }
    if (String(error.message).startsWith('weak_password')) {
      const key = String(error.message);
      const message = PASSWORD_REQUIREMENT_MESSAGES[key] || PASSWORD_REQUIREMENT_MESSAGES.weak_password;
      return res.status(400).json({
        error: key,
        message
      });
    }
    if (String(error.message) === 'invalid_email') {
      return res.status(400).json({
        error: 'invalid_email',
        message: 'Enter a valid email address.'
      });
    }
    return res.status(400).json({ error: 'invalid_request', message: 'Invalid signup payload.' });
  }
});

router.get('/oauth/providers', (_req, res) => {
  return res.json({
    providers: Object.entries(OAUTH_PROVIDER_LABELS).map(([id, label]) => ({ id, label }))
  });
});

router.post('/oauth/signin', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const provider = normalizeAuthProvider(req.body?.provider);
    if (!email) {
      return res.status(400).json({
        error: 'email_required',
        message: 'Email is required for social sign in.'
      });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        message: 'Enter a valid email address.'
      });
    }
    if (!Object.prototype.hasOwnProperty.call(OAUTH_PROVIDER_LABELS, provider)) {
      return res.status(400).json({
        error: 'invalid_provider',
        message: 'Unsupported social provider.'
      });
    }

    const { user, created } = findOrCreateUserByAuthProvider({
      email,
      authProvider: provider
    });
    const token = signAuthToken({ userId: user.id, email: user.email });
    const remember = maybeCreateRememberSession(user, req);
    await triggerEmailAutomationForUser(user, {
      type: 'auto',
      reason: created ? 'signup_social' : 'social_signin'
    });
    return res.status(created ? 201 : 200).json({
      token,
      user,
      rememberToken: remember?.rememberToken || null,
      rememberTokenExpiresAt: remember?.expiresAt || null,
      created,
      provider,
      providerLabel: OAUTH_PROVIDER_LABELS[provider]
    });
  } catch (_error) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not complete social sign in.'
    });
  }
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '').trim();
  const clientIp = getClientIp(req);
  const atMs = nowMs();
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({
      error: 'invalid_email',
      message: 'Enter a valid email address.'
    });
  }
  const lockedUntilMs = checkLoginLockout(email, clientIp, atMs);
  if (lockedUntilMs > atMs) {
    const payload = lockoutPayload(lockedUntilMs);
    res.set('Retry-After', String(payload.retryAfterSeconds));
    return res.status(429).json({
      error: 'too_many_attempts',
      retryAfterSeconds: payload.retryAfterSeconds,
      message: payload.message
    });
  }
  const user = findUserByEmail(email);
  if (!user) {
    const locked = registerFailedLoginAttempt(email, clientIp, atMs);
    if (locked > atMs) {
      const payload = lockoutPayload(locked);
      res.set('Retry-After', String(payload.retryAfterSeconds));
      await delayFailedLoginResponse();
      return res.status(429).json({
        error: 'too_many_attempts',
        retryAfterSeconds: payload.retryAfterSeconds,
        message: payload.message
      });
    }
    await delayFailedLoginResponse();
    return res.status(404).json({
      error: 'unknown_email',
      message: 'No account found for this email. Sign up first.'
    });
  }

  const ok = await matchesAnyPassword(user.passwordHash, password);
  if (!ok) {
    const authProviders = Array.isArray(user.authProviders) ? user.authProviders : [];
    if (!authProviders.includes('password')) {
      return res.status(409).json({
        error: 'social_signin_required',
        message: 'This account uses social sign-in. Use Continue with Google/Apple/GitHub/Discord/X.'
      });
    }
    const locked = registerFailedLoginAttempt(email, clientIp, atMs);
    if (locked > atMs) {
      const payload = lockoutPayload(locked);
      res.set('Retry-After', String(payload.retryAfterSeconds));
      await delayFailedLoginResponse();
      return res.status(429).json({
        error: 'too_many_attempts',
        retryAfterSeconds: payload.retryAfterSeconds,
        message: payload.message
      });
    }
    await delayFailedLoginResponse();
    return res.status(401).json({
      error: 'incorrect_password',
      message: 'Incorrect password. Please try again.'
    });
  }

  clearLoginFailureStates(email, clientIp);
  const token = signAuthToken({ userId: user.id, email: user.email });
  const remember = maybeCreateRememberSession(user, req);
  return res.json({
    token,
    user: sanitizeUser(user),
    rememberToken: remember?.rememberToken || null,
    rememberTokenExpiresAt: remember?.expiresAt || null
  });
});

router.post('/session/restore', (req, res) => {
  const rememberToken = String(req.body?.rememberToken || '').trim();
  if (!rememberToken) {
    return res.status(400).json({
      error: 'missing_remember_token',
      message: 'Remember token is required.'
    });
  }
  const restored = restoreRememberSession(rememberToken, {
    userAgent: req.get('user-agent')
  });
  if (!restored?.user) {
    return res.status(401).json({
      error: 'invalid_remember_token',
      message: 'Remembered session expired. Please log in again.'
    });
  }
  const token = signAuthToken({ userId: restored.user.id, email: restored.user.email });
  return res.json({
    token,
    user: restored.user,
    rememberToken: restored.rememberToken,
    rememberTokenExpiresAt: restored.expiresAt
  });
});

router.post('/session/revoke', (req, res) => {
  const rememberToken = String(req.body?.rememberToken || '').trim();
  if (!rememberToken) {
    return res.status(400).json({
      error: 'missing_remember_token',
      message: 'Remember token is required.'
    });
  }
  revokeRememberSession(rememberToken);
  return res.json({ ok: true });
});

router.post('/access-code/request', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const purpose = String(req.body?.purpose || PURPOSE_PRO_RECOVERY).trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        message: 'Enter a valid email address.'
      });
    }
    const user = findUserByEmail(email);
    // Return generic success for unknown emails to avoid account enumeration.
    if (!user) {
      return res.json({
        ok: true,
        message: 'If this email exists, a code was sent.'
      });
    }
    if (!canUseProRecoveryCode(user)) {
      return res.status(403).json({
        error: 'pro_recovery_not_eligible',
        message: 'Access code recovery is available for existing Pro accounts only.'
      });
    }
    const issued = issueAccessCode({ email, purpose });
    const delivered = await deliverAccessCode({
      email,
      code: issued.code,
      purpose: issued.purpose,
      expiresAt: issued.expiresAt
    });
    return res.json({
      ok: true,
      message: delivered.mode === 'email'
        ? 'Access code sent to your email.'
        : 'Access code generated in preview mode.',
      deliveryMode: delivered.mode,
      previewCode: delivered.previewCode || null,
      expiresAt: issued.expiresAt
    });
  } catch (error) {
    const code = String(error.message || '').trim().toLowerCase();
    if (code === 'request_cooldown') {
      return res.status(429).json({
        error: 'request_cooldown',
        message: 'Please wait before requesting another code.'
      });
    }
    if (code === 'email_delivery_not_configured') {
      return res.status(503).json({
        error: 'email_delivery_not_configured',
        message: 'Email delivery is not configured yet. Set SMTP env vars.'
      });
    }
    return res.status(400).json({
      error: 'access_code_request_failed',
      message: 'Could not create access code.'
    });
  }
});

router.post('/access-code/verify', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim().toUpperCase();
  const purpose = String(req.body?.purpose || PURPOSE_PRO_RECOVERY).trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({
      error: 'invalid_email',
      message: 'Enter a valid email address.'
    });
  }
  if (!code || code.length < 6) {
    return res.status(400).json({
      error: 'invalid_code',
      message: 'Enter the full access code.'
    });
  }
  const verified = verifyAccessCode({ email, code, purpose });
  if (!verified.ok) {
    const reason = String(verified.error || 'code_invalid');
    const status = reason === 'too_many_attempts' ? 429 : 400;
    const messageByReason = {
      code_not_found: 'No valid code found for this email. Request a new code.',
      code_expired: 'Code expired. Request a new code.',
      code_invalid: 'Incorrect code. Try again.',
      too_many_attempts: 'Too many failed attempts. Request a new code.'
    };
    return res.status(status).json({
      error: reason,
      message: messageByReason[reason] || 'Could not verify code.'
    });
  }
  const user = findUserByEmail(email);
  if (!user) {
    return res.status(404).json({
      error: 'account_not_found',
      message: 'Account not found for this email.'
    });
  }
  if (!canUseProRecoveryCode(user)) {
    return res.status(403).json({
      error: 'pro_recovery_not_eligible',
      message: 'This account is not eligible for Pro recovery code restore.'
    });
  }
  const finalUser = setUserPlanById(user.id, {
    plan: 'pro',
    stripeSubscriptionId: user.stripeSubscriptionId || null
  }) || sanitizeUser({
    ...user,
    plan: 'pro',
    subscriptionStatus: 'active'
  });
  const token = signAuthToken({ userId: finalUser.id, email: finalUser.email });
  const remember = maybeCreateRememberSession(finalUser, req);
  return res.json({
    ok: true,
    message: 'Access code verified. Pro access restored.',
    token,
    user: finalUser,
    rememberToken: remember?.rememberToken || null,
    rememberTokenExpiresAt: remember?.expiresAt || null
  });
});

router.get('/me', authRequired, (req, res) => {
  return res.json({ user: req.user });
});

router.get('/email-automation/settings', authRequired, (req, res) => {
  try {
    const payload = getEmailAutomationSettings(req.user);
    return res.json(payload);
  } catch (_error) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not load email automation settings.'
    });
  }
});

router.post('/email-automation/settings', authRequired, (req, res) => {
  try {
    const payload = saveEmailAutomationSettings(req.user, req.body || {});
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'confirm_email_required') {
      return res.status(400).json({
        error: 'confirm_email_required',
        message: 'Enter your account email to confirm email automation setup.'
      });
    }
    if (code === 'email_mismatch_account') {
      return res.status(400).json({
        error: 'email_mismatch_account',
        message: 'Use the same email as your signed-in account.'
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not save email automation settings.'
    });
  }
});

router.post('/email-automation/send', authRequired, async (req, res) => {
  try {
    const payload = await sendEmailAutomationEvent(req.user, {
      type: req.body?.type,
      reason: req.body?.reason || 'manual_test',
      force: true
    });
    return res.json(payload);
  } catch (error) {
    const code = String(error.message || '');
    if (code === 'invalid_email_automation_type') {
      return res.status(400).json({
        error: 'invalid_email_automation_type',
        message: 'Email type must be auto, free_promo, or pro_update.'
      });
    }
    if (code === 'email_delivery_failed') {
      return res.status(502).json({
        error: 'email_delivery_failed',
        message: 'Email provider could not deliver this message right now.',
        delivery: error.delivery || null
      });
    }
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Could not send email automation message.'
    });
  }
});

router.get('/dev/pro-link', (_req, res) => {
  // Security hardening: this route is intentionally disabled.
  return res.status(404).json({ error: 'not_found' });
});

router.post('/stripe/create-checkout-session', authRequired, async (req, res) => {
  try {
    const customerEmail = String(req.body?.email || '').trim().toLowerCase() || undefined;
    const paymentMethodTypes = Array.isArray(req.body?.paymentMethodTypes)
      ? req.body.paymentMethodTypes
      : req.body?.paymentMethodTypes;
    const session = await createCheckoutSession(req.user, { customerEmail, paymentMethodTypes });
    return res.json({ url: session.url });
  } catch (error) {
    const code = String(error.message || '');
    if (String(error.message) === 'billing_not_configured' || String(error.message) === 'stripe_not_configured') {
      return res.status(503).json({
        error: 'billing_not_configured',
        message: 'Stripe is not configured. Set STRIPE_SECRET_KEY.'
      });
    }
    if (code === 'invalid_price_configuration') {
      return res.status(502).json({
        error: 'invalid_price_configuration',
        message: 'Stripe price configuration is invalid or inactive. Re-check STRIPE_PRICE_ID or use inline price fallback.'
      });
    }
    if (code === 'stripe_account_inactive') {
      return res.status(502).json({
        error: 'stripe_account_inactive',
        message: 'Stripe account is not fully activated for live card processing yet.'
      });
    }
    if (code === 'card_network_not_enabled') {
      return res.status(502).json({
        error: 'card_network_not_enabled',
        message: 'Your Stripe account is not configured for this card network yet (for example Amex). Enable it in Stripe Dashboard > Payments > Payment methods.'
      });
    }
    if (code === 'payment_method_not_available') {
      return res.status(502).json({
        error: 'payment_method_not_available',
        message: 'Card payment method is unavailable for this Stripe account/currency/region configuration.'
      });
    }
    if (code === 'stripe_customer_not_found') {
      return res.status(502).json({
        error: 'stripe_customer_not_found',
        message: 'Stored Stripe customer was not found for this key mode. Retry checkout once to recreate customer mapping.'
      });
    }
    if (code === 'test_live_mode_mismatch') {
      return res.status(502).json({
        error: 'test_live_mode_mismatch',
        message: 'Environment mismatch: using live mode with test data (or vice versa). Make sure Stripe key mode and price mode match.'
      });
    }
    if (code === 'stripe_checkout_creation_failed') {
      return res.status(502).json({
        error: 'checkout_provider_error',
        message: 'Stripe checkout could not start. Confirm card networks (including Amex), account activation, and currency settings in Stripe Dashboard.'
      });
    }
    return res.status(500).json({ error: 'checkout_failed', message: 'Could not create Stripe checkout session.' });
  }
});

router.post('/stripe/create-checkout-session-public', async (req, res) => {
  return res.status(410).json({
    error: 'deprecated_endpoint',
    message: 'Public checkout endpoint has been removed. Login is required.'
  });
});

router.post('/stripe/confirm-checkout-session', authRequired, async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    if (!sessionId) {
      return res.status(400).json({
        error: 'missing_session_id',
        message: 'Provide the Stripe Checkout session ID.'
      });
    }
    await confirmCheckoutSessionForUser(req.user, sessionId);
    const refreshed = getUserById(req.user.id);
    await triggerEmailAutomationForUser(refreshed, {
      type: 'pro_update',
      reason: 'pro_activated'
    });
    const token = signAuthToken({ userId: refreshed.id, email: refreshed.email });
    return res.json({
      ok: true,
      token,
      user: refreshed
    });
  } catch (error) {
    const code = String(error.message || '');
    if (
      code === 'invalid_session_id'
      || code === 'session_not_found'
      || code === 'invalid_session_mode'
      || code === 'session_not_completed'
      || code === 'session_not_paid'
      || code === 'session_user_mismatch'
      || code === 'session_customer_missing'
    ) {
      return res.status(400).json({
        error: 'invalid_checkout_session',
        message: 'Could not confirm this checkout session.'
      });
    }
    if (code === 'billing_not_configured') {
      return res.status(503).json({
        error: 'billing_not_configured',
        message: 'Stripe billing is not configured.'
      });
    }
    return res.status(500).json({
      error: 'checkout_confirmation_failed',
      message: 'Could not confirm checkout session.'
    });
  }
});

router.post('/stripe/create-customer-portal', authRequired, async (req, res) => {
  try {
    const session = await createBillingPortalSession(req.user);
    return res.json({ url: session.url });
  } catch (error) {
    if (String(error.message) === 'billing_not_configured' || String(error.message) === 'stripe_not_configured') {
      return res.status(503).json({
        error: 'billing_not_configured',
        message: 'Stripe is not configured. Set STRIPE_SECRET_KEY.'
      });
    }
    return res.status(500).json({ error: 'portal_failed', message: 'Could not create billing portal session.' });
  }
});

router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    await processWebhookEvent(req.body, req.headers['stripe-signature']);
    return res.status(200).json({ received: true });
  } catch (_error) {
    return res.status(400).send('Webhook processing failed');
  }
});

module.exports = router;
