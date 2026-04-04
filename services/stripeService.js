const Stripe = require('stripe');
const { updateUser } = require('./userStore');

function isPlaceholderValue(value) {
  const normalized = String(value || '').toLowerCase();
  return (
    !normalized ||
    normalized.includes('your_key_here') ||
    normalized.includes('your_webhook_secret_here') ||
    normalized.includes('your_monthly_pro_price_id') ||
    normalized.includes('placeholder')
  );
}

function getStripe() {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!/^sk_(test|live)_/.test(secretKey) || isPlaceholderValue(secretKey)) {
    return null;
  }
  return new Stripe(secretKey, { apiVersion: '2024-06-20' });
}

function getAppBaseUrl() {
  const configured = String(process.env.APP_BASE_URL || '').trim();
  const runtimePort = String(process.env.PORT || '').trim();

  if (configured) {
    try {
      const parsed = new URL(configured);
      const isLocalHost = ['localhost', '127.0.0.1'].includes(parsed.hostname);
      if (isLocalHost && runtimePort && parsed.port && parsed.port !== runtimePort) {
        parsed.port = runtimePort;
      }
      return parsed.toString().replace(/\/$/, '');
    } catch (_error) {
      // Fall through to runtime-derived localhost URL.
    }
  }

  return `http://localhost:${runtimePort || 5000}`;
}

function getProPriceId() {
  const priceId = String(process.env.STRIPE_PRICE_ID || '').trim();
  if (!priceId.startsWith('price_') || isPlaceholderValue(priceId)) {
    return '';
  }
  return priceId;
}

function getProMonthlyAmountCents() {
  const raw = Number(process.env.STRIPE_PRO_MONTHLY_PRICE_CENTS || 1500);
  if (!Number.isFinite(raw)) {
    return 1500;
  }
  const rounded = Math.round(raw);
  // Guardrails: $1.00 to $500.00 per month.
  return Math.min(50_000, Math.max(100, rounded));
}

function getProMonthlyAmountUsd() {
  return Number((getProMonthlyAmountCents() / 100).toFixed(2));
}

async function ensureStripeCustomer(user) {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('stripe_not_configured');
  }

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id }
  });

  updateUser(user.id, { stripeCustomerId: customer.id });
  return customer.id;
}

function resolveCheckoutUser(user = {}, options = {}) {
  const fallbackEmail = String(process.env.CHECKOUT_GUEST_EMAIL || 'guest-checkout@dumbdollars.local').trim().toLowerCase();
  const preferredEmail = String(options.customerEmail || user.email || fallbackEmail).trim().toLowerCase() || fallbackEmail;
  return {
    id: user.id || 'guest-checkout',
    email: preferredEmail,
    stripeCustomerId: user.stripeCustomerId || null
  };
}

function normalizeAppPath(pathValue, fallbackPath) {
  const raw = String(pathValue || '').trim();
  if (!raw) {
    return fallbackPath;
  }
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return fallbackPath;
  }
  return raw;
}

function appendPathQuery(pathValue, params = {}) {
  const [pathname, query = ''] = String(pathValue || '/').split('?');
  const search = new URLSearchParams(query);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });
  const next = search.toString();
  return next ? `${pathname}?${next}` : pathname;
}

async function createCheckoutSession(user, options = {}) {
  const stripe = getStripe();
  const priceId = getProPriceId();
  if (!stripe) {
    throw new Error('billing_not_configured');
  }

  const checkoutUser = resolveCheckoutUser(user, options);
  const customerId = await ensureStripeCustomer(checkoutUser);
  const base = getAppBaseUrl();
  const lineItems = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [
      {
        price_data: {
          currency: 'usd',
          recurring: { interval: 'month' },
          unit_amount: getProMonthlyAmountCents(),
          product_data: {
            name: 'DumbDollars Pro',
            description: 'Monthly Pro access subscription'
          }
        },
        quantity: 1
      }
    ];
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    payment_method_types: ['card'],
    payment_method_collection: 'always',
    payment_method_options: {
      card: {
        request_three_d_secure: 'automatic'
      }
    },
    line_items: lineItems,
    success_url: `${base}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?checkout=cancelled`,
    metadata: { userId: checkoutUser.id }
  });

  return session;
}

