const express = require('express');
const {
  getUserByEmailForAuth,
  verifyPasswordAgainstUser
} = require('../services/authDbService');
const { requireApiAuthStrictSession } = require('../services/routeAuth');
const {
  saveKeysForUser,
  testConnectionForUser,
  refreshConnectionForUser,
  getStatusForUser,
  disconnectForUser,
  listSecurityLogForUser
} = require('../services/brokerConnectionService');

const router = express.Router();

function requireSignedIn(req, res, next) {
  return requireApiAuthStrictSession(req, res, () => {
    if (!req.user?.emailVerified) {
      return res.status(403).json({
        error: 'email_not_verified',
        message: 'Please verify your email before connecting a broker.'
      });
    }
    return next();
  });
}

function getRequestIp(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  if (forwarded) {
    return forwarded;
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim().slice(0, 120) || 'unknown';
}

function normalizeIncomingBody(body = {}) {
  return {
    broker: body.broker,
    api_key: body.api_key ?? body.apiKey ?? body.access_token ?? body.accessToken,
    api_secret: body.api_secret ?? body.apiSecret ?? body.secret_key ?? body.secretKey,
    account_id: body.account_id ?? body.accountId,
    trading_mode: body.trading_mode ?? body.tradingMode ?? body.mode,
    extra_config: body.extra_config ?? body.extraConfig ?? {}
  };
}

router.post('/save-keys', requireSignedIn, async (req, res) => {
  try {
    const payload = await saveKeysForUser(req.user, normalizeIncomingBody(req.body || {}), {
      ipAddress: getRequestIp(req),
      rotate: Boolean(req.body?.rotate)
    });
    if (!payload.success) {
      return res.status(400).json({
        success: false,
        error: payload.error || 'save_failed',
        message: payload.message || 'Could not save broker keys.',
        checks: payload.checks || []
      });
    }
    return res.json({
      success: true,
      message: 'Broker keys saved and verified.',
      checks: payload.checks || [],
      account_info: payload.account_info || null,
      status: payload.status || null
    });
  } catch (_error) {
    return res.status(500).json({
      success: false,
      error: 'save_failed',
      message: 'Could not save broker keys.'
    });
  }
});

router.post('/test-connection', requireSignedIn, async (req, res) => {
  try {
    const payload = await testConnectionForUser(req.user, normalizeIncomingBody(req.body || {}), {
      ipAddress: getRequestIp(req)
    });
    return res.json({
      success: Boolean(payload.success),
      checks: payload.checks || [],
      account_info: payload.account_info || null,
      message: payload.message || (payload.success ? 'Connection successful.' : 'Connection failed.')
    });
  } catch (_error) {
    return res.status(500).json({
      success: false,
      error: 'test_failed',
      message: 'Could not test broker connection.'
    });
  }
});

router.get('/status', requireSignedIn, (req, res) => {
  try {
    const status = getStatusForUser(req.user, { ipAddress: getRequestIp(req) });
    return res.json(status);
  } catch (_error) {
    return res.status(500).json({
      connected: false,
      status: 'error',
      message: 'Could not load broker status.'
    });
  }
});

router.post('/refresh', requireSignedIn, async (req, res) => {
  try {
    const requestedMode = req.body?.trading_mode || req.body?.tradingMode || req.body?.switch_mode;
    const payload = await refreshConnectionForUser(req.user, {
      ipAddress: getRequestIp(req),
      tradingMode: requestedMode
    });
    if (!payload.success) {
      return res.status(400).json(payload);
    }
    return res.json(payload);
  } catch (_error) {
    return res.status(500).json({
      success: false,
      error: 'refresh_failed',
      message: 'Could not refresh broker connection.'
    });
  }
});

router.delete('/disconnect', requireSignedIn, express.json({ limit: '1mb' }), async (req, res) => {
  const password = String(req.body?.password || '').trim();
  if (!password) {
    return res.status(400).json({
      success: false,
      error: 'password_required',
      message: 'Password confirmation is required.'
    });
  }
  const authUser = getUserByEmailForAuth(req.user?.email || '');
  if (!authUser?.id) {
    return res.status(401).json({
      success: false,
      error: 'unauthorized',
      message: 'Login required.'
    });
  }
  const validPassword = await verifyPasswordAgainstUser(authUser, password);
  if (!validPassword) {
    return res.status(401).json({
      success: false,
      error: 'incorrect_password',
      message: 'Password is incorrect.'
    });
  }
  try {
    const payload = disconnectForUser(req.user, { ipAddress: getRequestIp(req) });
    return res.json(payload);
  } catch (_error) {
    return res.status(500).json({
      success: false,
      error: 'disconnect_failed',
      message: 'Could not disconnect broker.'
    });
  }
});

router.get('/security-log', requireSignedIn, (req, res) => {
  const limitRaw = Number(req.query?.limit || 100);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
  const entries = listSecurityLogForUser(req.user.id, limit);
  return res.json({ entries });
});

// Backward-compatible aliases for existing frontend surfaces.
router.post('/connect', requireSignedIn, async (req, res) => {
  try {
    const payload = await saveKeysForUser(req.user, normalizeIncomingBody(req.body || {}), {
      ipAddress: getRequestIp(req),
      rotate: false
    });
    if (!payload.success) {
      return res.status(400).json({
        error: payload.error || 'save_failed',
        message: payload.message || 'Could not connect broker.',
        checks: payload.checks || []
      });
    }
    return res.json({
      connected: true,
      message: 'Broker profile saved. Run connection test to finish setup.',
      broker: payload?.status?.broker || null,
      connection: payload?.status || null
    });
  } catch (_error) {
    return res.status(500).json({
      error: 'save_failed',
      message: 'Could not connect broker.'
    });
  }
});

router.post('/test', requireSignedIn, async (req, res) => {
  try {
    const hasInlineKeys = Boolean(
      req.body?.api_key
      || req.body?.apiKey
      || req.body?.access_token
      || req.body?.accessToken
      || req.body?.api_secret
      || req.body?.apiSecret
      || req.body?.secret_key
      || req.body?.secretKey
    );
    const payload = hasInlineKeys
      ? await testConnectionForUser(req.user, normalizeIncomingBody(req.body || {}), {
        ipAddress: getRequestIp(req)
      })
      : await refreshConnectionForUser(req.user, { ipAddress: getRequestIp(req) });
    const checks = (payload.checks || []).map((check) => ({
      key: check.key,
      label: check.label,
      ok: Boolean(check.ok),
      detail: check.message || ''
    }));
    const firstFailure = checks.find((check) => !check.ok);
    return res.json({
      broker: payload?.status?.broker || req.body?.broker || null,
      testedAt: payload?.status?.last_tested || new Date().toISOString(),
      bridgeReady: Boolean(payload.success),
      readyForTrading: Boolean(payload.success),
      buyingPowerUsd: Number(payload?.account_info?.buying_power || payload?.status?.buying_power || 0),
      checks,
      successMessage: payload.success
        ? 'Broker connected and ready.'
        : null,
      failure: firstFailure
        ? {
          check: firstFailure.label,
          explanation: firstFailure.detail || 'This check failed. Review API keys and permissions, then retry.'
        }
        : null
    });
  } catch (_error) {
    return res.status(500).json({
      error: 'test_failed',
      message: 'Could not run broker test.'
    });
  }
});

module.exports = router;
