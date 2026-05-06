const crypto = require('crypto');

function normalizeBase64Url(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return raw.replace(/-/g, '+').replace(/_/g, '/');
}

function loadEncryptionKey() {
  const source = String(process.env.ENCRYPTION_KEY || '').trim();
  if (!source) {
    throw new Error('missing_encryption_key');
  }
  const normalized = normalizeBase64Url(source);
  try {
    const decoded = Buffer.from(normalized, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch (_error) {
    // Fall through to deterministic derivation below.
  }
  // Keep compatibility with non-Fernet-style keys while still deriving 256-bit keying material.
  return crypto.createHash('sha256').update(source, 'utf8').digest();
}

function assertEncryptionReady() {
  // Throws when ENCRYPTION_KEY is missing.
  loadEncryptionKey();
  return true;
}

function encryptValue(plainText) {
  const value = String(plainText ?? '');
  if (!value) {
    return '';
  }
  const key = loadEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${authTag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptValue(cipherText) {
  const value = String(cipherText ?? '').trim();
  if (!value) {
    return '';
  }
  const [ivB64, authTagB64, payloadB64] = value.split('.');
  if (!ivB64 || !authTagB64 || !payloadB64) {
    throw new Error('invalid_cipher_text');
  }
  const key = loadEncryptionKey();
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const payload = Buffer.from(payloadB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString('utf8');
}

function maskKey(plainText) {
  const value = String(plainText ?? '').trim();
  if (!value) {
    return '';
  }
  if (value.length <= 8) {
    return `${value.slice(0, 1)}...${value.slice(-1)}`;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

module.exports = {
  assertEncryptionReady,
  encryptValue,
  decryptValue,
  maskKey
};
