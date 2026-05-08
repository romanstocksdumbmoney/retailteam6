const express = require('express');
const { requireApiAuth } = require('../services/routeAuth');
const { findUserByEmail, updateUser, sanitizeUser } = require('../services/userStore');

const router = express.Router();

function normalizeDisplayName(value) {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) {
    return '';
  }
  return compact.slice(0, 60);
}

function fallbackDisplayNameFromEmail(email) {
  const localPart = String(email || '')
    .split('@')[0]
    .trim()
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return localPart || 'Trader';
}

function hasCustomDisplayName(displayName, email) {
  const normalized = normalizeDisplayName(displayName);
  if (!normalized) {
    return false;
  }
  return normalized.toLowerCase() !== fallbackDisplayNameFromEmail(email).toLowerCase();
}

function buildProfileResponse(user) {
  const safeUser = sanitizeUser(user);
  const displayName = normalizeDisplayName(safeUser?.displayName || '') || fallbackDisplayNameFromEmail(safeUser?.email || '');
  return {
    id: safeUser?.id || '',
    email: safeUser?.email || '',
    plan: safeUser?.plan || 'free',
    traderMode: safeUser?.traderMode || 'day',
    displayName,
    display_name: displayName,
    needsDisplayName: !hasCustomDisplayName(displayName, safeUser?.email || ''),
    updatedAt: safeUser?.updatedAt || null
  };
}

router.get('/profile', requireApiAuth, (req, res) => {
  const email = String(req.user?.email || '').trim().toLowerCase();
  const user = findUserByEmail(email);
  if (!user) {
    return res.status(404).json({
      error: 'user_not_found',
      message: 'Could not load profile.'
    });
  }
  return res.json({
    ok: true,
    user: buildProfileResponse(user)
  });
});

router.post('/update-profile', requireApiAuth, (req, res) => {
  const nextDisplayName = normalizeDisplayName(req.body?.display_name || req.body?.displayName || '');
  if (!nextDisplayName) {
    return res.status(400).json({
      error: 'display_name_required',
      message: 'Display name is required.'
    });
  }
  const email = String(req.user?.email || '').trim().toLowerCase();
  const existingUser = findUserByEmail(email);
  if (!existingUser) {
    return res.status(404).json({
      error: 'user_not_found',
      message: 'Could not update profile.'
    });
  }
  const updated = updateUser(existingUser.id, { displayName: nextDisplayName });
  if (!updated) {
    return res.status(500).json({
      error: 'profile_update_failed',
      message: 'Could not update profile right now.'
    });
  }
  return res.json({
    ok: true,
    message: 'Profile updated.',
    user: buildProfileResponse(updated)
  });
});

module.exports = router;
