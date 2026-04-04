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
  const node = document.getElementById('ai-trade-access-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function saveAuthToken(token) {
  localStorage.setItem('dumbdollars_token', String(token || ''));
}

function saveEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return;
  }
  localStorage.setItem('dumbdollars_saved_email', normalized);
}

function applySavedEmail() {
  const saved = String(localStorage.getItem('dumbdollars_saved_email') || '').trim().toLowerCase();
  if (!saved) {
    return;
  }
  const loginEmail = document.getElementById('ai-access-login-email');
  const signupEmail = document.getElementById('ai-access-signup-email');
  if (loginEmail instanceof HTMLInputElement && !loginEmail.value.trim()) {
    loginEmail.value = saved;
  }
  if (signupEmail instanceof HTMLInputElement && !signupEmail.value.trim()) {
    signupEmail.value = saved;
  }
}

async function signUp(email, password) {
  const payload = await fetchJson('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  saveAuthToken(payload.token);
  saveEmail(email);
}

async function logIn(email, password) {
  const payload = await fetchJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  saveAuthToken(payload.token);
  saveEmail(email);
}

async function socialSignIn(provider, email) {
  const payload = await fetchJson('/api/auth/oauth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, email })
  });
  saveAuthToken(payload.token);
  saveEmail(email);
}

function goToSocialAuthPage(provider, email) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const normalizedEmail = normalizeEmailInput(email);
  if (!normalizedProvider) {
    setStatus('Choose a provider first.', true);
    return;
  }
  if (!isLikelyValidEmail(normalizedEmail)) {
    setStatus('Enter a valid email first, then continue with social sign in.', true);
    return;
  }
  const next = encodeURIComponent('/ai-trade.html');
  const providerParam = encodeURIComponent(normalizedProvider);
  const emailParam = encodeURIComponent(normalizedEmail);
  window.location.href = `/social-auth.html?provider=${providerParam}&email=${emailParam}&next=${next}`;
}

function goToAiTrade() {
  window.location.href = '/ai-trade.html';
}

async function verifySessionAndRedirectIfSignedIn() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    return;
  }
  try {
    await fetchJson('/api/auth/me', {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    goToAiTrade();
  } catch (_error) {
    // stale token; let user sign in again
    localStorage.removeItem('dumbdollars_token');
  }
}

function setButtonBusy(button, isBusy, idleLabel, busyLabel) {
  if (!button) {
    return;
  }
  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : idleLabel;
}

function normalizeEmailInput(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase();
}

function isLikelyValidEmail(email) {
  const value = normalizeEmailInput(email);
  if (!value || value.length < 6 || value.length > 254) {
    return false;
  }
  if (value.includes('..') || value.includes(' ')) {
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

function checkPasswordStrength(password) {
  const value = String(password || '');
  const lengthOk = value.length >= 10;
  const upperOk = /[A-Z]/.test(value);
  const lowerOk = /[a-z]/.test(value);
  const digitOk = /\d/.test(value);
  const symbolOk = /[^A-Za-z0-9]/.test(value);
  const passes = [lengthOk, upperOk, lowerOk, digitOk, symbolOk].filter(Boolean).length;
  const strong = passes >= 4 && lengthOk && upperOk && lowerOk && digitOk;
  return {
    strong,
    score: passes,
    checks: { lengthOk, upperOk, lowerOk, digitOk, symbolOk }
  };
}

function describePasswordStrength(password) {
  const result = checkPasswordStrength(password);
  if (result.score <= 2) {
    return 'Weak password. Use at least 10 chars with upper, lower, number, and symbol.';
  }
  if (!result.strong) {
    return 'Decent password, but add more complexity (upper/lower/number/symbol).';
  }
  return 'Strong password.';
}

function setPasswordHint(targetId, password) {
  const node = document.getElementById(targetId);
  if (!node) {
    return;
  }
  const text = describePasswordStrength(password);
  const strong = checkPasswordStrength(password).strong;
  node.textContent = text;
  node.className = strong ? 'small-note auth-ok' : 'small-note';
}

function setupForms() {
  const signupForm = document.getElementById('ai-access-signup-form');
  const loginForm = document.getElementById('ai-access-login-form');
  const socialButtons = Array.from(document.querySelectorAll('.oauth-btn'));
  const signupPasswordInput = document.getElementById('ai-access-signup-password');
  if (!signupForm || !loginForm) {
    return;
  }

  if (signupPasswordInput instanceof HTMLInputElement) {
    signupPasswordInput.addEventListener('input', () => {
      setPasswordHint('ai-access-signup-password-hint', signupPasswordInput.value);
    });
    setPasswordHint('ai-access-signup-password-hint', signupPasswordInput.value || '');
  }

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = normalizeEmailInput(document.getElementById('ai-access-signup-email')?.value || '');
    const password = String(document.getElementById('ai-access-signup-password')?.value || '');
    const submitButton = signupForm.querySelector('button[type="submit"]');
    const idleLabel = submitButton?.textContent || 'Create account';
    try {
      if (!isLikelyValidEmail(email)) {
        throw new Error('Please enter a valid email address.');
      }
      if (!checkPasswordStrength(password).strong) {
        throw new Error('Use a stronger password: 10+ chars with upper/lower/number/symbol.');
      }
      setButtonBusy(submitButton, true, idleLabel, 'Creating...');
      await signUp(email, password);
      setStatus('Account created. Opening AI Trade...');
      goToAiTrade();
    } catch (error) {
      setStatus(error.message || 'Could not create account.', true);
    } finally {
      setButtonBusy(submitButton, false, idleLabel, 'Creating...');
    }
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = normalizeEmailInput(document.getElementById('ai-access-login-email')?.value || '');
    const password = String(document.getElementById('ai-access-login-password')?.value || '');
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const idleLabel = submitButton?.textContent || 'Log in';
    try {
      if (!isLikelyValidEmail(email)) {
        throw new Error('Please enter a valid email address.');
      }
      setButtonBusy(submitButton, true, idleLabel, 'Signing in...');
      await logIn(email, password);
      setStatus('Login successful. Opening AI Trade...');
      goToAiTrade();
    } catch (error) {
      setStatus(error.message || 'Could not log in.', true);
    } finally {
      setButtonBusy(submitButton, false, idleLabel, 'Signing in...');
    }
  });

  socialButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const provider = String(button.getAttribute('data-provider') || '').trim().toLowerCase();
      const loginEmail = normalizeEmailInput(document.getElementById('ai-access-login-email')?.value || '');
      const signupEmail = normalizeEmailInput(document.getElementById('ai-access-signup-email')?.value || '');
      const savedEmail = normalizeEmailInput(localStorage.getItem('dumbdollars_saved_email') || '');
      const email = loginEmail || signupEmail || savedEmail;
      if (!email || !isLikelyValidEmail(email)) {
        setStatus('Enter a valid email first, then choose Google/Apple/etc.', true);
        return;
      }
      button.disabled = true;
      goToSocialAuthPage(provider, email);
      window.setTimeout(() => {
        button.disabled = false;
      }, 1000);
    });
  });
}

async function init() {
  applySavedEmail();
  setupForms();
  await verifySessionAndRedirectIfSignedIn();
}

init();
