const express = require('express');
const { handleStripeWebhook } = require('../services/subscriptionService');

const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.get('stripe-signature');
    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature header.' });
      return;
    }

    const result = await handleStripeWebhook(req.body, signature);
    res.status(200).json({ received: true, eventType: result.eventType });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
