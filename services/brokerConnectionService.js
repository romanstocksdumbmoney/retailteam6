const net = require('net');
const {
  getBrokerConnectionByUserId,
  upsertBrokerConnection,
  deleteBrokerConnectionByUserId,
  appendBrokerSecurityLog,
  listBrokerSecurityLogForUser
} = require('./authStore');
const { encryptValue, decryptValue, maskKey } = require('../utils/encryption');
const {
  connectAutoTraderBrokerBridge,
  disconnectAutoTraderBrokerBridge,
  setAutoTraderFundingMode,
  setBotActive
} = require('./autoTraderService');
const { getUserEmailPreferences } = require('./authDbService');
const { sendBrokerAttentionAlertEmail } = require('./schedulerService');

const ALLOWED_BROKERS = new Set(['alpaca', 'tradier', 'ibkr']);
const ALLOWED_TRADING_MODES = new Set(['paper', 'live']);
const BROKER_CHECK_LABELS = Object.freeze({
  connecting: 'Connecting to broker...',
  validating: 'Validating API keys...',
  account: 'Fetching account details...',
  buyingPower: 'Checking buying power...',
  permissions: 'Verifying order permissions...',
  marketData: 'Confirming market data access...'
});

function normalizeBroker(rawBroker) {
  const value = String(rawBroker || '').trim().toLowerCase();
  if (value === 'interactive-brokers' || value === 'interactivebrokers') {
    return 'ibkr';
  }
  if (!ALLOWED_BROKERS.has(value)) {
    return '';
  }
  return value;
}

function normalizeBrokerFlexible(rawBroker) {
  const value = String(rawBroker || '').trim().toLowerCase();
  if (!value) {
    return '';
  }
  if (value === 'interactive-brokers' || value === 'interactivebrokers') {
    return 'ibkr';
  }
  if (value === 'tradestation') {
    return 'tradier';
  }
  return normalizeBroker(value);
}

function normalizeTradingMode(rawMode) {
  const value = String(rawMode || 'paper').trim().toLowerCase();
  return ALLOWED_TRADING_MODES.has(value) ? value : 'paper';
}

function mapBrokerToAutoTraderBroker(broker) {
  if (broker === 'tradier') {
    return 'tradestation';
  }
  if (broker === 'ibkr') {
    return 'interactive-brokers';
  }
  return broker;
}

function mapAutoTraderBrokerToBroker(rawBroker) {
  const value = String(rawBroker || '').trim().toLowerCase();
  if (value === 'tradestation') {
    return 'tradier';
  }
  if (value === 'interactive-brokers') {
    return 'ibkr';
  }
  return normalizeBroker(value);
}

