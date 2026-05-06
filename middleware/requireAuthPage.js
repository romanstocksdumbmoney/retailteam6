const { requireApiAuthStrictSession } = require('../services/routeAuth');

function safeNextPath(req) {
  const path = String(req.originalUrl || req.url || '/').trim();
  if (!path.startsWith('/') || path.startsWith('//')) {
    return '/';
  }
  return path;
}

function requireAuthPage(req, res, next) {
  return requireApiAuthStrictSession(req, res, () => next());
}

function requireEmailVerifiedForFeature(req, res, next) {
  return requireApiAuthStrictSession(req, res, () => {
    if (!req.user?.emailVerified) {
      const nextPath = encodeURIComponent(safeNextPath(req));
      return res.redirect(`/ai-trade-access.html?mode=login&next=${nextPath}&verify=1`);
    }
    return next();
  });
}

module.exports = {
  requireAuthPage,
  requireEmailVerifiedForFeature
};
