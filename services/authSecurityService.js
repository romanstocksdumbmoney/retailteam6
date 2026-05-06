const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DEFAULT_BCRYPT_ROUNDS = 12;
const BCRYPT_ROUNDS = Math.max(
  12,
  Math.min(15, Number.parseInt(String(process.env.BCRYPT_ROUNDS || DEFAULT_BCRYPT_ROUNDS), 10) || DEFAULT_BCRYPT_ROUNDS)
);

const PASSWORD_MIN_LENGTH = 8;

function nowIso() {
  return new Date().toISOString();
}

function hashSha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function createSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function looksLikeBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value || ''));
}

function normalizePasswordInput(value) {
  return String(value || '');
}

function passwordStrengthState(password) {
  const value = normalizePasswordInput(password);
  const checks = {
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    uppercase: /[A-Z]/.test(value),
    number: /[0-9]/.test(value),
    special: /[^A-Za-z0-9]/.test(value)
  };
  const score = Object.values(checks).filter(Boolean).length;
  const ok = checks.minLength && checks.uppercase && checks.number && checks.special;
  return {
    ok,
    checks,
    score,
    label: ok ? 'Strong' : score >= 3 ? 'Medium' : 'Weak'
  };
}

async function hashPassword(password) {
  return bcrypt.hash(normalizePasswordInput(password), BCRYPT_ROUNDS);
}

async function comparePassword(password, passwordHash) {
  return bcrypt.compare(normalizePasswordInput(password), String(passwordHash || ''));
}

module.exports = {
  nowIso,
  hashSha256,
  createSecureToken,
  looksLikeBcryptHash,
  passwordStrengthState,
  hashPassword,
  comparePassword,
  BCRYPT_ROUNDS
};
