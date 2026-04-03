#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5080';

const failures = [];
const warnings = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function warn(condition, message) {
  if (!condition) {
    warnings.push(message);
  }
}

async function fetchJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  assert(response.ok, `${path} returned HTTP ${response.status}`);
  if (!response.ok) {
    return null;
  }
  try {
    return await response.json();
  } catch (_error) {
    failures.push(`${path} returned invalid JSON`);
    return null;
  }
}

async function createAuditUserAndToken() {
  const email = `audit.${Date.now()}.${Math.floor(Math.random() * 10000)}@example.com`;
  const response = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'Audit#Pass1234!'
    })
  });
  assert(response.ok, `/api/auth/signup for audit user returned HTTP ${response.status}`);
  if (!response.ok) {
    return null;
  }
  const payload = await response.json().catch(() => null);
  const token = String(payload?.token || '').trim();
  assert(Boolean(token), 'audit user signup did not return auth token');
  return token || null;
}

async function fetchAuthedJson(path, token, options = {}) {
  const acceptableStatuses = Array.isArray(options.acceptableStatuses) && options.acceptableStatuses.length
    ? options.acceptableStatuses
    : [200];
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  const okByContract = acceptableStatuses.includes(response.status);
  assert(okByContract, `${path} (authed) returned HTTP ${response.status} (expected ${acceptableStatuses.join('|')})`);
  if (!okByContract) {
    return null;
  }
  if (response.status === 403) {
    return { __locked: true };
  }
  try {
    return await response.json();
  } catch (_error) {
    failures.push(`${path} (authed) returned invalid JSON`);
    return null;
  }
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function validateEarnings(payload) {
  if (!payload) {
    return;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  assert(items.length > 0, '/api/market/earnings-gambling returned no items');
  items.forEach((item, idx) => {
    assert(Boolean(item.ticker), `earnings[${idx}] missing ticker`);
    assert(isIsoDate(item.eventDate), `earnings[${idx}] invalid eventDate`);
    assert(Number(item.volume || 0) > 0, `earnings[${idx}] non-positive volume`);
    const up = Number(item?.predictedMove?.up || 0);
    const down = Number(item?.predictedMove?.down || 0);
    assert(up + down === 100, `earnings[${idx}] predictedMove does not sum to 100`);
    assert(['up', 'down'].includes(String(item.direction || '').toLowerCase()), `earnings[${idx}] invalid direction`);
    const reportTimeLabel = String(item.reportTimeLabel || '').toLowerCase();
    assert(
      reportTimeLabel.includes('pre-market')
        || reportTimeLabel.includes('after-hours')
        || reportTimeLabel.includes('session unconfirmed')
        || reportTimeLabel.includes('unknown'),
      `earnings[${idx}] invalid reportTimeLabel`
    );
    warn(
      Number(item.verificationScore || 0) >= 25,
      `earnings[${idx}] has low verificationScore=${item.verificationScore}`
    );
  });
}

function parseSessionWeight(reportTimeLabel) {
  const value = String(reportTimeLabel || '').toLowerCase();
  if (value.includes('pre-market')) {
    return 0;
  }
  if (value.includes('after-hours')) {
    return 1;
  }
  if (value.includes('session unconfirmed') || value.includes('unknown')) {
    return 2;
  }
  return 3;
}

function validateEarningsSessionOrdering(payload, expectationLabel) {
  if (!payload) {
    return;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length <= 1) {
    return;
  }
  for (let i = 1; i < items.length; i += 1) {
    const prev = parseSessionWeight(items[i - 1]?.reportTimeLabel);
    const curr = parseSessionWeight(items[i]?.reportTimeLabel);
    assert(prev <= curr, `${expectationLabel}: earnings session ordering is not pre-market first`);
  }
}

function validateInsider(payload) {
  if (!payload) {
    return;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  assert(items.length > 0, '/api/market/insider-trades returned no items');
  items.forEach((item, idx) => {
    assert(Boolean(item.symbol), `insider[${idx}] missing symbol`);
    assert(['buy', 'sell'].includes(String(item.side || '').toLowerCase()), `insider[${idx}] invalid side`);
    assert(Number(item.valueUsd || 0) > 0, `insider[${idx}] non-positive valueUsd`);
    assert(Number(item.shares || 0) > 0, `insider[${idx}] non-positive shares`);
    assert(Number(item.unusualVolumeMultiple || 0) > 0, `insider[${idx}] non-positive unusualVolumeMultiple`);

    const bias = item.directionalBias;
    const label = String(bias?.label || item.directionalBiasLabel || '').toLowerCase();
    assert(['bullish', 'bearish', 'neutral'].includes(label), `insider[${idx}] invalid bias label`);

    const bullish = Number(bias?.bullishPct ?? 0);
    const bearish = Number(bias?.bearishPct ?? 0);
    const neutral = Number(bias?.neutralPct ?? 0);
    assert(Number.isFinite(bullish) && Number.isFinite(bearish) && Number.isFinite(neutral), `insider[${idx}] invalid bias percentages`);
    assert(bullish + bearish + neutral === 100, `insider[${idx}] bias percentages do not sum to 100`);

  });
}

function validatePremiumSpikes(payload) {
  if (!payload) {
    return;
  }
  if (payload.__locked) {
    warn(true, 'premium spikes feed is locked behind Pro for this audit account');
    return;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  assert(items.length > 0, '/api/market/premium-spikes returned no items');
  items.forEach((item, idx) => {
    assert(Boolean(item.symbol), `premiumSpikes[${idx}] missing symbol`);
    assert(['call', 'put'].includes(String(item.premiumType || '').toLowerCase()), `premiumSpikes[${idx}] invalid premiumType`);
    assert(Number(item.spikeAmountUsd || 0) > 0, `premiumSpikes[${idx}] non-positive spikeAmountUsd`);
    assert(Number(item.spikeMultiple || 0) >= 1, `premiumSpikes[${idx}] spikeMultiple below 1`);
  });
}

function validateHighIv(payload) {
  if (!payload) {
    return;
  }
  if (payload.__locked) {
    warn(true, 'high IV feed is locked behind Pro for this audit account');
    return;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  assert(items.length > 0, '/api/market/high-iv returned no items');
  items.forEach((item, idx) => {
    assert(Boolean(item.symbol), `highIv[${idx}] missing symbol`);
    assert(Number(item.ivRank || 0) >= 1 && Number(item.ivRank || 0) <= 100, `highIv[${idx}] ivRank out of range`);
    assert(Number(item.ivPercentile || 0) >= 1 && Number(item.ivPercentile || 0) <= 100, `highIv[${idx}] ivPercentile out of range`);
  });
}

function validatePortfolios(payload) {
  if (!payload) {
    return;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  assert(items.length > 0, '/api/market/top-portfolios returned no items');
  items.forEach((item, idx) => {
    assert(Boolean(item.manager), `portfolio[${idx}] missing manager`);
    assert(Boolean(item.firm), `portfolio[${idx}] missing firm`);
    assert(Number(item.aumUsd || 0) > 0, `portfolio[${idx}] non-positive aumUsd`);
    assert(Number(item.performance?.ytdPct || 0) >= 0, `portfolio[${idx}] invalid ytdPct`);
    assert(Array.isArray(item.topHoldings), `portfolio[${idx}] missing topHoldings`);
    assert(Array.isArray(item.recentTrades), `portfolio[${idx}] missing recentTrades`);
  });
}

function validateSimpleList(path, payload) {
  if (!payload) {
    return;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  assert(items.length > 0, `${path} returned no items`);
}

function validateRealizedPatterns(payload) {
  if (!payload) {
    return;
  }
  assert(String(payload.dataNature || '').toLowerCase() === 'live', '/api/market/realized-patterns dataNature should be live');
  assert(
    String(payload.sourceDisclosure || '').toLowerCase().includes('yahoo'),
    '/api/market/realized-patterns sourceDisclosure should mention Yahoo OHLCV source'
  );
  const items = Array.isArray(payload.items) ? payload.items : [];
  assert(items.length > 0, '/api/market/realized-patterns returned no items');
  items.forEach((item, idx) => {
    assert(Boolean(item.symbol || item.ticker), `realizedPatterns[${idx}] missing symbol`);
    assert(Boolean(item.patternName), `realizedPatterns[${idx}] missing patternName`);
    const patternType = String(item.patternType || '').toLowerCase();
    assert(['volume_down', 'candlestick'].includes(patternType), `realizedPatterns[${idx}] invalid patternType`);
    const confidence = Number(item.confidence || 0);
    assert(Number.isFinite(confidence) && confidence >= 1 && confidence <= 99, `realizedPatterns[${idx}] confidence out of range`);
    const volume = Number(item.volume || 0);
    assert(Number.isFinite(volume) && volume > 0, `realizedPatterns[${idx}] non-positive volume`);
    const source = String(item.source || '').toLowerCase();
    assert(source.includes('yahoo'), `realizedPatterns[${idx}] source should indicate Yahoo OHLCV`);
    assert(Boolean(item.candleDate), `realizedPatterns[${idx}] missing candleDate`);
    const evidence = item.evidence;
    assert(Boolean(evidence) && typeof evidence === 'object', `realizedPatterns[${idx}] missing evidence object`);
  });
}

async function run() {
  const authToken = await createAuditUserAndToken();
  const endpoints = await Promise.all([
    fetchJson('/health'),
    fetchJson('/api/market/earnings-gambling?targetDate=today&includeCompleted=true&limit=8'),
    fetchJson('/api/market/earnings-gambling?targetDate=tomorrow&includeCompleted=false&limit=8'),
    fetchJson('/api/market/earnings-gambling?targetDate=tomorrow&includeCompleted=true&limit=8'),
    fetchJson('/api/market/earnings-gambling?targetDate=tomorrow&includeCompleted=false&limit=5'),
    fetchJson('/api/market/insider-trades?limit=30&sortBy=anomaly_desc&unusualOnly=false'),
    authToken ? fetchAuthedJson('/api/market/premium-spikes?limit=20', authToken, { acceptableStatuses: [200, 403] }) : Promise.resolve(null),
    authToken ? fetchAuthedJson('/api/market/high-iv?limit=20', authToken, { acceptableStatuses: [200, 403] }) : Promise.resolve(null),
    fetchJson('/api/market/top-portfolios?limit=12&sortBy=score_desc'),
    fetchJson('/api/market/realized-patterns?limit=12'),
    fetchJson('/api/market/wild-takes?limit=20'),
    fetchJson('/api/market/trend-trades-sources')
  ]);

  const [
    healthPayload,
    earningsTodayPayload,
    earningsTomorrowPayload,
    earningsTomorrowWithCompletedPayload,
    earningsTomorrowCompactPayload,
    insiderPayload,
    premiumSpikesPayload,
    highIvPayload,
    portfoliosPayload,
    realizedPatternsPayload,
    wildTakesPayload,
    trendTradeSourcesPayload
  ] = endpoints;

  assert(healthPayload?.status === 'ok', '/health status is not ok');
  validateEarnings(earningsTodayPayload);
  validateEarnings(earningsTomorrowPayload);
  validateEarnings(earningsTomorrowWithCompletedPayload);
  validateEarnings(earningsTomorrowCompactPayload);
  validateEarningsSessionOrdering(earningsTomorrowPayload, 'tomorrow includeCompleted=false');
  validateEarningsSessionOrdering(earningsTomorrowWithCompletedPayload, 'tomorrow includeCompleted=true');

  const tomorrowDate = String(earningsTomorrowPayload?.scheduleDate || '');
  const tomorrowRows = Array.isArray(earningsTomorrowPayload?.items) ? earningsTomorrowPayload.items : [];
  if (tomorrowDate && tomorrowRows.length) {
    const mismatchedDate = tomorrowRows.find((row) => String(row.eventDate || '').trim() !== tomorrowDate);
    assert(!mismatchedDate, 'tomorrow earnings payload includes rows from a different date');
  }

  validateInsider(insiderPayload);
  validatePremiumSpikes(premiumSpikesPayload);
  validateHighIv(highIvPayload);
  validatePortfolios(portfoliosPayload);
  validateRealizedPatterns(realizedPatternsPayload);
  validateSimpleList('/api/market/wild-takes', wildTakesPayload);
  assert(Array.isArray(trendTradeSourcesPayload?.options), '/api/market/trend-trades-sources missing options[]');

  if (warnings.length) {
    console.log(`WARNINGS (${warnings.length}):`);
    warnings.forEach((message) => console.log(`- ${message}`));
  } else {
    console.log('WARNINGS: none');
  }

  if (failures.length) {
    console.error(`FAILURES (${failures.length}):`);
    failures.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }

  console.log('Data integrity audit passed.');
}

run().catch((error) => {
  console.error('Audit execution failed:', error?.message || error);
  process.exit(1);
});
