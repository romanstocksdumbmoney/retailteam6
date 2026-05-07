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
    error.body = body;
    throw error;
  }
  return response.json();
}

const DEFAULT_NEXT_PATH = '/dashboard';
const AUTH_PAGE_MODE_LOGIN = 'login';
const AUTH_PAGE_MODE_SIGNUP = 'signup';
const TRADER_MODE_STORAGE_KEY = 'dumbdollars_trader_mode';
const DEFAULT_TRADER_MODE = 'day';
let lockoutCountdownTimer = null;
const TRADER_MODE_DETAILS = Object.freeze({
  scalper: {
    label: 'Scalper',
    risk: 'High',
    horizon: 'Seconds to minutes',
    description: 'Fast trades, high frequency, rapid entries/exits.'
  },
  day: {
    label: 'Day Trader',
    risk: 'Medium-High',
    horizon: 'Minutes to hours',
    description: 'Intraday setups with no overnight position risk.'
  },
  swing: {
    label: 'Swing Trader',
    risk: 'Medium',
    horizon: 'Days to weeks',
    description: 'Trend and pattern-based setups over multiple sessions.'
  },
  long: {
    label: 'Long-Term Investor',
    risk: 'Low-Medium',
    horizon: 'Months to years',
    description: 'Fundamental and macro-driven investing with long horizon.'
  }
});

