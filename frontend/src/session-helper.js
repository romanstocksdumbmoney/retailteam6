const REMEMBER_TOKEN_STORAGE_KEY = 'dumbdollars_remember_token';
const AUTH_TOKEN_STORAGE_KEY = 'dumbdollars_token';

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

function getRememberToken() {
  return String(localStorage.getItem(REMEMBER_TOKEN_STORAGE_KEY) || '').trim();
}

function clearRememberToken() {
  localStorage.removeItem(REMEMBER_TOKEN_STORAGE_KEY);
}

function saveRememberToken(token) {
  const value = String(token || '').trim();
  if (!value) {
    clearRememberToken();
    return;
  }
  localStorage.setItem(REMEMBER_TOKEN_STORAGE_KEY, value);
}

function getAuthHeaders() {
  const token = getStoredAuthToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function restoreSessionIfNeeded() {
  const token = getStoredAuthToken();
  if (token) {
    return { restored: false, token };
  }
  const rememberToken = getRememberToken();
  if (!rememberToken) {
    return { restored: false, token: '' };
  }
  try {
    const payload = await fetchJsonWithAuth('/api/auth/session/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rememberToken })
    });
    const nextToken = String(payload?.token || '').trim();
    if (nextToken) {
      setStoredAuthToken(nextToken);
    }
    if (payload?.rememberToken) {
      saveRememberToken(payload.rememberToken);
    }
    return { restored: true, token: nextToken };
  } catch (_error) {
    clearRememberToken();
    return { restored: false, token: '' };
  }
}
