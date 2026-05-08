async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch (_error) {
      body = { message: 'Unknown API error' };
    }
    const status = Number(response.status || 0);
    const rawMessage = String(body?.message || '').trim();
    const fallbackMessage = status === 401
      ? 'Session expired. Please try signing in again.'
      : status === 429
        ? 'Too many attempts. Please wait a moment and retry.'
        : status >= 500
          ? 'Sign-in service is temporarily unavailable. Please retry shortly.'
          : `Request failed (${status || 'network'}).`;
    const error = new Error(rawMessage && !/^[a-z0-9_]+$/i.test(rawMessage) ? rawMessage : fallbackMessage);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function setStatus(text, isError = false) {
  const node = document.getElementById('social-auth-status');
  if (!node) {
    return;
  }
  const normalized = String(text || '');
  node.textContent = normalized;
  const isLoading = /\b(connecting|loading|checking|redirecting|signing)\b/i.test(normalized);
  node.className = isError
    ? 'small-note auth-error'
    : isLoading
      ? 'small-note status-loading'
      : 'small-note';
}

function ensureToastStack() {
  let stack = document.getElementById('social-auth-toast-stack');
  if (stack instanceof HTMLElement) {
    return stack;
  }
  stack = document.createElement('div');
  stack.id = 'social-auth-toast-stack';
  stack.className = 'auth-toast-stack';
  document.body.appendChild(stack);
  return stack;
}

function showToast(message, tone = 'info', timeoutMs = 3600) {
  const stack = ensureToastStack();
  const toast = document.createElement('div');
  toast.className = `auth-toast auth-toast--${tone}`;
  toast.textContent = String(message || '');
  stack.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, Math.max(1200, timeoutMs));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isLikelyValidEmail(email) {
  const value = normalizeEmail(email);
  if (!value || value.length < 6 || value.length > 254) {
    return false;
  }
  const match = value.match(/^([a-z0-9._%+-]+)@([a-z0-9.-]+)\.([a-z]{2,})$/i);
  if (!match) {
    return false;
  }
  const local = match[1];
  const domain = match[2];
  if (local.startsWith('.') || local.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) {
    return false;
  }
  if (domain.split('.').some((part) => !part || part.startsWith('-') || part.endsWith('-'))) {
    return false;
  }
  return true;
}

function getQueryParam(name) {
  return String(new URLSearchParams(window.location.search).get(name) || '').trim();
}

function getSafeNextPath() {
  const next = getQueryParam('next');
  if (!next) {
    return '/';
  }
  if (next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return '/';
}

function getSelectedTraderMode() {
  const modeSelect = document.getElementById('social-auth-trader-mode');
  if (!(modeSelect instanceof HTMLSelectElement)) {
    return 'day';
  }
  const value = String(modeSelect.value || '').trim().toLowerCase();
  if (value === 'scalper' || value === 'day' || value === 'swing' || value === 'long') {
    return value;
  }
  return 'day';
}

function saveAuthSession(token, email) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    localStorage.removeItem('dumbdollars_token');
  } else {
    localStorage.setItem('dumbdollars_token', normalizedToken);
  }
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    localStorage.setItem('dumbdollars_saved_email', normalizedEmail);
  }
}

function wantsRememberSessionFromQuery() {
  const raw = String(getQueryParam('remember') || '').trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

async function doSocialSignIn(provider, email, remember = true) {
  const traderMode = getSelectedTraderMode();
  return fetchJson('/api/auth/oauth/signin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, email, traderMode, remember })
  });
}

function providerLabel(provider) {
  const map = {
    google: 'Google',
    apple: 'Apple',
    github: 'GitHub',
    discord: 'Discord',
    x: 'X'
  };
  return map[String(provider || '').toLowerCase()] || String(provider || 'Provider');
}

function setupButtons() {
  const emailInput = document.getElementById('social-auth-email');
  const modeSelect = document.getElementById('social-auth-trader-mode');
  const buttons = Array.from(document.querySelectorAll('.social-auth-provider-btn, .social-auth-continue-btn'));
  if (!(emailInput instanceof HTMLInputElement)) {
    return;
  }
  const preferredFromQuery = normalizeEmail(getQueryParam('email'));
  const modeFromQuery = String(getQueryParam('traderMode') || '').trim().toLowerCase();
  const storedEmail = normalizeEmail(localStorage.getItem('dumbdollars_saved_email') || '');
  emailInput.value = preferredFromQuery || storedEmail || '';
  if (modeSelect instanceof HTMLSelectElement) {
    const allowedModes = new Set(['scalper', 'day', 'swing', 'long']);
    const initialMode = allowedModes.has(modeFromQuery) ? modeFromQuery : 'day';
    modeSelect.value = initialMode;
  }

  buttons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const provider = String(button.getAttribute('data-provider') || '').trim().toLowerCase();
      const label = providerLabel(provider);
      setStatus(`Coming soon — ${label} login is in development.`);
      showToast(`Coming soon — ${label} login is in development.`, 'info', 4200);
    });
  });
}

async function init() {
  setupButtons();
}

init();
