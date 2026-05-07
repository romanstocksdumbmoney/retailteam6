const { parseAuthToken } = require('./authService');
const { findUserByEmail, getUserById } = require('./userStore');
const {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  validateSessionFromToken,
  touchAndExtendSession,
  sanitizeUserForClient,
  getClientIp
} = require('./authDbService');

const PROTECTED_PAGE_PATHS = new Set([
  '/dashboard',
  '/ai-trader',
  '/portfolio',
  '/portfolio.html',
  '/portfolios.html',
  '/reports',
  '/reports.html',
  '/settings',
  '/settings/',
  '/settings.html',
  '/settings/broker',
  '/settings/broker.html',
  '/ai-bot-trader',
  '/ai-bot-trader.html',
  '/ai-bot-account',
  '/ai-bot-account.html',
  '/ai-bot-funding',
  '/ai-bot-funding.html',
  '/ai-bot-paper-connect',
  '/ai-bot-paper-connect.html',
  '/ai-bot-funding-payment',
  '/ai-bot-funding-payment.html',
  '/brokerage-onboarding',
  '/brokerage-onboarding.html',
  '/ai-live-account-setup',
  '/ai-live-account-setup.html',
  '/ai-broker-direct-setup',
  '/ai-broker-direct-setup.html',
  '/ai-trade',
  '/ai-trade.html'
]);

function parseCookies(headerValue) {
  return String(headerValue || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        return acc;
      }
      const key = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!key) {
        return acc;
      }
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getSessionTokenFromRequest(req) {
  const cookies = parseCookies(req.headers?.cookie || '');
  return String(cookies[SESSION_COOKIE_NAME] || '').trim();
}

function resolveLegacyBearerUser(req) {
  const parsed = parseAuthToken(req.header('authorization'));
  if (!parsed.ok) {
    return null;
  }
  const byId = getUserById(parsed.userId);
  if (byId) {
    return byId;
  }
  if (parsed.email) {
    return findUserByEmail(parsed.email);
  }
  return null;
}

function attachAuthFromSession(req, res) {
  const sessionToken = getSessionTokenFromRequest(req);
  if (!sessionToken) {
    return false;
  }
  const resolved = validateSessionFromToken(sessionToken);
  if (!resolved?.session || !resolved?.user) {
    clearSessionCookie(res);
    return false;
  }
  const touched = touchAndExtendSession(resolved.session, {
    userAgent: req.get('user-agent'),
    ipAddress: getClientIp(req)
  });
  if (!touched) {
    clearSessionCookie(res);
    return false;
  }
  const authUser = sanitizeUserForClient(resolved.user);
  const legacyUser = findUserByEmail(authUser.email);
  const mergedUser = legacyUser
    ? {
      ...authUser,
      id: legacyUser.id,
      authUserId: authUser.id,
      legacyUserId: legacyUser.id,
      traderMode: legacyUser.traderMode || authUser.traderMode || 'day',
      plan: legacyUser.plan || authUser.plan || 'free'
    }
    : authUser;
  req.auth = {
    sessionId: touched.id,
    session: touched,
    user: mergedUser
  };
  req.user = req.auth.user;
  return true;
}

function attachAuthFromLegacyBearer(req) {
  const user = resolveLegacyBearerUser(req);
  if (!user) {
    return false;
  }
  req.auth = {
    sessionId: null,
    session: null,
    user
  };
  req.user = user;
  return true;
}

function requireApiAuth(req, res, next) {
  if (attachAuthFromSession(req, res) || attachAuthFromLegacyBearer(req)) {
    return next();
  }
  return res.status(401).json({
    error: 'unauthorized',
    message: 'Login required.'
  });
}

function requireApiAuthStrictSession(req, res, next) {
  if (attachAuthFromSession(req, res)) {
    return next();
  }
  return res.status(401).json({
    error: 'unauthorized',
    message: 'Login required.'
  });
}

function getSafeNextPath(req) {
  const path = String(req.originalUrl || req.path || '/').trim();
  if (!path.startsWith('/') || path.startsWith('//')) {
    return '/';
  }
  return path;
}

function maybeProtectPageRoute(req, res, next) {
  const path = String(req.path || '')
    .split('?')[0]
    .trim()
    .toLowerCase();
  if (!PROTECTED_PAGE_PATHS.has(path)) {
    return next();
  }
  if (attachAuthFromSession(req, res) || attachAuthFromLegacyBearer(req)) {
    return next();
  }
  const nextParam = encodeURIComponent(getSafeNextPath(req));
  return res.redirect(`/ai-trade-access.html?mode=login&next=${nextParam}`);
}

module.exports = {
  parseCookies,
  getSessionTokenFromRequest,
  requireApiAuth,
  requireApiAuthStrictSession,
  maybeProtectPageRoute
};
