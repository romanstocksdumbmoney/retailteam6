const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const usersById = new Map();
const usersByEmail = new Map();
const usersByStripeCustomerId = new Map();
const USER_STORE_FILE = String(process.env.USER_STORE_FILE || path.join(process.cwd(), 'data', 'users.json')).trim();
const SUPPORTED_AUTH_PROVIDERS = new Set(['password', 'google', 'apple', 'github', 'discord', 'x']);
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'trashmail.com',
  'yopmail.com'
]);

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function ensureStoreDirExists() {
  const dir = path.dirname(USER_STORE_FILE);
  fs.mkdirSync(dir, { recursive: true });
}

function persistUsersToDisk() {
  try {
    ensureStoreDirExists();
    const records = [...usersById.values()].map((user) => ({
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      authProviders: Array.isArray(user.authProviders) ? [...new Set(user.authProviders.map((entry) => normalizeAuthProvider(entry)))] : ['password'],
      lastAuthProvider: normalizeAuthProvider(user.lastAuthProvider || 'password'),
      plan: user.plan === 'pro' ? 'pro' : 'free',
      stripeCustomerId: user.stripeCustomerId || null,
      stripeSubscriptionId: user.stripeSubscriptionId || null,
      subscriptionStatus: user.subscriptionStatus || (user.plan === 'pro' ? 'active' : 'inactive'),
      createdAt: user.createdAt || new Date().toISOString(),
      updatedAt: user.updatedAt || new Date().toISOString()
    }));
    const payload = JSON.stringify({ users: records }, null, 2);
    const tmpPath = `${USER_STORE_FILE}.tmp`;
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, USER_STORE_FILE);
  } catch (_error) {
    // Intentionally non-fatal in runtime; in-memory store still operates.
  }
}

function loadUsersFromDisk() {
  try {
    if (!fs.existsSync(USER_STORE_FILE)) {
      return;
    }
    const raw = fs.readFileSync(USER_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed?.users) ? parsed.users : [];
    records.forEach((record) => {
      const email = normalizeEmail(record?.email);
      const id = String(record?.id || '').trim();
      const passwordHash = String(record?.passwordHash || '').trim();
      if (!id || !email || !passwordHash || usersById.has(id) || usersByEmail.has(email)) {
        return;
      }
      const authProviders = Array.isArray(record?.authProviders)
        ? [...new Set(record.authProviders.map((entry) => normalizeAuthProvider(entry)))]
        : [normalizeAuthProvider(record?.lastAuthProvider || 'password')];
      const user = {
        id,
        email,
        passwordHash,
        authProviders: authProviders.length ? authProviders : ['password'],
        lastAuthProvider: normalizeAuthProvider(record?.lastAuthProvider || authProviders[0] || 'password'),
        plan: record?.plan === 'pro' ? 'pro' : 'free',
        stripeCustomerId: record?.stripeCustomerId ? String(record.stripeCustomerId).trim() : null,
        stripeSubscriptionId: record?.stripeSubscriptionId ? String(record.stripeSubscriptionId).trim() : null,
        subscriptionStatus: String(record?.subscriptionStatus || (record?.plan === 'pro' ? 'active' : 'inactive')),
        createdAt: String(record?.createdAt || new Date().toISOString()),
        updatedAt: String(record?.updatedAt || new Date().toISOString())
      };
      usersById.set(user.id, user);
      usersByEmail.set(user.email, user.id);
      if (user.stripeCustomerId) {
        usersByStripeCustomerId.set(user.stripeCustomerId, user.id);
      }
    });
  } catch (_error) {
    // If persistence file is malformed/unavailable, start with empty in-memory store.
  }
}

function isValidEmailFormat(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254) {
    return false;
  }
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return false;
  }
  const [localPart, domainPart] = parts;
  if (!localPart || !domainPart) {
    return false;
  }
  if (localPart.length > 64 || domainPart.length > 253) {
    return false;
  }
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart)) {
    return false;
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domainPart)) {
    return false;
  }
  if (domainPart.includes('..') || domainPart.startsWith('.') || domainPart.endsWith('.')) {
    return false;
  }
  if (DISPOSABLE_EMAIL_DOMAINS.has(domainPart)) {
    return false;
  }
  return true;
}

function evaluatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 10) {
    return {
      ok: false,
      reason: 'length'
    };
  }
  if (!/[A-Z]/.test(value)) {
    return {
      ok: false,
      reason: 'uppercase'
    };
  }
  if (!/[a-z]/.test(value)) {
    return {
      ok: false,
      reason: 'lowercase'
    };
  }
  if (!/[0-9]/.test(value)) {
    return {
      ok: false,
      reason: 'number'
    };
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    return {
      ok: false,
      reason: 'symbol'
    };
  }
  return { ok: true, reason: 'ok' };
}

function planFromSubscriptionStatus(status) {
  return status === 'active' || status === 'trialing' ? 'pro' : 'free';
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    authProviders: Array.isArray(user.authProviders) ? [...user.authProviders] : ['password'],
    lastAuthProvider: user.lastAuthProvider || 'password',
    stripeCustomerId: user.stripeCustomerId || null,
    stripeSubscriptionId: user.stripeSubscriptionId || null,
    subscriptionStatus: user.subscriptionStatus || 'inactive',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function normalizeAuthProvider(provider) {
  const value = String(provider || 'password').trim().toLowerCase();
  if (SUPPORTED_AUTH_PROVIDERS.has(value)) {
    return value;
  }
  return 'password';
}

function mergeAuthProviders(currentProviders, nextProvider) {
  const merged = new Set(
    (Array.isArray(currentProviders) ? currentProviders : ['password'])
      .map((entry) => normalizeAuthProvider(entry))
  );
  merged.add(normalizeAuthProvider(nextProvider));
  return [...merged];
}

function createUser({ email, password, passwordHash, authProvider = 'password' }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('email_required');
  }
  if (!isValidEmailFormat(normalizedEmail)) {
    throw new Error('invalid_email');
  }

  const chosenHash = String(passwordHash || '');
  const chosenPassword = String(password || '');
  const provider = normalizeAuthProvider(authProvider);
  if (provider === 'password' && !chosenHash) {
    const passwordCheck = evaluatePasswordStrength(chosenPassword);
    if (!passwordCheck.ok) {
      throw new Error(`weak_password_${passwordCheck.reason}`);
    }
  }
  if (usersByEmail.has(normalizedEmail)) {
    throw new Error('email_exists');
  }

  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash: chosenHash || bcrypt.hashSync(chosenPassword || crypto.randomUUID(), 10),
    authProviders: [provider],
    lastAuthProvider: provider,
    plan: 'free',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: 'inactive',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  usersById.set(user.id, user);
  usersByEmail.set(user.email, user.id);
  persistUsersToDisk();
  return sanitizeUser(user);
}

async function verifyUserPassword({ email, password }) {
  const user = findUserByEmail(email);
  if (!user) {
    return null;
  }
  const valid = await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!valid) {
    return null;
  }
  return sanitizeUser(user);
}

function findUserByEmail(email) {
  const userId = usersByEmail.get(normalizeEmail(email));
  if (!userId) {
    return null;
  }
  return usersById.get(userId) || null;
}

function findUserById(id) {
  return usersById.get(id) || null;
}

function getUserById(id) {
  const user = findUserById(id);
  return user ? sanitizeUser(user) : null;
}

function getRawUserById(id) {
  return findUserById(id);
}

function getAllUsers() {
  return [...usersById.values()].map((user) => sanitizeUser(user));
}

function listUsers() {
  return getAllUsers();
}

