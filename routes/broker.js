const express = require('express');
const { parseAuthToken } = require('../services/authService');
const {
  getUserById,
  findUserByEmail,
  setUserAiTraderSetupById
} = require('../services/userStore');
const {
  connectAutoTraderBrokerBridge,
  testAutoTraderBrokerBridge,
  getAutoTraderAccountView
} = require('../services/autoTraderService');

const router = express.Router();

const SETUP_STEP_KEYS = Object.freeze([
  'accountCreated',
  'settingsSaved',
  'brokerageReady',
  'brokerConnected',
  'botStartedOnce'
]);

function requireSignedIn(req, res, next) {
  const parsed = parseAuthToken(req.header('authorization'));
  if (!parsed.ok) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Sign in to connect a broker.'
    });
  }
  let user = getUserById(parsed.userId);
  if (!user && parsed.email) {
    user = findUserByEmail(parsed.email);
  }
  if (!user) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Your account session expired. Please sign in again.'
    });
  }
  req.user = user;
  return next();
}

function normalizeBroker(rawBroker) {
  const value = String(rawBroker || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  if (!value) {
    return 'alpaca';
  }
  if (value === 'tradier') {
    return 'tradestation';
  }
  if (value === 'ibkr' || value === 'interactivebrokers' || value === 'interactive-broker') {
    return 'interactive-brokers';
  }
  return value;
}

function getPersistedSteps(user) {
  const rawSteps = user?.aiTraderSetup?.steps || {};
  return SETUP_STEP_KEYS.reduce((acc, key) => {
    acc[key] = Boolean(rawSteps[key]);
    return acc;
  }, {});
}

function persistBrokerSteps(req, patch = {}) {
  const userId = req.user?.id;
  if (!userId) {
    return null;
  }
  const current = getPersistedSteps(req.user);
  const merged = {
    ...current,
    accountCreated: true,
    ...Object.entries(patch).reduce((acc, [key, value]) => {
      if (SETUP_STEP_KEYS.includes(key)) {
        acc[key] = Boolean(value);
      }
      return acc;
    }, {})
  };
  const completed = SETUP_STEP_KEYS.every((key) => merged[key]);
  const updated = setUserAiTraderSetupById(userId, {
    steps: merged,
    completed,
    completedAt: completed ? new Date().toISOString() : null
  });
  if (updated?.aiTraderSetup) {
    req.user.aiTraderSetup = updated.aiTraderSetup;
  }
  return updated?.aiTraderSetup || null;
}

function mapConnectError(error) {
  const code = String(error?.message || '');
  if (code === 'invalid_broker' || code === 'invalid_broker_connection') {
    return { status: 400, error: 'invalid_broker', message: 'Choose a supported broker first.' };
  }
  if (code === 'invalid_api_credentials' || code === 'invalid_alpaca_api_credentials') {
    return { status: 400, error: 'invalid_api_credentials', message: 'API key and secret key are required.' };
  }
  if (code === 'invalid_broker_permissions') {
    return { status: 400, error: 'invalid_broker_permissions', message: 'Enable read, account, and trading API permissions on your broker.' };
  }
  if (code === 'validate_real_broker_connection_failed') {
    return {
      status: 400,
      error: 'broker_connection_failed',
      message: error?.details?.message || 'Broker API validation failed. Check your keys and account mode.'
    };
  }
  return {
    status: 400,
    error: code || 'invalid_request',
    message: 'Could not connect broker profile.'
  };
}

function mapCheckLabel(rawLabel) {
  const value = String(rawLabel || '').toLowerCase();
  if (value.includes('credentials')) {
    return 'Verifying API keys';
  }
  if (value.includes('method') || value.includes('2fa')) {
    return 'Checking authentication method';
  }
  if (value.includes('permissions')) {
    return 'Checking permissions';
  }
  if (value.includes('bridge')) {
    return 'Verifying execution bridge';
  }
  if (value.includes('funding')) {
    return 'Checking buying power';
  }
  if (value.includes('live mode')) {
    return 'Checking trading mode';
  }
  if (value.includes('handshake')) {
    return 'Accessing account';
  }
  return String(rawLabel || 'Running broker check');
}

router.post('/connect', requireSignedIn, async (req, res) => {
  try {
    const broker = normalizeBroker(req.body?.broker);
    const accountId = String(
      req.body?.account_id
      || req.body?.accountId
      || req.body?.account_label
      || req.body?.accountLabel
      || `${broker}-acct-${Date.now().toString(36)}`
    ).trim().slice(0, 80);
    const mode = String(req.body?.mode || req.body?.paper_live_mode || 'paper').trim().toLowerCase();
    const payload = await connectAutoTraderBrokerBridge(req.user, {
      broker,
      accountId,
      connectionMethod: 'api_keys',
      apiKey: String(req.body?.api_key || req.body?.apiKey || '').trim(),
      apiSecret: String(req.body?.secret_key || req.body?.secretKey || '').trim(),
      bridgeMode: 'broker_linked',
      canRead: true,
      canTrade: true,
      canViewAccount: true,
      riskAcknowledged: true,
      executionMode: 'broker_linked',
      paymentRail: 'broker_api',
      authMethod: 'api_keys',
      tradingMode: mode
    });
    return res.json({
      connected: true,
      message: 'Broker profile saved. Run connection test to finish setup.',
      broker: payload?.broker || broker,
      connection: payload?.current || null
    });
  } catch (error) {
    const mapped = mapConnectError(error);
    return res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message
    });
  }
});

router.post('/test', requireSignedIn, async (req, res) => {
  try {
    const broker = normalizeBroker(req.body?.broker);
    const payload = await testAutoTraderBrokerBridge(req.user, { broker });
    const accountView = getAutoTraderAccountView(req.user);
    const buyingPower = Number(accountView?.portfolio?.cashUsd || 0);
    const checks = (Array.isArray(payload?.checks) ? payload.checks : []).map((check) => ({
      key: String(check?.key || ''),
      label: mapCheckLabel(check?.label || ''),
      ok: Boolean(check?.ok),
      detail: String(check?.detail || '')
    }));
    if (payload?.bridgeReady) {
      persistBrokerSteps(req, {
        brokerageReady: true,
        brokerConnected: true
      });
    }
    const firstFailure = checks.find((check) => !check.ok);
    return res.json({
      broker: payload?.broker || broker,
      testedAt: payload?.testedAt || new Date().toISOString(),
      bridgeReady: Boolean(payload?.bridgeReady),
      readyForTrading: Boolean(payload?.readyForTrading),
      buyingPowerUsd: buyingPower,
      checks,
      successMessage: payload?.bridgeReady
        ? `Broker connected. Buying power: $${Math.max(0, buyingPower).toLocaleString()}`
        : null,
      failure: firstFailure
        ? {
          check: firstFailure.label,
          explanation: firstFailure.detail || 'This check failed. Review API keys and permissions, then retry.'
        }
        : null
    });
  } catch (error) {
    const mapped = mapConnectError(error);
    return res.status(mapped.status).json({
      error: mapped.error,
      message: mapped.message
    });
  }
});

module.exports = router;
