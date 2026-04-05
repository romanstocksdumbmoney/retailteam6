const express = require('express');
const { earnings } = require('../data/mockData');

const router = express.Router();

router.get('/earnings', (req, res) => {
    const { upcoming } = req.query;
    const now = new Date();

    let results = [...earnings];

    if (upcoming === 'true') {
        results = results.filter((item) => new Date(item.reportDate) >= now);
    }

    res.json({
        count: results.length,
        items: results
    });
});

router.get('/earnings/:symbol', (req, res) => {
    const symbol = req.params.symbol.trim().toUpperCase();
    const match = earnings.find((item) => item.symbol === symbol);

    if (!match) {
        return res.status(404).json({
            error: `No earnings data found for symbol: ${symbol}`
        });
    }

    return res.json(match);
});

module.exports = router;
