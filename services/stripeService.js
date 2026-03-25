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

function getHostedCheckoutFallbackUrl() {
  const fallbackUrl = String(
    process.env.PAYMENT_CHECKOUT_FALLBACK_URL
      || process.env.CHECKOUT_FALLBACK_URL
      || ''
  ).trim();

  if (!fallbackUrl || isPlaceholderValue(fallbackUrl)) {
    return '/hosted-checkout.html';
  }

  if (fallbackUrl.startsWith('/')) {
    return fallbackUrl;
  }

  try {
    const parsed = new URL(fallbackUrl);
    const isHttps = parsed.protocol === 'https:';
    const isLocalHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (!isHttps && !isLocalHttp) {
      return '';
    }
    return parsed.toString();
  } catch (_error) {
    return '';
  }
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

function resolveCheckoutUser(user = {}) {
  const fallbackEmail = String(process.env.CHECKOUT_GUEST_EMAIL || 'guest-checkout@dumbdollars.local').trim().toLowerCase();
  return {
    id: user.id || 'guest-checkout',
    email: user.email || fallbackEmail,
    stripeCustomerId: user.stripeCustomerId || null
  };
}

async function createCheckoutSession(user) {
  const stripe = getStripe();
  const priceId = getProPriceId();
  if (!stripe || !priceId) {
    const hostedFallbackUrl = getHostedCheckoutFallbackUrl();
    if (hostedFallbackUrl) {
      return {
        url: hostedFallbackUrl
      };
    }
    throw new Error('billing_not_configured');
  }

  const checkoutUser = resolveCheckoutUser(user);
  const customerId = await ensureStripeCustomer(checkoutUser);
  const base = getAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/?checkout=success`,
    cancel_url: `${base}/?checkout=cancelled`,
    metadata: { userId: checkoutUser.id }
  });

  return session;
}

function createHostedCheckoutSession() {
  const hostedFallbackUrl = getHostedCheckoutFallbackUrl();
  if (!hostedFallbackUrl) {
    throw new Error('hosted_checkout_not_configured');
  }
  return {
    url: hostedFallbackUrl
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
  return Boolean((getStripe() && getProPriceId()) || getHostedCheckoutFallbackUrl());
}

function getBillingPublicInfo() {
  const hasStripeApiCheckout = Boolean(getStripe() && getProPriceId());
  const hostedCheckoutUrl = getHostedCheckoutFallbackUrl();
  const checkoutMode = hasStripeApiCheckout
    ? 'stripe_api'
    : hostedCheckoutUrl
      ? 'hosted_url'
      : 'unconfigured';

  return {
    configured: isBillingConfigured(),
    provider: hasStripeApiCheckout ? 'Stripe' : hostedCheckoutUrl ? 'DumbDollars Hosted Checkout' : 'Stripe',
    currency: 'usd',
    amountMonthly: 15,
    recurringInterval: 'month',
    paymentMethodTypes: ['card'],
    secureCheckoutUrl: hasStripeApiCheckout ? 'https://stripe.com/security' : hostedCheckoutUrl || '',
    billingTermsUrl: hasStripeApiCheckout ? 'https://stripe.com/legal/consumer' : '',
    checkoutMode,
    checkoutHostedUrl: hostedCheckoutUrl || '',
    cancellationPolicy: hasStripeApiCheckout
      ? 'Cancel anytime from the billing portal. Access remains active until the current period ends.'
      : 'Cancel policy is managed by the hosted checkout provider.'
  };
}

module.exports = {
  createCheckoutSession,
  createHostedCheckoutSession,
  createBillingPortalSession,
  processWebhookEvent,
  getBillingPublicInfo,
  isBillingConfigured,
  getAppBaseUrl
};
