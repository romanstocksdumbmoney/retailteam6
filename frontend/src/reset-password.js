async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload?.message || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function getToken() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get('token') || '').trim();
}

function setStatus(text, isError = false) {
  const node = document.getElementById('reset-password-status');
  if (!node) {
    return;
  }
  node.textContent = String(text || '');
  node.className = isError ? 'small-note auth-error' : 'small-note auth-ok';
}

function evaluatePasswordStrength(password) {
  const value = String(password || '');
  const checks = {
    minLength: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    number: /[0-9]/.test(value),
    special: /[^A-Za-z0-9]/.test(value)
  };
  const score = Object.values(checks).filter(Boolean).length;
  const ok = checks.minLength && checks.uppercase && checks.number && checks.special;
  const label = ok ? 'Strong' : score >= 3 ? 'Medium' : 'Weak';
  return { ok, label };
}

function setupStrengthMeter() {
  const input = document.getElementById('reset-password-new');
  const hint = document.getElementById('reset-password-strength');
  if (!(input instanceof HTMLInputElement) || !(hint instanceof HTMLElement)) {
    return;
  }
  const update = () => {
    const state = evaluatePasswordStrength(input.value);
    hint.textContent = `Password strength: ${state.label}`;
    hint.className = `password-strength ${
      state.label === 'Strong'
        ? 'password-strength--strong'
        : state.label === 'Medium'
          ? 'password-strength--medium'
          : 'password-strength--weak'
    }`;
  };
  input.addEventListener('input', update);
  update();
}

async function validateTokenOrFail() {
  const token = getToken();
  if (!token) {
    setStatus('Reset token is missing. Request a new reset email.', true);
    return false;
  }
  try {
    await fetchJson(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
    return true;
  } catch (_error) {
    setStatus('Reset link is invalid or expired. Request a new one.', true);
    return false;
  }
}

function setupForm() {
  const form = document.getElementById('reset-password-form');
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = getToken();
    const password = String(document.getElementById('reset-password-new')?.value || '');
    const confirmPassword = String(document.getElementById('reset-password-confirm')?.value || '');
    const state = evaluatePasswordStrength(password);
    if (!token) {
      setStatus('Reset token is missing. Request a new reset email.', true);
      return;
    }
    if (!state.ok) {
      setStatus('Use at least 8 chars with uppercase, number, and special character.', true);
      return;
    }
    if (password !== confirmPassword) {
      setStatus('Passwords do not match.', true);
      return;
    }
    const submit = document.getElementById('reset-password-submit') || form.querySelector('button[type="submit"]');
    const idleText = submit?.textContent || 'Reset Password';
    try {
      if (submit instanceof HTMLButtonElement) {
        submit.disabled = true;
        submit.textContent = 'Resetting...';
      }
      await fetchJson('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          confirmPassword
        })
      });
      setStatus('Password reset successfully. Please sign in.');
      window.setTimeout(() => {
        window.location.href = '/ai-trade-access.html?mode=login&reset=success';
      }, 900);
    } catch (error) {
      setStatus(error.message || 'Could not reset password.', true);
    } finally {
      if (submit instanceof HTMLButtonElement) {
        submit.disabled = false;
        submit.textContent = idleText;
      }
    }
  });
}

async function init() {
  setupStrengthMeter();
  setupForm();
  const valid = await validateTokenOrFail();
  if (!valid) {
    const form = document.getElementById('reset-password-form');
    if (form instanceof HTMLFormElement) {
      form.classList.add('hidden');
    }
  }
}

void init();
