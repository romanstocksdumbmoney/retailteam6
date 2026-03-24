const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const usersById = new Map();
const usersByEmail = new Map();
const usersByStripeCustomerId = new Map();
let creatorUserId = null;

const CREATOR_EMAILS = new Set(
  String(process.env.CREATOR_EMAILS || '')
    .split(',')
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean)
);
const FIRST_SIGNUP_IS_CREATOR = String(process.env.FIRST_SIGNUP_IS_CREATOR || 'false').toLowerCase() === 'true';

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function planFromSubscriptionStatus(status) {
  return status === 'active' || status === 'trialing' ? 'pro' : 'free';
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    stripeCustomerId: user.stripeCustomerId || null,
    stripeSubscriptionId: user.stripeSubscriptionId || null,
    subscriptionStatus: user.subscriptionStatus || 'inactive',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function isCreatorAccount(user) {
  if (!user) {
    return false;
  }
  if (creatorUserId && user.id === creatorUserId) {
    return true;
  }
  return CREATOR_EMAILS.has(user.email);
}

function applyCreatorAccess(user) {
  if (!isCreatorAccount(user)) {
    return user;
  }
  if (user.plan !== 'pro') {
    user.plan = 'pro';
  }
  if (user.subscriptionStatus !== 'active') {
    user.subscriptionStatus = 'active';
  }
  user.updatedAt = new Date().toISOString();
  return user;
}

function createUser({ email, password, passwordHash }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('email_required');
  }

  const chosenHash = String(passwordHash || '');
  const chosenPassword = String(password || '');
  if (!chosenHash && chosenPassword.length < 8) {
    throw new Error('weak_password');
  }
  if (usersByEmail.has(normalizedEmail)) {
    throw new Error('email_exists');
  }

  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash: chosenHash || bcrypt.hashSync(chosenPassword, 10),
    plan: 'free',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: 'inactive',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (FIRST_SIGNUP_IS_CREATOR && !creatorUserId && usersById.size === 0) {
    creatorUserId = user.id;
  }
  applyCreatorAccess(user);

  usersById.set(user.id, user);
  usersByEmail.set(user.email, user.id);
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
  const user = usersById.get(userId) || null;
  return user ? applyCreatorAccess(user) : null;
}

function findUserById(id) {
  const user = usersById.get(id) || null;
  return user ? applyCreatorAccess(user) : null;
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

  user.updatedAt = new Date().toISOString();
  return user;
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

module.exports = {
  createUser,
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
  setSubscriptionStatus
};