function setStatus(text, isError = false) {
  const node = document.getElementById('ai-access-status')
    || document.getElementById('ai-trade-access-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function clearStatusActions() {
  if (lockoutCountdownTimer) {
    window.clearInterval(lockoutCountdownTimer);
    lockoutCountdownTimer = null;
  }
  const actions = document.getElementById('ai-access-status-actions');
  if (!(actions instanceof HTMLElement)) {
    return;
  }
  actions.innerHTML = '';
}

function renderStatusActionLink(label, href) {
  const actions = document.getElementById('ai-access-status-actions');
  if (!(actions instanceof HTMLElement)) {
    return;
  }
  const link = document.createElement('a');
  link.className = 'link-button';
  link.href = href;
  link.textContent = label;
  actions.appendChild(link);
}

function startLockoutCountdown(lockoutUntilIso) {
  const lockoutUntilTs = Date.parse(String(lockoutUntilIso || ''));
  if (!Number.isFinite(lockoutUntilTs)) {
    return;
  }
  const tick = () => {
    const minutes = Math.max(1, Math.ceil((lockoutUntilTs - Date.now()) / (60 * 1000)));
    setStatus(`Account temporarily locked. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, true);
    if (Date.now() >= lockoutUntilTs) {
      window.clearInterval(lockoutCountdownTimer);
      lockoutCountdownTimer = null;
      setStatus('Lockout ended. You can try signing in again.', false);
      clearStatusActions();
    }
  };
  tick();
  lockoutCountdownTimer = window.setInterval(tick, 1000);
}

function renderResendVerificationAction(email) {
  const actions = document.getElementById('ai-access-status-actions');
  if (!(actions instanceof HTMLElement)) {
    return;
  }
  actions.innerHTML = '';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-button';
  button.textContent = 'Resend verification email';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await fetchJson('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email || '').trim().toLowerCase() })
      });
      setStatus('Verification email sent. Check inbox and spam folder.');
    } catch (error) {
      setStatus(error.message || 'Could not resend verification email.', true);
    } finally {
      button.disabled = false;
    }
  });
  actions.appendChild(button);
}

function mapLoginErrorMessage(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.body?.error || '').trim().toLowerCase();
  const message = String(error?.message || '').trim();
  if (status === 404 || code === 'unknown_email') {
    return 'No account found with that email address.';
  }
  if (status === 401 || code === 'incorrect_password') {
    return message || 'Incorrect password.';
  }
  if (status === 403 || code === 'email_not_verified') {
    return 'Please verify your email before signing in.';
  }
  if (status === 403 || code === 'account_suspended') {
    return 'This account has been suspended. Contact support.';
  }
  if (status === 429 || code === 'too_many_attempts') {
    return message || 'Account temporarily locked. Try again in 15 minutes.';
  }
  return message || 'Could not log in.';
}

function mapSignupErrorMessage(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.body?.error || '').trim().toLowerCase();
  const message = String(error?.message || '').trim();
  if (status === 409 || code === 'email_in_use') {
    return 'An account with that email already exists.';
  }
  if (status === 400 && code === 'invalid_email') {
    return 'Enter a valid email address.';
  }
  if (status === 400 && code === 'password_mismatch') {
    return 'Passwords do not match.';
  }
  if (status === 400 && code === 'weak_password') {
    return 'Password must be at least 8 characters with uppercase, number, and special character.';
  }
  return message || 'Could not create account.';
}

function saveAuthToken(token) {
  const value = String(token || '').trim();
  if (!value) {
    localStorage.removeItem('dumbdollars_token');
    return;
  }
  localStorage.setItem('dumbdollars_token', value);
}

function clearAuthToken() {
  localStorage.removeItem('dumbdollars_token');
}

function saveEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return;
  }
  localStorage.setItem('dumbdollars_saved_email', normalized);
}

function applyAuthPayload(payload, fallbackEmail = '') {
  saveAuthToken(payload?.token || '');
  const email = String(payload?.user?.email || fallbackEmail || '').trim().toLowerCase();
  if (email) {
    saveEmail(email);
  }
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

function normalizeTraderMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TRADER_MODE_DETAILS, value)) {
    return value;
  }
  return DEFAULT_TRADER_MODE;
}

function saveTraderMode(mode) {
  const normalized = normalizeTraderMode(mode);
  localStorage.setItem(TRADER_MODE_STORAGE_KEY, normalized);
  return normalized;
}

function getStoredTraderMode() {
  return normalizeTraderMode(localStorage.getItem(TRADER_MODE_STORAGE_KEY) || DEFAULT_TRADER_MODE);
}

function getSelectedTraderModeFromUi() {
  const active = document.querySelector('.ai-trader-mode-option[aria-pressed="true"]');
  if (!(active instanceof HTMLElement)) {
    return getStoredTraderMode();
  }
  return normalizeTraderMode(active.getAttribute('data-trader-mode'));
}

function applyTraderModeSelection(mode, options = {}) {
  const normalized = normalizeTraderMode(mode);
  const { persist = true } = options;
  document.querySelectorAll('.ai-trader-mode-option[data-trader-mode]').forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const isActive = normalizeTraderMode(button.getAttribute('data-trader-mode')) === normalized;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.classList.toggle('ai-trader-mode-option--active', isActive);
  });
  const preview = document.getElementById('ai-access-trader-mode-summary');
  const details = TRADER_MODE_DETAILS[normalized];
  if (preview instanceof HTMLElement && details) {
    preview.textContent = `Selected: ${details.label}. Risk: ${details.risk}. Time horizon: ${details.horizon}.`;
  }
  if (persist) {
    saveTraderMode(normalized);
  }
  return normalized;
}

function setupTraderModePicker() {
  const modeButtons = Array.from(document.querySelectorAll('.ai-trader-mode-option[data-trader-mode]'));
  if (!modeButtons.length) {
    return;
  }
  const queryMode = normalizeTraderMode(getQueryParam('traderMode') || '');
  const initialMode = getQueryParam('traderMode')
    ? queryMode
    : getStoredTraderMode();
  applyTraderModeSelection(initialMode, { persist: true });
  modeButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.addEventListener('click', () => {
      applyTraderModeSelection(button.getAttribute('data-trader-mode'), { persist: true });
    });
  });
}

async function signUp(email, password, options = {}) {
  const traderMode = normalizeTraderMode(options.traderMode);
  const confirmPassword = String(options.confirmPassword || '');
  const remember = options.remember !== false;
  const payload = await fetchJson('/api/auth/signup', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      confirmPassword,
      traderMode,
      remember
    })
  });
  applyAuthPayload(payload, email);
  saveTraderMode(payload?.user?.traderMode || traderMode);
}

async function logIn(email, password, options = {}) {
  const remember = options.remember !== false;
  const payload = await fetchJson('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      remember
    })
  });
  applyAuthPayload(payload, email);
}

async function socialSignIn(provider, email, options = {}) {
  const traderMode = normalizeTraderMode(options.traderMode);
  const remember = options.remember !== false;
  const payload = await fetchJson('/api/auth/oauth/signin', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      email,
      traderMode,
      remember
    })
  });
  applyAuthPayload(payload, email);
  saveTraderMode(payload?.user?.traderMode || traderMode);
}

async function requestAccessCode(email) {
  return fetchJson('/api/auth/forgot-password', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
}

async function verifyAccessCodeAndRestore(email, code, options = {}) {
  const nextPassword = String(options.password || '').trim();
  if (!nextPassword) {
    throw new Error('Enter a new password to complete reset.');
  }
  const payload = await fetchJson('/api/auth/reset-password', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: code,
      password: nextPassword,
      confirmPassword: nextPassword
    })
  });
  return payload;
}

function goToSocialAuthPage(provider, email) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const normalizedEmail = normalizeEmailInput(email);
  if (!normalizedProvider) {
    setStatus('Choose a provider first.', true);
    return;
  }
  const next = encodeURIComponent(getSafeNextPath());
  const providerParam = encodeURIComponent(normalizedProvider);
  const traderModeParam = encodeURIComponent(getSelectedTraderModeFromUi());
  const emailSegment = isLikelyValidEmail(normalizedEmail)
    ? `&email=${encodeURIComponent(normalizedEmail)}`
    : '';
  window.location.href = `/social-auth.html?provider=${providerParam}${emailSegment}&traderMode=${traderModeParam}&next=${next}`;
}

function getSafeNextPath() {
  const raw = String(new URLSearchParams(window.location.search).get('next') || '').trim();
  if (!raw) {
    return DEFAULT_NEXT_PATH;
  }
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return DEFAULT_NEXT_PATH;
}

function getRequestedAuthMode() {
  const mode = String(new URLSearchParams(window.location.search).get('mode') || '')
    .trim()
    .toLowerCase();
  if (mode === AUTH_PAGE_MODE_LOGIN || mode === AUTH_PAGE_MODE_SIGNUP) {
    return mode;
  }
  return '';
}

function applyRequestedAuthMode() {
  const mode = getRequestedAuthMode();
  if (!mode) {
    return;
  }
  const loginForm = document.getElementById('ai-access-login-form');
  const signupForm = document.getElementById('ai-access-signup-form');
  const title = document.getElementById('ai-trade-access-title');
  const subtitle = document.querySelector('.pro-plan-subtitle');
  if (!(loginForm instanceof HTMLElement) || !(signupForm instanceof HTMLElement)) {
    return;
  }
  if (mode === AUTH_PAGE_MODE_LOGIN) {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    if (title) {
      title.textContent = 'Log in to your DumbDollars account';
    }
    if (subtitle) {
      subtitle.textContent = 'Welcome back. Log in to continue into your AI trading workspace.';
    }
    return;
  }
  signupForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  if (title) {
    title.textContent = 'Create your DumbDollars account';
  }
  if (subtitle) {
    subtitle.textContent = 'Create an account to continue into your AI trading workspace.';
  }
}

function goToNextPath() {
  window.location.href = getSafeNextPath();
}

async function hydrateSessionUser(token) {
  const authToken = String(token || '').trim();
  if (!authToken) {
    return null;
  }
  const payload = await fetchJson('/api/auth/me', {
    headers: { authorization: `Bearer ${authToken}` }
  });
  return payload?.user || null;
}

async function verifySessionAndRedirectIfSignedIn() {
  async function restoreFromSessionCookie() {
    try {
      const restorePayload = await fetchJson('/api/auth/session/restore', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      applyAuthPayload(restorePayload, restorePayload?.user?.email || '');
      return String(restorePayload?.token || '').trim();
    } catch (restoreError) {
      return '';
    }
  }

  let token = String(localStorage.getItem('dumbdollars_token') || '').trim();
  if (!token) {
    token = await restoreFromSessionCookie();
    if (!token) {
      return;
    }
  }
  try {
    await hydrateSessionUser(token);
    goToNextPath();
    return;
  } catch (_error) {
    clearAuthToken();
  }

  token = await restoreFromSessionCookie();
  if (!token) {
    return;
  }
  try {
    await hydrateSessionUser(token);
    goToNextPath();
  } catch (_retryError) {
    clearAuthToken();
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
  const checks = {
    minLength: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    number: /\d/.test(value),
    special: /[^A-Za-z0-9]/.test(value)
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const valid = checks.minLength && checks.uppercase && checks.number && checks.special;
  let level = 'weak';
  if (valid) {
    level = 'strong';
  } else if (passed >= 3) {
    level = 'medium';
  }
  return {
    valid,
    level,
    checks
  };
}

function describePasswordStrength(password) {
  const state = checkPasswordStrength(password);
  if (state.level === 'strong') {
    return 'Strong';
  }
  if (state.level === 'medium') {
    return 'Medium';
  }
  return 'Weak';
}

function setPasswordHint(targetId, password) {
  const node = document.getElementById(targetId);
  if (!node) {
    return;
  }
  const state = checkPasswordStrength(password);
  const label = describePasswordStrength(password);
  const suffix = state.valid
    ? 'Meets requirements.'
    : 'Use at least 8 chars with 1 uppercase, 1 number, and 1 special character.';
  node.textContent = `${label} — ${suffix}`;
  node.className = `small-note password-strength password-strength--${state.level}`;
}

function setupPasswordVisibilityToggles() {
  const bind = (toggleId, inputId) => {
    const toggle = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (!(toggle instanceof HTMLButtonElement) || !(input instanceof HTMLInputElement)) {
      return;
    }
    toggle.addEventListener('click', () => {
      const nextType = input.type === 'password' ? 'text' : 'password';
      input.type = nextType;
      toggle.textContent = nextType === 'password' ? '👁' : '🙈';
      toggle.setAttribute('aria-label', nextType === 'password' ? 'Show password' : 'Hide password');
    });
  };
  bind('ai-access-signup-toggle', 'ai-access-signup-password');
  bind('ai-access-signup-confirm-toggle', 'ai-access-signup-confirm-password');
  bind('ai-access-login-toggle', 'ai-access-login-password');
}

function setupForms() {
  const signupForm = document.getElementById('ai-access-signup-form');
  const loginForm = document.getElementById('ai-access-login-form');
  const accessCodeRequestForm = document.getElementById('ai-access-code-request-form');
  const accessCodeVerifyForm = document.getElementById('ai-access-code-verify-form');
  const socialButtons = Array.from(document.querySelectorAll('.oauth-btn'));
  const signupPasswordInput = document.getElementById('ai-access-signup-password');
  const accessCodeEmailInput = document.getElementById('ai-access-code-email');
  const accessCodeInput = document.getElementById('ai-access-code-input');
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
    const confirmPassword = String(document.getElementById('ai-access-signup-confirm-password')?.value || '');
    const remember = Boolean(document.getElementById('ai-access-signup-remember')?.checked ?? true);
    const submitButton = signupForm.querySelector('button[type="submit"]');
    const idleLabel = submitButton?.textContent || 'Create account';
    try {
      clearStatusActions();
      if (!isLikelyValidEmail(email)) {
        throw new Error('Please enter a valid email address.');
      }
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }
      if (!checkPasswordStrength(password).valid) {
        throw new Error('Password must be at least 8 characters with uppercase, number, and special character.');
      }
      setButtonBusy(submitButton, true, idleLabel, 'Creating...');
      const traderMode = getSelectedTraderModeFromUi();
      await signUp(email, password, {
        traderMode,
        confirmPassword,
        remember
      });
      setStatus('Account created. Check your email to verify before signing in.');
      window.location.href = '/ai-trade-access.html?mode=login';
    } catch (error) {
      setStatus(mapSignupErrorMessage(error), true);
    } finally {
      setButtonBusy(submitButton, false, idleLabel, 'Creating...');
    }
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = normalizeEmailInput(document.getElementById('ai-access-login-email')?.value || '');
    const password = String(document.getElementById('ai-access-login-password')?.value || '');
    const remember = Boolean(document.getElementById('ai-access-login-remember')?.checked ?? true);
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const idleLabel = submitButton?.textContent || 'Log in';
    try {
      clearStatusActions();
      if (!isLikelyValidEmail(email)) {
        throw new Error('Please enter a valid email address.');
      }
      setButtonBusy(submitButton, true, idleLabel, 'Signing in...');
      await logIn(email, password, { remember });
      await hydrateSessionUser(String(localStorage.getItem('dumbdollars_token') || '').trim());
      setStatus('Login successful. Redirecting...');
      goToNextPath();
    } catch (error) {
      const code = String(error?.body?.error || '').trim().toLowerCase();
      const mappedMessage = mapLoginErrorMessage(error);
      if (code === 'email_not_verified' || mappedMessage === 'Please verify your email before signing in.') {
        setStatus('Please verify your email before signing in.', true);
        renderResendVerificationAction(email);
        return;
      }
      if (code === 'unknown_email') {
        setStatus(mappedMessage, true);
        renderStatusActionLink('Create Account', '/register');
        return;
      }
      if (code === 'too_many_attempts') {
        setStatus(mappedMessage, true);
        renderStatusActionLink('Reset Password Instead', '/forgot-password');
        startLockoutCountdown(error?.body?.lockoutUntil || '');
        return;
      }
      clearStatusActions();
      setStatus(mappedMessage, true);
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
      const traderMode = getSelectedTraderModeFromUi();
      button.disabled = true;
      setStatus('Opening social sign-in...');
      saveTraderMode(traderMode);
      goToSocialAuthPage(provider, email);
      window.setTimeout(() => {
        button.disabled = false;
      }, 1000);
    });
  });

  if (accessCodeRequestForm instanceof HTMLFormElement) {
    const requestCodeButton = accessCodeRequestForm.querySelector('button[type="submit"]');
    accessCodeRequestForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = normalizeEmailInput(accessCodeEmailInput?.value || '');
      const idleLabel = requestCodeButton?.textContent || 'Send my account code';
      try {
        if (!isLikelyValidEmail(email)) {
          throw new Error('Enter the same email used on your account.');
        }
        setButtonBusy(requestCodeButton, true, idleLabel, 'Sending code...');
        await requestAccessCode(email, 'password_reset');
        setStatus('If an account exists with that email, a reset link has been sent. Check inbox and spam.');
      } catch (error) {
        setStatus(error.message || 'Could not send account code.', true);
      } finally {
        setButtonBusy(requestCodeButton, false, idleLabel, 'Sending code...');
      }
    });
  }

  if (accessCodeVerifyForm instanceof HTMLFormElement) {
    const verifyCodeButton = accessCodeVerifyForm.querySelector('button[type="submit"]');
    accessCodeVerifyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const code = String(accessCodeInput?.value || '').trim().toUpperCase();
      const idleLabel = verifyCodeButton?.textContent || 'Verify code + restore Pro';
      try {
        if (!code || code.length < 6) {
          throw new Error('Enter the full access code from email.');
        }
        setButtonBusy(verifyCodeButton, true, idleLabel, 'Verifying...');
        setStatus('This flow now uses reset links from email. Open the link sent to your inbox to continue.');
      } catch (error) {
        setStatus(error.message || 'Could not verify access code.', true);
      } finally {
        setButtonBusy(verifyCodeButton, false, idleLabel, 'Verifying...');
      }
    });
  }
}

async function init() {
  setupTraderModePicker();
  setupPasswordVisibilityToggles();
  applySavedEmail();
  setupForms();
  applyRequestedAuthMode();
  await verifySessionAndRedirectIfSignedIn();
}

init();