function updateUser(userId, patch) {
  const user = findUserById(userId);
  if (!user) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'stripeCustomerId')) {
    if (user.stripeCustomerId) {
      usersByStripeCustomerId.delete(user.stripeCustomerId);
    }
    user.stripeCustomerId = patch.stripeCustomerId || null;
    if (user.stripeCustomerId) {
      usersByStripeCustomerId.set(user.stripeCustomerId, user.id);
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'stripeSubscriptionId')) {
    user.stripeSubscriptionId = patch.stripeSubscriptionId || null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'subscriptionStatus')) {
    user.subscriptionStatus = patch.subscriptionStatus || 'inactive';
    user.plan = planFromSubscriptionStatus(user.subscriptionStatus);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'plan')) {
    user.plan = patch.plan === 'pro' ? 'pro' : 'free';
    if (user.plan === 'pro' && user.subscriptionStatus !== 'active') {
      user.subscriptionStatus = 'active';
    }
    if (user.plan === 'free' && user.subscriptionStatus === 'active') {
      user.subscriptionStatus = 'inactive';
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'authProvider')) {
    const provider = normalizeAuthProvider(patch.authProvider);
    user.authProviders = mergeAuthProviders(user.authProviders, provider);
    user.lastAuthProvider = provider;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'authProviders')) {
    const providers = Array.isArray(patch.authProviders) ? patch.authProviders : [];
    const normalizedProviders = providers
      .map((entry) => normalizeAuthProvider(entry))
      .filter((entry) => SUPPORTED_AUTH_PROVIDERS.has(entry));
    if (normalizedProviders.length > 0) {
      user.authProviders = [...new Set(normalizedProviders)];
      user.lastAuthProvider = user.authProviders[user.authProviders.length - 1] || user.lastAuthProvider || 'password';
    }
  }

  user.updatedAt = new Date().toISOString();
  persistUsersToDisk();
  return user;
}

function findOrCreateUserByAuthProvider({ email, authProvider }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('email_required');
  }
  if (!isValidEmailFormat(normalizedEmail)) {
    throw new Error('invalid_email');
  }
  const provider = normalizeAuthProvider(authProvider);
  if (provider === 'password') {
    throw new Error('invalid_auth_provider');
  }

  const existing = findUserByEmail(normalizedEmail);
  if (existing) {
    const updated = updateUser(existing.id, { authProvider: provider });
    return {
      user: sanitizeUser(updated),
      created: false
    };
  }

  const created = createUser({
    email: normalizedEmail,
    passwordHash: bcrypt.hashSync(crypto.randomUUID(), 10),
    authProvider: provider
  });
  return {
    user: created,
    created: true
  };
}

function setStripeCustomerForUser(userId, stripeCustomerId) {
  const updated = updateUser(userId, { stripeCustomerId });
  return updated ? sanitizeUser(updated) : null;
}

function setStripeCustomerId(userId, stripeCustomerId) {
  return setStripeCustomerForUser(userId, stripeCustomerId);
}

function getUserByStripeCustomerId(customerId) {
  const userId = usersByStripeCustomerId.get(customerId);
  if (!userId) {
    return null;
  }
  const user = findUserById(userId);
  return user ? sanitizeUser(user) : null;
}

function setUserPlanById(userId, { plan, stripeSubscriptionId = null }) {
  const updated = updateUser(userId, { plan, stripeSubscriptionId });
  return updated ? sanitizeUser(updated) : null;
}

function setUserPlanByCustomerId(customerId, { plan, stripeSubscriptionId = null }) {
  const userId = usersByStripeCustomerId.get(customerId);
  if (!userId) {
    return null;
  }
  return setUserPlanById(userId, { plan, stripeSubscriptionId });
}

function setSubscriptionStatus(userId, status) {
  const normalized = status === 'pro' ? 'active' : String(status || 'inactive');
  const updated = updateUser(userId, { subscriptionStatus: normalized });
  return updated ? sanitizeUser(updated) : null;
}

loadUsersFromDisk();

module.exports = {
  createUser,
  findOrCreateUserByAuthProvider,
  normalizeAuthProvider,
  verifyUserPassword,
  findUserByEmail,
  findUserById,
  getUserById,
  getRawUserById,
  getAllUsers,
  listUsers,
  updateUser,
  sanitizeUser,
  setStripeCustomerForUser,
  setStripeCustomerId,
  getUserByStripeCustomerId,
  setUserPlanById,
  setUserPlanByCustomerId,
  setSubscriptionStatus,
  isValidEmailFormat,
  evaluatePasswordStrength
};
