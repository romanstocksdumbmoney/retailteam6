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

function setupForms() {
  const signupForm = document.getElementById('ai-access-signup-form');
  const loginForm = document.getElementById('ai-access-login-form');
  const socialButtons = Array.from(document.querySelectorAll('.oauth-btn'));
  if (!signupForm || !loginForm) {
    return;
  }

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = String(document.getElementById('ai-access-signup-email')?.value || '').trim().toLowerCase();
    const password = String(document.getElementById('ai-access-signup-password')?.value || '');
    const submitButton = signupForm.querySelector('button[type="submit"]');
    const idleLabel = submitButton?.textContent || 'Create account';
    try {
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
    const email = String(document.getElementById('ai-access-login-email')?.value || '').trim().toLowerCase();
    const password = String(document.getElementById('ai-access-login-password')?.value || '');
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const idleLabel = submitButton?.textContent || 'Log in';
    try {
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
      const loginEmail = String(document.getElementById('ai-access-login-email')?.value || '').trim().toLowerCase();
      const signupEmail = String(document.getElementById('ai-access-signup-email')?.value || '').trim().toLowerCase();
      const savedEmail = String(localStorage.getItem('dumbdollars_saved_email') || '').trim().toLowerCase();
      const email = loginEmail || signupEmail || savedEmail;
      if (!email) {
        setStatus('Enter your email first, then choose Google/Apple/etc.', true);
        return;
      }
      try {
        button.disabled = true;
        await socialSignIn(provider, email);
        setStatus('Social sign in successful. Opening AI Trade...');
        goToAiTrade();
      } catch (error) {
        setStatus(error.message || 'Social sign in failed.', true);
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function init() {
  applySavedEmail();
  setupForms();
  await verifySessionAndRedirectIfSignedIn();
}

init();
