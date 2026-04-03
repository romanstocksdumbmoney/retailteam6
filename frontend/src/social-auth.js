async function fetchJson(url, options = {}) {
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
    throw error;
  }
  return response.json();
}

function setStatus(text, isError = false) {
  const node = document.getElementById('social-auth-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
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

function saveAuthSession(token, email) {
  localStorage.setItem('dumbdollars_token', String(token || ''));
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    localStorage.setItem('dumbdollars_saved_email', normalizedEmail);
  }
}

async function doSocialSignIn(provider, email) {
  return fetchJson('/api/auth/oauth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, email })
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
  const buttons = Array.from(document.querySelectorAll('.social-auth-continue-btn'));
  if (!(emailInput instanceof HTMLInputElement)) {
    return;
  }
  const preferredFromQuery = normalizeEmail(getQueryParam('email'));
  const storedEmail = normalizeEmail(localStorage.getItem('dumbdollars_saved_email') || '');
  emailInput.value = preferredFromQuery || storedEmail || '';

  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const provider = String(button.getAttribute('data-provider') || '').trim().toLowerCase();
      const email = normalizeEmail(emailInput.value);
      if (!isLikelyValidEmail(email)) {
        setStatus('Enter a valid email to continue.', true);
        return;
      }
      const idle = button.textContent || 'Continue';
      try {
        button.disabled = true;
        button.textContent = 'Connecting...';
        setStatus(`Connecting ${providerLabel(provider)} sign in...`);
        const payload = await doSocialSignIn(provider, email);
        saveAuthSession(payload.token, payload?.user?.email || email);
        const next = getSafeNextPath();
        setStatus('Sign in complete. Redirecting...');
        window.location.href = next;
      } catch (error) {
        setStatus(error.message || 'Social sign in failed.', true);
      } finally {
        button.disabled = false;
        button.textContent = idle;
      }
    });
  });
}

async function init() {
  setupButtons();
}

init();
