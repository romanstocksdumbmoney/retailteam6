const express = require('express');
const {
  createUser,
  findUserByEmail,
  findOrCreateUserByAuthProvider,
  normalizeAuthProvider,
  getUserById,
  sanitizeUser
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

function authRequired(req, res, next) {
  const parsed = parseAuthToken(req.header('authorization'));
  if (!parsed.ok) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }

  const user = getUserById(parsed.userId);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized', message: 'User not found.' });
  }

  req.user = user;
  return next();
}

router.get('/billing-info', (_req, res) => {
  return res.json(getBillingPublicInfo());
});

router.get('/billing/readiness', async (_req, res) => {
  try {
    const snapshot = await getBillingReadinessSnapshot();
    const checks = snapshot.checks || {};
    const isReady = Boolean(
      snapshot.configured
      && checks.secretKeyFormatValid
      && checks.webhookSecretPresent
      && snapshot.stripeAccount?.reachable
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

router.post('/signup', (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        message: 'Enter a valid email address.'
      });
    }
    const user = createUser({ email, password });
    const token = signAuthToken({ userId: user.id, email: user.email });
    return res.status(201).json({ token, user });
  } catch (error) {
    if (String(error.message) === 'email_exists') {
      return res.status(409).json({ error: 'email_in_use', message: 'An account already exists for this email.' });
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

router.post('/oauth/signin', (req, res) => {
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
    return res.status(created ? 201 : 200).json({
      token,
      user,
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
  const password = String(req.body?.password || '');
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({
      error: 'invalid_email',
      message: 'Enter a valid email address.'
    });
  }
  const user = findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password.' });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password.' });
  }

  const token = signAuthToken({ userId: user.id, email: user.email });
  return res.json({
    token,
    user: sanitizeUser(user)
  });
});

router.get('/me', authRequired, (req, res) => {
  return res.json({ user: req.user });
});

router.get('/dev/pro-link', (_req, res) => {
  // Security hardening: this route is intentionally disabled.
  return res.status(404).json({ error: 'not_found' });
});

router.post('/stripe/create-checkout-session', authRequired, async (req, res) => {
  try {
    const customerEmail = String(req.body?.email || '').trim().toLowerCase() || undefined;
    const session = await createCheckoutSession(req.user, { customerEmail });
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