async function createFundingCheckoutSession(user, options = {}) {
  const amountUsd = Number(options.amountUsd);
  const amountRounded = Number(amountUsd.toFixed(2));
  if (!Number.isFinite(amountRounded) || amountRounded < 10 || amountRounded > 1_000_000) {
    throw new Error('invalid_funding_amount');
  }
  const paymentReference = String(options.paymentReference || '').trim().slice(0, 120);
  if (!paymentReference) {
    throw new Error('invalid_payment_reference');
  }

  const successPath = normalizeAppPath(options.successPath, '/ai-bot-funding-payment.html');
  const cancelPath = normalizeAppPath(options.cancelPath, '/ai-bot-funding-payment.html');
  const successReturnPath = appendPathQuery(successPath, {
    fundingPayment: 'success',
    amountUsd: amountRounded,
    paymentReference
  });
  const cancelReturnPath = appendPathQuery(cancelPath, {
    fundingPayment: 'cancelled',
    amountUsd: amountRounded,
    paymentReference
  });

  const stripe = getStripe();
  if (!stripe) {
    throw new Error('billing_not_configured');
  }

  const checkoutUser = resolveCheckoutUser(user, options);
  const customerId = await ensureStripeCustomer(checkoutUser);
  const base = getAppBaseUrl();
  const successUrl = `${base}${appendPathQuery(successPath, {
    fundingPayment: 'success',
    amountUsd: amountRounded,
    paymentReference,
    sessionId: '{CHECKOUT_SESSION_ID}'
  })}`;
  const cancelUrl = `${base}${cancelReturnPath}`;
  const amountCents = Math.round(amountRounded * 100);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    payment_method_types: ['card'],
    payment_method_collection: 'always',
    payment_method_options: {
      card: {
        request_three_d_secure: 'automatic'
      }
    },
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: 'DumbDollars AI Trader Funding',
            description: `Funding deposit for AI Trader account ($${amountRounded.toFixed(2)})`
          }
        },
        quantity: 1
      }
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      userId: checkoutUser.id,
      paymentType: 'ai_trader_funding',
      paymentReference,
      amountUsd: String(amountRounded)
    }
  });

  return {
    url: session.url,
    paymentReference,
    amountUsd: amountRounded
  };
}

