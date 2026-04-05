const express = require('express');
const {
  PLAN_PRICE_USD,
  PLAN_CODE,
  createCheckoutSession,
  confirmCheckoutSession,
  getSubscriptionStatus,
  getSubscriptionTokenFromRequest,
} = require('../services/subscriptionService');

const router = express.Router();

router.get('/plan', (_req, res) => {
  res.json({
    planCode: PLAN_CODE,
    monthlyPriceUsd: PLAN_PRICE_USD,
    billingPeriod: 'month',
  });
});

router.post('/checkout', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const session = await createCheckoutSession({ email });
    res.status(201).json({
      planCode: PLAN_CODE,
      monthlyPriceUsd: PLAN_PRICE_USD,
      checkout: session,
    });
  } catch (error) {
    const status = error.code === 'STRIPE_NOT_CONFIGURED' ? 503 : 400;
    res.status(status).json({ error: error.message });
  }
});

router.post('/confirm', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const confirmed = await confirmCheckoutSession(sessionId);
    res.status(200).json({
      planCode: PLAN_CODE,
      monthlyPriceUsd: PLAN_PRICE_USD,
      token: confirmed.token,
      subscription: confirmed.subscription,
    });
  } catch (error) {
    const status = (
      error.code === 'SUBSCRIPTION_NOT_ACTIVE'
      || error.code === 'SUBSCRIPTION_MISSING'
      || error.code === 'INVALID_SESSION_MODE'
      || error.code === 'INVALID_REQUEST'
    ) ? 400 : 503;
    res.status(status).json({ error: error.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const token = getSubscriptionTokenFromRequest(req);
    const status = await getSubscriptionStatus(token);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
