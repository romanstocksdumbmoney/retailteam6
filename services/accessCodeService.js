const crypto = require('crypto');
const nodemailer = require('nodemailer');

const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
const ACCESS_CODE_TTL_MINUTES = Math.max(
  5,
  Math.min(60, Number.parseInt(String(process.env.ACCESS_CODE_TTL_MINUTES || '15'), 10) || 15)
);
const ACCESS_CODE_PREVIEW_FALLBACK = String(
  process.env.ACCESS_CODE_PREVIEW_FALLBACK || (isProduction ? '0' : '1')
).trim() === '1';
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number.parseInt(String(process.env.SMTP_PORT || '587'), 10) || 587;
const SMTP_SECURE = String(process.env.SMTP_SECURE || '0').trim() === '1';
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM = String(process.env.SMTP_FROM || 'DumbDollars <no-reply@dumbdollars.local>').trim();

const PURPOSE_PRO_RECOVERY = 'pro_recovery';
const MAX_VERIFY_ATTEMPTS = 8;
const REQUEST_COOLDOWN_MS = 60_000;
const codesByKey = new Map();
const lastRequestAtByEmail = new Map();

let transporter = null;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePurpose(purpose) {
  return String(purpose || PURPOSE_PRO_RECOVERY).trim().toLowerCase();
}

function buildKey(email, purpose) {
  return `${normalizeEmail(email)}|${normalizePurpose(purpose)}`;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code || ''), 'utf8').digest('hex');
}

function generateCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    const index = crypto.randomInt(0, alphabet.length);
    code += alphabet[index];
  }
  return code;
}

function pruneExpiredCodes() {
  const now = Date.now();
  for (const [key, entry] of codesByKey.entries()) {
    if (!entry || now > Number(entry.expiresAtMs || 0)) {
      codesByKey.delete(key);
    }
  }
}

function getSmtpTransporter() {
  if (transporter) {
    return transporter;
  }
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
  return transporter;
}

function issueAccessCode({ email, purpose = PURPOSE_PRO_RECOVERY }) {
  pruneExpiredCodes();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPurpose = normalizePurpose(purpose);
  if (!normalizedEmail) {
    throw new Error('email_required');
  }
  const now = Date.now();
  const lastRequestAt = Number(lastRequestAtByEmail.get(normalizedEmail) || 0);
  if (now - lastRequestAt < REQUEST_COOLDOWN_MS) {
    throw new Error('request_cooldown');
  }
  const code = generateCode();
  const expiresAtMs = now + ACCESS_CODE_TTL_MINUTES * 60_000;
  const key = buildKey(normalizedEmail, normalizedPurpose);
  codesByKey.set(key, {
    codeHash: hashCode(code),
    createdAtMs: now,
    expiresAtMs,
    attempts: 0
  });
  lastRequestAtByEmail.set(normalizedEmail, now);
  return {
    code,
    purpose: normalizedPurpose,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

async function deliverAccessCode({ email, code, purpose, expiresAt }) {
  const transport = getSmtpTransporter();
  if (!transport) {
    if (ACCESS_CODE_PREVIEW_FALLBACK) {
      return {
        mode: 'preview',
        previewCode: code
      };
    }
    throw new Error('email_delivery_not_configured');
  }
  const subject = purpose === PURPOSE_PRO_RECOVERY
    ? 'Your DumbDollars Pro recovery code'
    : 'Your DumbDollars account access code';
  const text = [
    'DumbDollars account code',
    '',
    `Code: ${code}`,
    `Purpose: ${purpose}`,
    `Expires: ${expiresAt}`,
    '',
    'If you did not request this code, you can ignore this email.'
  ].join('\n');
  await transport.sendMail({
    from: SMTP_FROM,
    to: normalizeEmail(email),
    subject,
    text
  });
  return {
    mode: 'email',
    previewCode: null
  };
}

function verifyAccessCode({ email, code, purpose = PURPOSE_PRO_RECOVERY }) {
  pruneExpiredCodes();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPurpose = normalizePurpose(purpose);
  if (!normalizedEmail) {
    return { ok: false, error: 'email_required' };
  }
  const key = buildKey(normalizedEmail, normalizedPurpose);
  const entry = codesByKey.get(key);
  if (!entry) {
    return { ok: false, error: 'code_not_found' };
  }
  const now = Date.now();
  if (now > Number(entry.expiresAtMs || 0)) {
    codesByKey.delete(key);
    return { ok: false, error: 'code_expired' };
  }
  const matches = hashCode(code) === String(entry.codeHash || '');
  if (!matches) {
    entry.attempts = Number(entry.attempts || 0) + 1;
    if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
      codesByKey.delete(key);
      return { ok: false, error: 'too_many_attempts' };
    }
    codesByKey.set(key, entry);
    return { ok: false, error: 'code_invalid' };
  }
  codesByKey.delete(key);
  return { ok: true };
}

module.exports = {
  PURPOSE_PRO_RECOVERY,
  issueAccessCode,
  deliverAccessCode,
  verifyAccessCode
};
