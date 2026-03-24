const Stripe = require('stripe');
const { getUserById, updateUser } = require('./userStore');

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || !secretKey.startsWith('sk_')) {
    return null;
  }
  return new Stripe(secretKey, { apiVersion: '2024-06-20' });
}

function getAppBaseUrl() {
  return process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
}

function getProPriceId() {
  return process.env.STRIPE_PRICE_ID || '';
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

async function createCheckoutSession(user) {
  const stripe = getStripe();
  const priceId = getProPriceId();
  if (!stripe || !priceId) {
    throw new Error('billing_not_configured');
  }

  const customerId = await ensureStripeCustomer(user);
  const base = getAppBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/?checkout=success`,
    cancel_url: `${base}/?checkout=cancelled`,
    metadata: { userId: user.id }
  });

  return session;
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
  return Boolean(getStripe() && getProPriceId());
}

function getBillingPublicInfo() {
  return {
    configured: isBillingConfigured(),
    provider: 'Stripe',
    currency: 'usd',
    amountMonthly: 15,
    recurringInterval: 'month',
    paymentMethodTypes: ['card'],
    secureCheckoutUrl: 'https://stripe.com/security',
    billingTermsUrl: 'https://stripe.com/legal/consumer',
    cancellationPolicy: 'Cancel anytime from the billing portal. Access remains active until the current period ends.'
  };
}

module.exports = {
  createCheckoutSession,
  createBillingPortalSession,
  processWebhookEvent,
  getBillingPublicInfo,
  isBillingConfigured,
  getAppBaseUrl
};
