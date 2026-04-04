const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    items: [
      {
        id: 1,
        title: 'Welcome to DumbDollars',
        summary: 'DumbDollars tracks market flow, probabilities, and earnings setups in one dashboard.'
      }
    ]
  });
});

module.exports = router;
