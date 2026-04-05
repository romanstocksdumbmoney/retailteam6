const express = require('express');
const { news } = require('../data/mockData');

const router = express.Router();

router.get('/news', (req, res) => {
    const { symbol, sentiment, limit } = req.query;
    const parsedLimit = Number.parseInt(limit, 10);

    let results = [...news];

    if (symbol) {
        const normalizedSymbol = symbol.trim().toUpperCase();
        results = results.filter((item) => item.symbol === normalizedSymbol);
    }

    if (sentiment) {
        const normalizedSentiment = sentiment.trim().toLowerCase();
        results = results.filter((item) => item.sentiment === normalizedSentiment);
    }

    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
        results = results.slice(0, parsedLimit);
    }

    res.json({
        count: results.length,
        items: results
    });
});

module.exports = router;
