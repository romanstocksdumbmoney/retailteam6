const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

test('GET /api/health returns status payload', async () => {
    const response = await request(app).get('/api/health');

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, 'ok');
    assert.equal(response.body.service, 'retailteam6-api');
    assert.ok(response.body.timestamp);
});

test('GET /api/news filters by symbol', async () => {
    const response = await request(app).get('/api/news?symbol=aapl');

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.count, 1);
    assert.equal(response.body.items[0].symbol, 'AAPL');
});

test('GET /api/earnings/:symbol returns 404 for unknown ticker', async () => {
    const response = await request(app).get('/api/earnings/xxxx');

    assert.equal(response.statusCode, 404);
    assert.match(response.body.error, /No earnings data found/);
});
