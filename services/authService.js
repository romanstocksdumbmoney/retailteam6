const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const AUTH_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || 'local-dev-secret-change-me';
const AUTH_EXPIRATION = process.env.JWT_EXPIRES_IN || process.env.AUTH_TOKEN_EXPIRATION || '7d';

const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

if (isProduction && (!AUTH_SECRET || AUTH_SECRET === 'local-dev-secret-change-me' || AUTH_SECRET.length < 32)) {
  throw new Error('In production, JWT_SECRET (or AUTH_SECRET) must be set to a strong secret (32+ chars).');
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(String(password || ''), String(passwordHash || ''));
}

function signAuthToken(payload) {
  return jwt.sign(payload, AUTH_SECRET, { expiresIn: AUTH_EXPIRATION });
}

function readAuthToken(token) {
  try {
    return jwt.verify(String(token || ''), AUTH_SECRET);
  } catch (_error) {
    return null;
  }
}

function parseAuthToken(authorizationHeader) {
  const raw = String(authorizationHeader || '');
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { ok: false };
  }
  const payload = readAuthToken(token);
  if (!payload || !payload.userId) {
    return { ok: false };
  }
  return { ok: true, userId: payload.userId, email: payload.email || '' };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signAuthToken,
  readAuthToken,
  parseAuthToken
};
