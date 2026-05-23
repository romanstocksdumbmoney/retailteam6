async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = {};
  try {
    body = await response.json();
  } catch (_error) {
    body = {};
  }
  if (!response.ok) {
    const error = new Error(body?.message || 'Request failed.');
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function setStatus(message, type = 'info') {
  const node = document.getElementById('forgot-password-status');
  if (!node) {
    return;
  }
  node.textContent = String(message || '');
  node.className = 'small-note';
  if (type === 'error') {
    node.classList.add('auth-error');
  } else if (type === 'success') {
    node.classList.add('auth-ok');
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalizeEmail(email));
}

function setButtonBusy(button, busy, idleText, busyText) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

function setupForm() {
  const form = document.getElementById('forgot-password-form');
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailInput = document.getElementById('forgot-password-email');
    const submitButton = document.getElementById('forgot-password-submit') || form.querySelector('button[type="submit"]');
    const idleText = submitButton?.textContent || 'Send Reset Link';
    const email = normalizeEmail(emailInput?.value || '');
    if (!isValidEmail(email)) {
      setStatus('Enter a valid email address.', 'error');
      return;
    }
    try {
      setButtonBusy(submitButton, true, idleText, 'Sending...');
      await fetchJson('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      setStatus('If an account exists with that email, a reset link has been sent.', 'success');
    } catch (error) {
      setStatus(error.message || 'Could not send reset link right now.', 'error');
    } finally {
      setButtonBusy(submitButton, false, idleText, 'Sending...');
    }
  });
}

setupForm();