async function createBillingPortalSession(user) {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('billing_not_configured');
  }
  const customerId = await ensureStripeCustomer(user);
  const base = getAppBaseUrl();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/`
  });
  return session;
}

async function confirmCheckoutSessionForUser(user, sessionId) {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('billing_not_configured');
  }
  const checkoutUser = resolveCheckoutUser(user, {});
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId.startsWith('cs_')) {
    throw new Error('invalid_session_id');
  }

  const session = await stripe.checkout.sessions.retrieve(normalizedSessionId, {
    expand: ['subscription']
  });
  if (!session) {
    throw new Error('session_not_found');
  }
  if (session.mode !== 'subscription') {
    throw new Error('invalid_session_mode');
  }
  if (session.status !== 'complete') {
    throw new Error('session_not_completed');
  }
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (!paid) {
    throw new Error('session_not_paid');
  }

  const expectedEmail = String(checkoutUser.email || '').toLowerCase();
  const sessionEmail = String(session.customer_email || '').toLowerCase();
  const stripeCustomerId = String(checkoutUser.stripeCustomerId || '');
  const matchesEmail = Boolean(expectedEmail && sessionEmail && expectedEmail === sessionEmail);
  const matchesCustomer = Boolean(
    stripeCustomerId
    && session.customer
    && String(session.customer) === stripeCustomerId
  );
  if (!matchesEmail && !matchesCustomer) {
    throw new Error('session_user_mismatch');
  }
  if (!session.customer) {
    throw new Error('session_customer_missing');
  }
  await syncUserSubscriptionByCustomer(String(session.customer));
  return session;
}

async function syncUserSubscriptionByCustomer(customerId) {
  const stripe = getStripe();
  if (!stripe || !customerId) {
    return;
  }

  const users = require('./userStore').listUsers();
  const matched = users.find((user) => user.stripeCustomerId === customerId);
  if (!matched) {
    return;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 5
  });

  const activeSub = subscriptions.data.find(
    (sub) => sub.status === 'active' || sub.status === 'trialing'
  );

  updateUser(matched.id, {
    stripeSubscriptionId: activeSub ? activeSub.id : '',
    plan: activeSub ? 'pro' : 'free'
  });
}

async function processWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    throw new Error('billing_not_configured');
  }

  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.customer) {
      await syncUserSubscriptionByCustomer(session.customer);
    }
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const subscription = event.data.object;
    if (subscription.customer) {
      await syncUserSubscriptionByCustomer(subscription.customer);
    }
  }

  return event;
}

function isBillingConfigured() {
  return Boolean(getStripe());
}

async function getBillingReadinessSnapshot() {
  const stripe = getStripe();
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  const priceId = getProPriceId();
  const appBaseUrl = getAppBaseUrl();
  const mode = secretKey.startsWith('sk_live_') ? 'live' : secretKey.startsWith('sk_test_') ? 'test' : 'unknown';
  const snapshot = {
    configured: Boolean(stripe),
    mode,
    appBaseUrl,
    checks: {
      secretKeyFormatValid: Boolean(stripe),
      webhookSecretPresent: Boolean(webhookSecret && !isPlaceholderValue(webhookSecret)),
      priceIdConfigured: Boolean(priceId)
    },
    stripeAccount: {
      reachable: false,
      id: '',
      displayName: ''
    },
    price: {
      configuredId: priceId || '',
      valid: false,
      currency: '',
      unitAmount: 0,
      recurringInterval: ''
    },
    webhook: {
      endpoint: `${appBaseUrl}/api/auth/stripe/webhook`,
      signingSecretConfigured: Boolean(webhookSecret && !isPlaceholderValue(webhookSecret))
    }
  };

  if (!stripe) {
    return snapshot;
  }

  try {
    const account = await stripe.accounts.retrieve();
    snapshot.stripeAccount = {
      reachable: true,
      id: String(account?.id || ''),
      displayName: String(account?.business_profile?.name || account?.settings?.dashboard?.display_name || '')
    };
  } catch (_error) {
    snapshot.stripeAccount.reachable = false;
  }

  if (!priceId) {
    // Inline price_data mode still works; treat as valid fallback.
    snapshot.price.valid = true;
    snapshot.price.currency = 'usd';
    snapshot.price.unitAmount = getProMonthlyAmountCents();
    snapshot.price.recurringInterval = 'month';
    return snapshot;
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    snapshot.price.valid = Boolean(price && price.id === priceId && price.active !== false);
    snapshot.price.currency = String(price?.currency || '').toLowerCase();
    snapshot.price.unitAmount = Number(price?.unit_amount || 0);
    snapshot.price.recurringInterval = String(price?.recurring?.interval || '');
  } catch (_error) {
    snapshot.price.valid = false;
  }

  return snapshot;
}

async function getStripeReadinessReport() {
  const snapshot = await getBillingReadinessSnapshot();
  const blockers = [];
  if (!snapshot.checks.secretKeyFormatValid) {
    blockers.push('STRIPE_SECRET_KEY is missing, placeholder, or invalid format.');
  }
  if (!snapshot.stripeAccount.reachable) {
    blockers.push('Could not reach Stripe account with current secret key.');
  }
  if (!snapshot.checks.webhookSecretPresent) {
    blockers.push('STRIPE_WEBHOOK_SECRET is missing.');
  }
  if (!snapshot.price.valid) {
    blockers.push('Configured STRIPE_PRICE_ID is missing/invalid/inactive.');
  }

  return {
    ready: blockers.length === 0,
    blockers,
    ...snapshot
  };
}

function getBillingPublicInfo() {
  const hasStripeApiCheckout = Boolean(getStripe());
  const priceIdConfigured = Boolean(getProPriceId());
  const checkoutMode = hasStripeApiCheckout ? 'stripe_api' : 'unconfigured';

  return {
    configured: isBillingConfigured(),
    provider: 'Stripe',
    currency: 'usd',
    amountMonthly: getProMonthlyAmountUsd(),
    recurringInterval: 'month',
    paymentMethodTypes: ['card'],
    secureCheckoutUrl: hasStripeApiCheckout ? 'https://stripe.com/security' : '',
    billingTermsUrl: hasStripeApiCheckout ? 'https://stripe.com/legal/consumer' : '',
    checkoutMode,
    priceConfigMode: priceIdConfigured ? 'price_id' : 'inline_price_data',
    checkoutHostedUrl: '',
    cancellationPolicy: 'Cancel anytime from the billing portal. Access remains active until the current period ends.'
  };
}

module.exports = {
  createCheckoutSession,
  createFundingCheckoutSession,
  createBillingPortalSession,
  confirmCheckoutSessionForUser,
  processWebhookEvent,
  getBillingPublicInfo,
  getBillingReadinessSnapshot,
  getStripeReadinessReport,
  isBillingConfigured,
  getAppBaseUrl
};
