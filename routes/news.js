const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    items: [
      {
        id: 1,
        title: 'Welcome to A app',
        summary: 'This is a starter news payload from the API.'
      }
    ]
  });
});

module.exports = router;