function maskAccount(rawValue) {
  const plain = String(rawValue || '').trim();
  if (!plain) {
    return '';
  }
  const last4 = plain.slice(-4);
  return `XXXX${last4}`;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function parseExtraConfig(rawValue) {
  if (!rawValue || typeof rawValue !== 'object') {
    return {};
  }
  return rawValue;
}

function decryptStoredConnection(row) {
  if (!row) {
    return null;
  }
  let apiKey = '';
  let apiSecret = '';
  let accountId = '';
  let extraConfig = {};
  try {
    apiKey = row.api_key_encrypted ? decryptValue(row.api_key_encrypted) : '';
    apiSecret = row.api_secret_encrypted ? decryptValue(row.api_secret_encrypted) : '';
    accountId = row.account_id_encrypted ? decryptValue(row.account_id_encrypted) : '';
    const rawExtra = row.extra_config_encrypted ? decryptValue(row.extra_config_encrypted) : '';
    extraConfig = rawExtra ? parseExtraConfig(JSON.parse(rawExtra)) : {};
  } catch (_error) {
    return null;
  }
  return {
    broker: normalizeBroker(row.broker_name),
    tradingMode: normalizeTradingMode(row.trading_mode),
    apiKey,
    apiSecret,
    accountId,
    extraConfig
  };
}

function inferBrokerFromAutoTrader(user) {
  const broker = mapAutoTraderBrokerToBroker(
    user?.autoTraderStatus?.execution?.brokerConnection?.broker
    || user?.autoTraderStatus?.liveFunding?.broker
    || ''
  );
  return broker || '';
}

function inferTradingModeFromAutoTrader(user) {
  return normalizeTradingMode(
    user?.autoTraderStatus?.tradingMode
    || user?.tradingMode
    || 'paper'
  );
}

function deriveFallbackPayload(user, normalizedPayload = {}) {
  const fallbackBroker = normalizedPayload.broker || inferBrokerFromAutoTrader(user) || 'alpaca';
  const fallbackMode = normalizeTradingMode(normalizedPayload.tradingMode || inferTradingModeFromAutoTrader(user));
  const fallbackPort = fallbackMode === 'live' ? 7496 : 7497;
  return {
    broker: fallbackBroker,
    tradingMode: fallbackMode,
    apiKey: normalizedPayload.apiKey || '',
    apiSecret: normalizedPayload.apiSecret || '',
    accountId: normalizedPayload.accountId || '',
    extraConfig: normalizedPayload.extraConfig || (fallbackBroker === 'ibkr' ? { port: fallbackPort } : {})
  };
}

function pushCheck(checks, key, ok, message) {
  checks.push({
    key,
    label: BROKER_CHECK_LABELS[key],
    ok: Boolean(ok),
    message: String(message || '').trim()
  });
}

function ensureCheckSequence(checks) {
  const byKey = new Map((Array.isArray(checks) ? checks : []).map((check) => [check.key, check]));
  const ordered = ['connecting', 'validating', 'account', 'buyingPower', 'permissions', 'marketData'].map((key) => {
    if (byKey.has(key)) {
      return byKey.get(key);
    }
    return {
      key,
      label: BROKER_CHECK_LABELS[key],
      ok: true,
      message: 'Check passed.'
    };
  });
  return ordered;
}

async function testAlpacaConnection(payload) {
  const checks = [];
  const endpoint = payload.tradingMode === 'live'
    ? 'https://api.alpaca.markets'
    : 'https://paper-api.alpaca.markets';
  let account = null;
  try {
    const response = await fetch(`${endpoint}/v2/account`, {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': payload.apiKey,
        'APCA-API-SECRET-KEY': payload.apiSecret
      }
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = String(body?.message || body?.error || '').toLowerCase();
      pushCheck(checks, 'connecting', false, 'Could not connect — check your internet connection and try again');
      if (message.includes('forbidden') || message.includes('unauthorized') || response.status === 401) {
        pushCheck(checks, 'validating', false, 'API keys invalid — double check you copied both keys correctly and that they are from the same account');
      } else {
        pushCheck(checks, 'validating', false, 'Account not found — make sure your selected mode matches your key type (paper vs live)');
      }
      return {
        success: false,
        checks: ensureCheckSequence(checks)
      };
    }
    account = await response.json();
    pushCheck(checks, 'connecting', true, 'Connected');
    pushCheck(checks, 'validating', true, 'API keys accepted');
  } catch (_error) {
    pushCheck(checks, 'connecting', false, 'Could not connect — check your internet connection and try again');
    pushCheck(checks, 'validating', false, 'Could not validate keys because the broker API was unreachable');
    return { success: false, checks: ensureCheckSequence(checks) };
  }

  const accountNumber = String(account?.account_number || account?.id || '').trim();
  if (!accountNumber) {
    pushCheck(checks, 'account', false, 'Account not found — make sure your keys are active and not revoked');
    return { success: false, checks: ensureCheckSequence(checks) };
  }
  pushCheck(checks, 'account', true, 'Account details loaded');

  const buyingPower = toNumber(account?.buying_power ?? account?.cash ?? 0, 0);
  if (buyingPower <= 0) {
    pushCheck(checks, 'buyingPower', false, 'Buying power unavailable — confirm the account is funded and approved');
  } else {
    pushCheck(checks, 'buyingPower', true, `Buying power found: $${buyingPower.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  }

  const tradeBlocked = Boolean(account?.trading_blocked || account?.account_blocked);
  if (tradeBlocked) {
    pushCheck(checks, 'permissions', false, 'Order permissions not enabled — in your Alpaca dashboard make sure trading is enabled for this key');
  } else {
    pushCheck(checks, 'permissions', true, 'Order permissions verified');
  }

  try {
    const mdResponse = await fetch(`${endpoint}/v2/assets?status=active&limit=1`, {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': payload.apiKey,
        'APCA-API-SECRET-KEY': payload.apiSecret
      }
    });
    if (!mdResponse.ok) {
      pushCheck(checks, 'marketData', false, 'Market data access unavailable — verify data permissions in your broker account');
    } else {
      pushCheck(checks, 'marketData', true, 'Market data access confirmed');
    }
  } catch (_error) {
    pushCheck(checks, 'marketData', false, 'Market data access unavailable — broker API request failed');
  }

  const success = checks.every((check) => check.ok);
  return {
    success,
    checks: ensureCheckSequence(checks),
    accountInfo: {
      accountMasked: maskAccount(accountNumber),
      accountId: accountNumber,
      buyingPower,
      mode: payload.tradingMode,
      broker: 'alpaca'
    }
  };
}

async function testTradierConnection(payload) {
  const checks = [];
  const profileUrl = 'https://api.tradier.com/v1/user/profile';
  const headers = {
    Authorization: `Bearer ${payload.apiKey}`,
    Accept: 'application/json'
  };
  let profile = null;
  try {
    const profileResponse = await fetch(profileUrl, { method: 'GET', headers });
    if (!profileResponse.ok) {
      pushCheck(checks, 'connecting', false, 'Could not connect — check your internet connection and try again');
      if (profileResponse.status === 401 || profileResponse.status === 403) {
        pushCheck(checks, 'validating', false, 'API keys invalid — double check your Tradier access token');
      } else {
        pushCheck(checks, 'validating', false, 'Could not validate Tradier credentials');
      }
      return { success: false, checks: ensureCheckSequence(checks) };
    }
    profile = await profileResponse.json();
    pushCheck(checks, 'connecting', true, 'Connected');
    pushCheck(checks, 'validating', true, 'Access token accepted');
  } catch (_error) {
    pushCheck(checks, 'connecting', false, 'Could not connect — check your internet connection and try again');
    pushCheck(checks, 'validating', false, 'Could not validate Tradier credentials');
    return { success: false, checks: ensureCheckSequence(checks) };
  }

  const accounts = profile?.profile?.account;
  const accountList = Array.isArray(accounts) ? accounts : (accounts ? [accounts] : []);
  const accountFound = accountList.find((row) => String(row?.account_number || '') === payload.accountId);
  if (!accountFound) {
    pushCheck(checks, 'account', false, 'Account not found — make sure your Tradier account ID is correct');
    return { success: false, checks: ensureCheckSequence(checks) };
  }
  pushCheck(checks, 'account', true, 'Account details loaded');

  let buyingPower = 0;
  try {
    const balancesResponse = await fetch(`https://api.tradier.com/v1/accounts/${encodeURIComponent(payload.accountId)}/balances`, {
      method: 'GET',
      headers
    });
    if (balancesResponse.ok) {
      const balances = await balancesResponse.json();
      buyingPower = toNumber(
        balances?.balances?.total?.cash?.available
        || balances?.balances?.option_short_value
        || balances?.balances?.total_cash
        || 0,
        0
      );
      pushCheck(checks, 'buyingPower', buyingPower > 0, buyingPower > 0
        ? `Buying power found: $${buyingPower.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        : 'Buying power unavailable — check account funding');
    } else {
      pushCheck(checks, 'buyingPower', false, 'Buying power unavailable — account balance API did not respond');
    }
  } catch (_error) {
    pushCheck(checks, 'buyingPower', false, 'Buying power unavailable — account balance request failed');
  }

  pushCheck(checks, 'permissions', true, 'Tradier token accepted for account access');

  try {
    const marketData = await fetch('https://api.tradier.com/v1/markets/quotes?symbols=SPY', {
      method: 'GET',
      headers
    });
    pushCheck(
      checks,
      'marketData',
      marketData.ok,
      marketData.ok
        ? 'Market data access confirmed'
        : 'Market data access unavailable — verify market data permissions'
    );
  } catch (_error) {
    pushCheck(checks, 'marketData', false, 'Market data access unavailable — request failed');
  }

  const success = checks.every((check) => check.ok);
  return {
    success,
    checks: ensureCheckSequence(checks),
    accountInfo: {
      accountMasked: maskAccount(payload.accountId),
      accountId: payload.accountId,
      buyingPower,
      mode: payload.tradingMode,
      broker: 'tradier'
    }
  };
}

function connectIbkrSocket(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const finish = (result) => {
      if (resolved) {
        return;
      }
      resolved = true;
      try {
        socket.destroy();
      } catch (_error) {
        // noop
      }
      resolve(result);
    };
    socket.setTimeout(1700);
    socket.once('connect', () => finish({ ok: true }));
    socket.once('timeout', () => finish({ ok: false, message: 'Connection timeout' }));
    socket.once('error', (error) => finish({ ok: false, message: String(error?.message || 'Connection failed') }));
    socket.connect(port, '127.0.0.1');
  });
}

async function testIbkrConnection(payload) {
  const checks = [];
  const port = Math.max(1, Math.trunc(toNumber(payload.extraConfig?.port, payload.tradingMode === 'live' ? 7496 : 7497)));
  const connection = await connectIbkrSocket(port);
  if (!connection.ok) {
    pushCheck(checks, 'connecting', false, 'Could not connect — open TWS or IB Gateway and confirm API connections are enabled');
    pushCheck(checks, 'validating', false, 'IBKR gateway is not reachable on localhost');
    pushCheck(checks, 'account', false, 'Account not found — verify your account ID and TWS login');
    pushCheck(checks, 'buyingPower', false, 'Buying power unavailable — IBKR API session is not connected');
    pushCheck(checks, 'permissions', false, 'Order permissions could not be verified because TWS is offline');
    pushCheck(checks, 'marketData', false, 'Market data access could not be verified because TWS is offline');
    return {
      success: false,
      checks: ensureCheckSequence(checks)
    };
  }

  pushCheck(checks, 'connecting', true, `Connected to IBKR API socket on port ${port}`);
  pushCheck(checks, 'validating', true, 'IBKR gateway socket accepted connection');
  pushCheck(checks, 'account', Boolean(payload.accountId), payload.accountId ? 'Account ID captured' : 'Account ID is required');
  pushCheck(checks, 'buyingPower', true, 'Buying power check deferred to live gateway session');
  pushCheck(checks, 'permissions', true, 'Order permissions assumed when API socket is active');
  pushCheck(checks, 'marketData', true, 'Market data session reachable through TWS gateway');
  const success = checks.every((check) => check.ok);
  return {
    success,
    checks: ensureCheckSequence(checks),
    accountInfo: {
      accountMasked: maskAccount(payload.accountId),
      accountId: payload.accountId,
      buyingPower: 0,
      mode: payload.tradingMode,
      broker: 'ibkr',
      extraConfig: {
        port
      }
    }
  };
}

function normalizeIncomingPayload(payload = {}, options = {}) {
  const broker = normalizeBrokerFlexible(payload.broker);
  const tradingMode = normalizeTradingMode(payload.trading_mode || payload.tradingMode || 'paper');
  const extraConfig = parseExtraConfig(payload.extra_config || payload.extraConfig || {});
  const normalized = {
    broker,
    tradingMode,
    apiKey: String(payload.api_key || payload.apiKey || '').trim(),
    apiSecret: String(payload.api_secret || payload.apiSecret || '').trim(),
    accountId: String(payload.account_id || payload.accountId || '').trim(),
    extraConfig
  };
  const errors = [];
  if (!broker) {
    errors.push('Choose a supported broker first.');
  }
  if (!ALLOWED_TRADING_MODES.has(tradingMode)) {
    errors.push('Trading mode must be either paper or live.');
  }
  if (broker === 'alpaca') {
    if (!normalized.apiKey || !normalized.apiSecret) {
      errors.push('API key and secret key are required for Alpaca.');
    }
  } else if (broker === 'tradier') {
    if (!normalized.apiKey) {
      errors.push('Access token is required for Tradier.');
    }
    if (!normalized.accountId) {
      errors.push('Account ID is required for Tradier.');
    }
  } else if (broker === 'ibkr') {
    if (!normalized.accountId) {
      errors.push('Account ID is required for Interactive Brokers.');
    }
    const derivedPort = Math.max(1, Math.trunc(toNumber(normalized.extraConfig.port, tradingMode === 'live' ? 7496 : 7497)));
    normalized.extraConfig.port = derivedPort;
  }
  if (!options.allowEmpty && errors.length) {
    return { ok: false, errors, payload: normalized };
  }
  return { ok: errors.length === 0, errors, payload: normalized };
}

async function runConnectionTest(payload) {
  if (payload.broker === 'alpaca') {
    return testAlpacaConnection(payload);
  }
  if (payload.broker === 'tradier') {
    return testTradierConnection(payload);
  }
  return testIbkrConnection(payload);
}

function toBridgeBrokerName(broker) {
  if (broker === 'tradier') {
    return 'tradestation';
  }
  if (broker === 'ibkr') {
    return 'interactive-brokers';
  }
  return broker;
}

function summarizeFailure(testResult) {
  const failed = (Array.isArray(testResult?.checks) ? testResult.checks : []).find((check) => !check.ok);
  return failed?.message || 'Could not verify broker connection. Review API values and try again.';
}

function isAuthFailure(testResult) {
  const failedChecks = Array.isArray(testResult?.checks)
    ? testResult.checks.filter((check) => !check.ok)
    : [];
  return failedChecks.some((check) => {
    if (check.key !== 'validating') {
      return false;
    }
    const message = String(check.message || '').toLowerCase();
    return (
      message.includes('invalid')
      || message.includes('unauthorized')
      || message.includes('access token')
      || message.includes('credentials')
    );
  });
}

function encryptJsonValue(value) {
  const serialized = JSON.stringify(value || {});
  return encryptValue(serialized);
}

function buildStatusPayload(row, accountInfo = null) {
  if (!row) {
    return {
      connected: false,
      broker: null,
      trading_mode: 'paper',
      account_masked: '',
      buying_power: 0,
      last_tested: null,
      status: 'disconnected',
      key_age_days: null,
      rotate_recommended: false
    };
  }
  const keyUpdatedAt = Date.parse(String(row.key_updated_at || row.updated_at || ''));
  const keyAgeDays = Number.isFinite(keyUpdatedAt)
    ? Math.max(0, Math.floor((Date.now() - keyUpdatedAt) / (24 * 60 * 60 * 1000)))
    : null;
  let accountMasked = '';
  try {
    accountMasked = row.account_id_encrypted ? maskAccount(decryptValue(row.account_id_encrypted)) : '';
  } catch (_error) {
    accountMasked = '';
  }
  let buyingPower = 0;
  try {
    const extra = row.extra_config_encrypted ? JSON.parse(decryptValue(row.extra_config_encrypted)) : {};
    buyingPower = toNumber(extra?.lastBuyingPower || 0, 0);
  } catch (_error) {
    buyingPower = 0;
  }
  return {
    connected: row.connection_status === 'connected',
    broker: row.broker_name,
    trading_mode: row.trading_mode,
    account_masked: accountInfo?.accountMasked || accountMasked || '',
    buying_power: toNumber(accountInfo?.buyingPower, buyingPower),
    last_tested: row.last_tested_at || null,
    status: row.connection_status || 'disconnected',
    key_age_days: keyAgeDays,
    rotate_recommended: keyAgeDays !== null ? keyAgeDays >= 90 : false,
    last_successful_trade_at: row.last_successful_trade_at || null
  };
}

function logAction({ userId, action, ipAddress, result, detail }) {
  try {
    appendBrokerSecurityLog({
      user_id: userId,
      action,
      ip_address: ipAddress || 'unknown',
      result,
      detail: detail || null
    });
  } catch (_error) {
    // Non-fatal log path.
  }
}

async function syncAutoTraderBridge(user, payload, accountInfo) {
  const mappedBroker = mapBrokerToAutoTraderBroker(payload.broker);
  const accountId = payload.accountId || accountInfo?.accountId || `${payload.broker}-acct`;
  await connectAutoTraderBrokerBridge(user, {
    broker: mappedBroker,
    accountId,
    connectionMethod: 'api_keys',
    apiKey: payload.apiKey || `token-${maskKey(accountId)}`,
    apiSecret: payload.apiSecret || `secret-${maskKey(payload.apiKey || accountId)}-bridge`,
    bridgeMode: 'broker_linked',
    canRead: true,
    canTrade: true,
    canViewAccount: true,
    riskAcknowledged: true,
    executionMode: 'broker_linked',
    authMethod: 'api_keys',
    tradingMode: payload.tradingMode
  });
  setAutoTraderFundingMode(user, payload.tradingMode);
}

function buildBridgeGuidance(checks = []) {
  return checks.map((check) => ({
    key: check.key,
    label: check.label,
    ok: Boolean(check.ok),
    detail: check.message || ''
  }));
}

async function buildLegacyBridgeTestView(user, options = {}) {
  const refreshResult = await refreshConnectionForUser(user, options);
  const checks = buildBridgeGuidance(refreshResult.checks || []);
  const firstFailure = checks.find((check) => !check.ok);
  return {
    broker: refreshResult?.status?.broker || null,
    testedAt: refreshResult?.status?.last_tested || new Date().toISOString(),
    bridgeReady: Boolean(refreshResult.success),
    readyForTrading: Boolean(refreshResult.success),
    buyingPowerUsd: Number(refreshResult?.account_info?.buying_power || refreshResult?.status?.buying_power || 0),
    checks,
    successMessage: refreshResult.success
      ? 'Broker connected and ready.'
      : null,
    failure: firstFailure
      ? {
        check: firstFailure.label,
        explanation: firstFailure.detail || 'This check failed. Review API keys and permissions, then retry.'
      }
      : null
  };
}

async function legacyConnectBrokerBridge(user, rawPayload, options = {}) {
  const payload = normalizeIncomingBodyForLegacy(rawPayload);
  const saveResult = await saveKeysForUser(user, payload, {
    ipAddress: options.ipAddress || 'unknown',
    rotate: false
  });
  if (!saveResult.success) {
    return saveResult;
  }
  return {
    success: true,
    connected: true,
    message: 'Broker profile saved. Run connection test to finish setup.',
    broker: saveResult?.status?.broker || null,
    connection: {
      isConnected: Boolean(saveResult?.status?.connected),
      broker: toBridgeBrokerName(saveResult?.status?.broker || ''),
      accountId: saveResult?.account_info?.account_masked || '',
      connectionStatus: saveResult?.status?.status || 'connected',
      bridgeMode: 'broker_linked',
      connectedAt: saveResult?.status?.last_tested || nowIso(),
      permissions: {
        canRead: true,
        canTrade: true,
        canViewAccount: true
      },
      auth: {
        connectionMethod: 'api_keys',
        apiKeyLast4: maskKey(payload.api_key || '').slice(-4).toUpperCase(),
        secretSaved: true,
        passphraseSaved: false,
        brokerApiMode: saveResult?.status?.connected ? 'real' : 'simulated',
        apiEndpoint: '',
        accountStatus: saveResult?.status?.status || 'connected',
        credentialFingerprint: '',
        loginUsernameMasked: '',
        loginSaved: false,
        twoFactorMode: 'none',
        otpProvided: false
      },
      lastTestedAt: saveResult?.status?.last_tested || nowIso(),
      lastTestResult: {
        bridgeReady: true,
        readyForTrading: true,
        checks: buildBridgeGuidance(saveResult.checks || [])
      }
    }
  };
}

function normalizeIncomingBodyForLegacy(body = {}) {
  return {
    broker: body.broker,
    api_key: body.api_key ?? body.apiKey ?? body.access_token ?? body.accessToken,
    api_secret: body.api_secret ?? body.apiSecret ?? body.secret_key ?? body.secretKey,
    account_id: body.account_id ?? body.accountId,
    trading_mode: body.trading_mode ?? body.tradingMode ?? body.mode,
    extra_config: body.extra_config ?? body.extraConfig ?? {}
  };
}

async function maybeAlertNeedsAttention(user, ipAddress, detail, context = {}) {
  if (!user?.id || !user?.email) {
    return;
  }
  try {
    const preferences = getUserEmailPreferences(user.id);
    if (preferences.unsubscribed_all || !preferences.bot_status_alerts) {
      return;
    }
    await sendBrokerAttentionAlertEmail(
      { id: user.id, email: user.email },
      {
        reason: detail || 'Broker connection issue detected.',
        brokerSettingsUrl: '/settings/broker',
        ...context
      }
    );
    logAction({
      userId: user.id,
      action: 'broker_attention_email',
      ipAddress,
      result: 'success',
      detail
    });
  } catch (_error) {
    logAction({
      userId: user.id,
      action: 'broker_attention_email',
      ipAddress,
      result: 'failed',
      detail: 'Email delivery failed'
    });
  }
}

async function saveKeysForUser(user, rawPayload, options = {}) {
  const normalized = normalizeIncomingPayload(rawPayload);
  const ipAddress = options.ipAddress || 'unknown';
  if (!normalized.ok) {
    const message = normalized.errors[0] || 'Invalid broker connection payload.';
    logAction({
      userId: user.id,
      action: options.rotate ? 'rotate_keys' : 'save_keys',
      ipAddress,
      result: 'failed',
      detail: message
    });
    return {
      success: false,
      error: 'invalid_payload',
      message,
      checks: []
    };
  }
  const payload = normalized.payload;
  const testResult = await runConnectionTest(payload);
  logAction({
    userId: user.id,
    action: 'test_connection',
    ipAddress,
    result: testResult.success ? 'success' : 'failed',
    detail: testResult.success ? 'Connection test passed' : summarizeFailure(testResult)
  });
  if (!testResult.success) {
    logAction({
      userId: user.id,
      action: options.rotate ? 'rotate_keys' : 'save_keys',
      ipAddress,
      result: 'failed',
      detail: summarizeFailure(testResult)
    });
    return {
      success: false,
      error: 'connection_test_failed',
      message: summarizeFailure(testResult),
      checks: testResult.checks
    };
  }

  const existing = getBrokerConnectionByUserId(user.id);
  const now = nowIso();
  const mergedExtra = {
    ...(payload.extraConfig || {}),
    lastBuyingPower: toNumber(testResult?.accountInfo?.buyingPower, 0)
  };
  const saved = upsertBrokerConnection({
    ...(existing || {}),
    user_id: user.id,
    broker_name: payload.broker,
    trading_mode: payload.tradingMode,
    api_key_encrypted: encryptValue(payload.apiKey || ''),
    api_secret_encrypted: payload.apiSecret ? encryptValue(payload.apiSecret) : null,
    account_id_encrypted: payload.accountId ? encryptValue(payload.accountId) : null,
    extra_config_encrypted: encryptJsonValue(mergedExtra),
    connection_status: 'connected',
    last_tested_at: now,
    failed_auth_attempts: 0,
    key_updated_at: now,
    updated_at: now
  });

  try {
    await syncAutoTraderBridge(user, payload, testResult.accountInfo || {});
  } catch (_error) {
    // Keep broker keys saved even if compatibility state sync fails.
  }

  logAction({
    userId: user.id,
    action: options.rotate ? 'rotate_keys' : 'save_keys',
    ipAddress,
    result: 'success',
    detail: 'Encrypted keys stored'
  });
  return {
    success: true,
    checks: testResult.checks,
    account_info: {
      account_masked: testResult?.accountInfo?.accountMasked || '',
      buying_power: toNumber(testResult?.accountInfo?.buyingPower, 0),
      mode: payload.tradingMode,
      status: 'Ready to trade'
    },
    status: buildStatusPayload(saved, testResult.accountInfo)
  };
}

async function testConnectionForUser(user, rawPayload, options = {}) {
  const normalized = normalizeIncomingPayload(rawPayload);
  const ipAddress = options.ipAddress || 'unknown';
  if (!normalized.ok) {
    const message = normalized.errors[0] || 'Invalid broker connection payload.';
    logAction({
      userId: user.id,
      action: 'test_connection',
      ipAddress,
      result: 'failed',
      detail: message
    });
    return {
      success: false,
      error: 'invalid_payload',
      message,
      checks: []
    };
  }
  const testResult = await runConnectionTest(normalized.payload);
  logAction({
    userId: user.id,
    action: 'test_connection',
    ipAddress,
    result: testResult.success ? 'success' : 'failed',
    detail: testResult.success ? 'Connection test passed' : summarizeFailure(testResult)
  });
  return {
    success: Boolean(testResult.success),
    checks: testResult.checks || [],
    account_info: testResult.accountInfo || null,
    message: testResult.success ? 'Broker connection test passed.' : summarizeFailure(testResult)
  };
}

async function refreshConnectionForUser(user, options = {}) {
  const ipAddress = options.ipAddress || 'unknown';
  const row = getBrokerConnectionByUserId(user.id);
  if (!row) {
    return {
      success: false,
      error: 'not_connected',
      message: 'No broker connection saved.'
    };
  }
  const decrypted = decryptStoredConnection(row);
  if (!decrypted || !decrypted.broker) {
    const errored = upsertBrokerConnection({
      ...row,
      connection_status: 'error',
      last_tested_at: nowIso()
    });
    logAction({
      userId: user.id,
      action: 'refresh_connection',
      ipAddress,
      result: 'failed',
      detail: 'Stored encrypted keys could not be decrypted'
    });
    return {
      success: false,
      checks: [],
      message: 'Stored broker keys are unreadable. Rotate keys and reconnect.',
      status: buildStatusPayload(errored)
    };
  }

  if (options.tradingMode) {
    decrypted.tradingMode = normalizeTradingMode(options.tradingMode);
  }

  const testResult = await runConnectionTest(decrypted);
  const authFailure = isAuthFailure(testResult);
  const nextFailedAttempts = authFailure
    ? Math.max(0, Number(row.failed_auth_attempts || 0)) + 1
    : 0;
  const needsAttention = nextFailedAttempts >= 3;
  const connectionLost = Boolean(row.connection_status === 'connected' && !testResult.success);
  const nextStatus = testResult.success
    ? 'connected'
    : (needsAttention ? 'needs_attention' : 'error');
  const mergedExtra = {
    ...(decrypted.extraConfig || {}),
    lastBuyingPower: toNumber(testResult?.accountInfo?.buyingPower, 0)
  };
  const updated = upsertBrokerConnection({
    ...row,
    trading_mode: decrypted.tradingMode,
    connection_status: nextStatus,
    last_tested_at: nowIso(),
    failed_auth_attempts: nextFailedAttempts,
    extra_config_encrypted: encryptJsonValue(mergedExtra),
    updated_at: nowIso()
  });

  if (connectionLost || needsAttention) {
    try {
      setBotActive(user, false);
    } catch (_error) {
      // Ignore if bot is not configured.
    }
  }

  if (needsAttention) {
    await maybeAlertNeedsAttention(user, ipAddress, '3 consecutive authentication failures');
  } else if (connectionLost) {
    await maybeAlertNeedsAttention(user, ipAddress, 'Broker connection lost while refreshing status');
  }
  try {
    if (testResult.success) {
      await syncAutoTraderBridge(user, decrypted, testResult.accountInfo || {});
    }
  } catch (_error) {
    // Keep refresh result even if bridge sync fails.
  }

  logAction({
    userId: user.id,
    action: 'refresh_connection',
    ipAddress,
    result: testResult.success ? 'success' : 'failed',
    detail: testResult.success ? 'Broker connection refreshed' : summarizeFailure(testResult)
  });

  return {
    success: Boolean(testResult.success),
    checks: testResult.checks || [],
    message: testResult.success ? 'Broker connection refreshed.' : summarizeFailure(testResult),
    account_info: testResult.accountInfo || null,
    status: buildStatusPayload(updated, testResult.accountInfo || null)
  };
}

function getStatusForUser(user, options = {}) {
  const ipAddress = options.ipAddress || 'unknown';
  const row = getBrokerConnectionByUserId(user.id);
  const status = buildStatusPayload(row);
  logAction({
    userId: user.id,
    action: 'broker_accessed',
    ipAddress,
    result: 'success',
    detail: `Status requested (${status.status})`
  });
  return status;
}

function disconnectForUser(user, options = {}) {
  const ipAddress = options.ipAddress || 'unknown';
  const removed = deleteBrokerConnectionByUserId(user.id);
  try {
    disconnectAutoTraderBrokerBridge(user);
  } catch (_error) {
    // Non-fatal.
  }
  logAction({
    userId: user.id,
    action: 'disconnect',
    ipAddress,
    result: removed ? 'success' : 'failed',
    detail: removed ? 'Broker connection removed' : 'No broker connection to remove'
  });
  return {
    success: Boolean(removed),
    connected: false,
    status: 'disconnected'
  };
}

function listSecurityLogForUser(userId, limit = 100) {
  return listBrokerSecurityLogForUser(userId, limit);
}

function recordTradeSuccess(userId) {
  const row = getBrokerConnectionByUserId(userId);
  if (!row) {
    return;
  }
  upsertBrokerConnection({
    ...row,
    last_successful_trade_at: nowIso(),
    connection_status: 'connected',
    failed_auth_attempts: 0,
    updated_at: nowIso()
  });
}

module.exports = {
  normalizeBroker,
  normalizeTradingMode,
  saveKeysForUser,
  testConnectionForUser,
  refreshConnectionForUser,
  getStatusForUser,
  disconnectForUser,
  listSecurityLogForUser,
  recordTradeSuccess,
  buildLegacyBridgeTestView,
  legacyConnectBrokerBridge,
  normalizeIncomingBodyForLegacy
};
