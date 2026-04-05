const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const Stripe = require('stripe');

const PLAN_PRICE_USD = 10;
const PLAN_CODE = 'dumb-dollars-pro-monthly';

const dataDirectory = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDirectory, 'subscriptions.json');

function getReturnBaseUrl() {
  return (process.env.APP_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    const error = new Error('Missing STRIPE_SECRET_KEY.');
    error.code = 'STRIPE_NOT_CONFIGURED';
    throw error;
  }

  return new Stripe(secretKey);
}

function getStripePriceId() {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    const error = new Error('Missing STRIPE_PRICE_ID.');
    error.code = 'STRIPE_NOT_CONFIGURED';
    throw error;
  }
  return priceId;
}

async function ensureDataFile() {
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch (_error) {
    await fs.writeFile(dataFile, JSON.stringify({ subscriptions: [] }, null, 2), 'utf8');
  }
}

async function readDatabase() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.subscriptions)) {
      return { subscriptions: [] };
    }
    return parsed;
  } catch (_error) {
    return { subscriptions: [] };
  }
}

async function writeDatabase(database) {
  await ensureDataFile();
  await fs.writeFile(dataFile, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
}

function getSubscriptionTokenFromRequest(req) {
  const headerToken = req.get('x-subscription-token');
  const bearer = req.get('authorization');
  if (headerToken && headerToken.trim()) return headerToken.trim();
  if (bearer && bearer.toLowerCase().startsWith('bearer ')) {
    return bearer.slice(7).trim();
  }
  return null;
}

function toPublicSubscription(record) {
  return {
    email: record.email,
    stripeCustomerId: record.stripeCustomerId || null,
    stripeSubscriptionId: record.stripeSubscriptionId || null,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function isStripeStatusActive(status) {
  return status === 'active' || status === 'trialing';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStripeCustomerId(customer) {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  if (typeof customer.id === 'string') return customer.id;
  return null;
}

function normalizeStripeSubscriptionId(subscription) {
  if (!subscription) return null;
  if (typeof subscription === 'string') return subscription;
  if (typeof subscription.id === 'string') return subscription.id;
  return null;
}

async function upsertSubscriptionRecord({
  email,
  stripeCustomerId,
  stripeSubscriptionId,
  status,
}) {
  const database = await readDatabase();
  const normalizedEmail = normalizeEmail(email);
  const now = new Date().toISOString();

  let record = database.subscriptions.find((item) => {
    if (stripeSubscriptionId && item.stripeSubscriptionId === stripeSubscriptionId) return true;
    if (stripeCustomerId && item.stripeCustomerId === stripeCustomerId) return true;
    if (normalizedEmail && item.email === normalizedEmail) return true;
    return false;
  });

  if (!record) {
    record = {
      token: `sub_${randomUUID()}`,
      email: normalizedEmail || null,
      stripeCustomerId: stripeCustomerId || null,
      stripeSubscriptionId: stripeSubscriptionId || null,
      status: status || 'incomplete',
      createdAt: now,
      updatedAt: now,
    };
    database.subscriptions.push(record);
  } else {
    if (normalizedEmail) record.email = normalizedEmail;
    if (stripeCustomerId) record.stripeCustomerId = stripeCustomerId;
    if (stripeSubscriptionId) record.stripeSubscriptionId = stripeSubscriptionId;
    if (status) record.status = status;
    if (!record.token) record.token = `sub_${randomUUID()}`;
    if (!record.createdAt) record.createdAt = now;
    record.updatedAt = now;
  }

  await writeDatabase(database);
  return record;
}

async function createCheckoutSession({ email }) {
  const stripe = getStripeClient();
  const priceId = getStripePriceId();
  const baseUrl = getReturnBaseUrl();
  const normalizedEmail = normalizeEmail(email);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: normalizedEmail || undefined,
    success_url: `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?checkout=cancelled`,
    metadata: {
      planCode: PLAN_CODE,
    },
    allow_promotion_codes: true,
  });

  return {
    id: session.id,
    url: session.url,
  };
}

async function confirmCheckoutSession(sessionId) {
  if (!sessionId) {
    const error = new Error('sessionId is required.');
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });

  if (session.mode !== 'subscription') {
    const error = new Error('Checkout session is not a subscription.');
    error.code = 'INVALID_SESSION_MODE';
    throw error;
  }

  const subscriptionId = normalizeStripeSubscriptionId(session.subscription);
  if (!subscriptionId) {
    const error = new Error('Checkout session does not have a subscription yet.');
    error.code = 'SUBSCRIPTION_MISSING';
    throw error;
  }

  const subscription = typeof session.subscription === 'string'
    ? await stripe.subscriptions.retrieve(session.subscription)
    : session.subscription;

  const status = subscription.status;
  if (!isStripeStatusActive(status)) {
    const error = new Error(`Subscription is not active (status: ${status}).`);
    error.code = 'SUBSCRIPTION_NOT_ACTIVE';
    throw error;
  }

  const customerId = normalizeStripeCustomerId(session.customer);
  const customerEmail = normalizeEmail(
    session.customer_details?.email
      || session.customer_email
      || session.customer?.email
      || ''
  );

  const record = await upsertSubscriptionRecord({
    email: customerEmail,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    status,
  });

  return {
    token: record.token,
    subscription: toPublicSubscription(record),
  };
}

async function applyStripeSubscriptionUpdate({
  subscriptionId,
  customerId,
  status,
  email,
}) {
  if (!subscriptionId && !customerId && !email) return null;
  return upsertSubscriptionRecord({
    email: normalizeEmail(email),
    stripeCustomerId: customerId || null,
    stripeSubscriptionId: subscriptionId || null,
    status: status || 'incomplete',
  });
}

async function handleStripeWebhook(rawBody, signature) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    const error = new Error('Missing STRIPE_WEBHOOK_SECRET.');
    error.code = 'STRIPE_NOT_CONFIGURED';
    throw error;
  }

  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    await applyStripeSubscriptionUpdate({
      subscriptionId: normalizeStripeSubscriptionId(session.subscription),
      customerId: normalizeStripeCustomerId(session.customer),
      status: 'active',
      email: normalizeEmail(session.customer_details?.email || session.customer_email),
    });
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    await applyStripeSubscriptionUpdate({
      subscriptionId: subscription.id,
      customerId: normalizeStripeCustomerId(subscription.customer),
      status: subscription.status,
    });
  }

  return { eventType: event.type };
}

async function getSubscriptionStatus(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    return {
      active: false,
      subscription: null,
      reason: 'missing_token',
      monthlyPriceUsd: PLAN_PRICE_USD,
      planCode: PLAN_CODE,
    };
  }

  const database = await readDatabase();
  const record = database.subscriptions.find((item) => item.token === normalizedToken);
  if (!record) {
    return {
      active: false,
      subscription: null,
      reason: 'unknown_token',
      monthlyPriceUsd: PLAN_PRICE_USD,
      planCode: PLAN_CODE,
    };
  }

  const active = isStripeStatusActive(record.status);
  return {
    active,
    subscription: toPublicSubscription(record),
    token: active ? normalizedToken : null,
    monthlyPriceUsd: PLAN_PRICE_USD,
    planCode: PLAN_CODE,
  };
}

async function isSubscriptionActive(token) {
  const status = await getSubscriptionStatus(token);
  return status.active;
}

module.exports = {
  PLAN_PRICE_USD,
  PLAN_CODE,
  getReturnBaseUrl,
  createCheckoutSession,
  confirmCheckoutSession,
  getSubscriptionTokenFromRequest,
  getSubscriptionStatus,
  isSubscriptionActive,
  handleStripeWebhook,
};
