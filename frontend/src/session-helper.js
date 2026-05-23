const AUTH_TOKEN_STORAGE_KEY = 'dumbdollars_token';
const CHECKOUT_RETURN_PATH_STORAGE_KEY = 'dumbdollars_return_after_checkout';

async function fetchJsonWithAuth(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch (_error) {
      body = { message: 'Unknown API error' };
    }
    const error = new Error(body.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return response.json();
}

function getStoredAuthToken() {
  return String(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '').trim();
}

function setStoredAuthToken(token) {
  const value = String(token || '').trim();
  if (!value) {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, value);
}

function getAuthHeaders() {
  const token = getStoredAuthToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

function getCurrentAppPath() {
  const currentPath = `${window.location.pathname || '/'}${window.location.search || ''}${window.location.hash || ''}`;
  if (!currentPath.startsWith('/')) {
    return '/';
  }
  return currentPath;
}

function normalizeAppPath(path) {
  const raw = String(path || '').trim();
  if (!raw.startsWith('/')) {
    return '';
  }
  if (raw.startsWith('//')) {
    return '';
  }
  return raw;
}

function getSignInUrl(nextPath) {
  const fallback = getCurrentAppPath();
  const safeNextPath = String(nextPath || fallback).trim();
  const normalizedNext = safeNextPath.startsWith('/') ? safeNextPath : fallback;
  return `/ai-trade-access.html?next=${encodeURIComponent(normalizedNext)}`;
}

function redirectToSignIn(nextPath) {
  window.location.href = getSignInUrl(nextPath);
}

function rememberCheckoutReturnPath(nextPath) {
  const fallback = getCurrentAppPath();
  const safePath = normalizeAppPath(nextPath) || fallback;
  try {
    sessionStorage.setItem(CHECKOUT_RETURN_PATH_STORAGE_KEY, safePath);
  } catch (_error) {
    // Session storage may be unavailable in locked browser contexts.
  }
}

function consumeCheckoutReturnPath() {
  try {
    const value = String(sessionStorage.getItem(CHECKOUT_RETURN_PATH_STORAGE_KEY) || '').trim();
    sessionStorage.removeItem(CHECKOUT_RETURN_PATH_STORAGE_KEY);
    return normalizeAppPath(value);
  } catch (_error) {
    return '';
  }
}

function clearSignInCallout(statusElementId) {
  const statusNode = document.getElementById(statusElementId);
  if (!statusNode) {
    return;
  }
  const parent = statusNode.parentElement;
  if (!parent) {
    return;
  }
  const existing = parent.querySelector(`[data-signin-callout-for="${statusElementId}"]`);
  if (existing) {
    existing.remove();
  }
}

function showSignInCallout({
  statusElementId,
  message = 'Please sign in to continue.',
  nextPath = getCurrentAppPath(),
  linkLabel = 'Sign in to continue'
} = {}) {
  const statusId = String(statusElementId || '').trim();
  if (!statusId) {
    return;
  }
  const statusNode = document.getElementById(statusId);
  if (!statusNode) {
    return;
  }
  statusNode.textContent = message;
  statusNode.classList.add('auth-error');
  const parent = statusNode.parentElement;
  if (!parent) {
    return;
  }
  clearSignInCallout(statusId);
  const callout = document.createElement('p');
  callout.className = 'small-note';
  callout.setAttribute('data-signin-callout-for', statusId);
  const link = document.createElement('a');
  link.className = 'open-link';
  link.href = getSignInUrl(nextPath);
  link.textContent = linkLabel;
  callout.appendChild(link);
  statusNode.insertAdjacentElement('afterend', callout);
}

async function restoreSessionIfNeeded() {
  const token = getStoredAuthToken();
  if (token) {
    return { restored: false, token };
  }
  try {
    const payload = await fetchJsonWithAuth('/api/auth/session/restore', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    const nextToken = String(payload?.token || '').trim();
    if (nextToken) {
      setStoredAuthToken(nextToken);
    }
    return { restored: true, token: nextToken };
  } catch (_error) {
    return { restored: false, token: '' };
  }
}

window.getStoredAuthToken = getStoredAuthToken;
window.setStoredAuthToken = setStoredAuthToken;
window.getAuthHeaders = getAuthHeaders;
window.restoreSessionIfNeeded = restoreSessionIfNeeded;
window.getSignInUrl = getSignInUrl;
window.redirectToSignIn = redirectToSignIn;
window.rememberCheckoutReturnPath = rememberCheckoutReturnPath;
window.consumeCheckoutReturnPath = consumeCheckoutReturnPath;
window.showSignInCallout = showSignInCallout;
window.clearSignInCallout = clearSignInCallout;
