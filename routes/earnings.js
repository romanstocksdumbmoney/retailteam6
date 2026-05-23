const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    data: [
      { ticker: 'AAPL', quarter: 'Q4 2025', eps: 2.18 },
      { ticker: 'MSFT', quarter: 'Q4 2025', eps: 2.92 }
    ]
  });
});

module.exports = router;
