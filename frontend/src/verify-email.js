async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = {};
  try {
    body = await response.json();
  } catch (_error) {
    body = {};
  }
  if (!response.ok) {
    const error = new Error(String(body?.message || `Request failed: ${response.status}`));
    error.status = response.status;
    throw error;
  }
  return body;
}

function setStatus(text, isError = false) {
  const node = document.getElementById('verify-email-status');
  if (!node) {
    return;
  }
  node.textContent = String(text || '');
  node.className = isError ? 'small-note auth-error' : 'small-note auth-ok';
}

function getTokenFromQuery() {
  return String(new URLSearchParams(window.location.search).get('token') || '').trim();
}

async function init() {
  const token = getTokenFromQuery();
  if (!token) {
    setStatus('Verification token missing. Request a new verification email.', true);
    return;
  }
  setStatus('Verifying your email...');
  try {
    await fetchJson(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      credentials: 'include'
    });
    setStatus('Email verified successfully. You can now sign in and use bot/broker features.');
  } catch (error) {
    setStatus(error.message || 'Verification link is invalid or expired.', true);
  }
}

init();
