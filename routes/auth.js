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
  processWebhookEvent,
  getBillingPublicInfo
} = require('../services/stripeService');

const router = express.Router();
const OAUTH_PROVIDER_LABELS = {
  google: 'Google',
  apple: 'Apple',
  github: 'GitHub',
  discord: 'Discord',
  x: 'X'
};

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

router.get('/billing/checkout-preview', (_req, res) => {
  const billingInfo = getBillingPublicInfo();
  if (!billingInfo.configured) {
    return res.status(503).json({
      error: 'billing_not_configured',
      message: 'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.'
    });
  }
  return res.json({
    planName: 'DumbDollars Pro',
    monthlyAmountUsd: billingInfo.amountMonthly,
    currency: billingInfo.currency,
    securePaymentProvider: billingInfo.provider,
    benefits: [
      'Unlock Trend Trades (Pro social trend signals)',
      'Use advanced options calculator + gamma exposure',
      'Access unusual moves feed and full scanner methods'
    ],
    cancellationPolicy: 'Cancel anytime from Manage Billing.',
    renewalPolicy: 'Recurring monthly subscription until canceled.'
  });
});

router.post('/signup', (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const user = createUser({ email, password });
    const token = signAuthToken({ userId: user.id, email: user.email });
    return res.status(201).json({ token, user });
  } catch (error) {
    if (String(error.message) === 'email_exists') {
      return res.status(409).json({ error: 'email_in_use', message: 'An account already exists for this email.' });
    }
    if (String(error.message) === 'weak_password') {
      return res.status(400).json({ error: 'weak_password', message: 'Password must be at least 8 characters.' });
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

router.post('/stripe/create-checkout-session', async (req, res) => {
  try {
    const parsed = parseAuthToken(req.header('authorization'));
    const user = parsed.ok ? getUserById(parsed.userId) : null;
    const customerEmail = String(req.body?.email || '').trim().toLowerCase() || undefined;
    const session = await createCheckoutSession(user, { customerEmail });
    return res.json({ url: session.url });
  } catch (error) {
    if (String(error.message) === 'billing_not_configured' || String(error.message) === 'stripe_not_configured') {
      return res.status(503).json({
        error: 'billing_not_configured',
        message: 'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.'
      });
    }
    return res.status(500).json({ error: 'checkout_failed', message: 'Could not create Stripe checkout session.' });
  }
});

router.post('/stripe/create-checkout-session-public', async (req, res) => {
  try {
    const customerEmail = String(req.body?.email || '').trim().toLowerCase() || undefined;
    const session = await createCheckoutSession(null, { customerEmail });
    return res.json({ url: session.url });
  } catch (error) {
    if (String(error.message) === 'billing_not_configured' || String(error.message) === 'stripe_not_configured') {
      return res.status(503).json({
        error: 'billing_not_configured',
        message: 'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID, or set PAYMENT_CHECKOUT_FALLBACK_URL.'
      });
    }
    return res.status(500).json({ error: 'checkout_failed', message: 'Could not create Stripe checkout session.' });
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
