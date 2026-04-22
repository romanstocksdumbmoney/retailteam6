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

async function restoreSessionIfNeededSafe() {
  if (typeof window.restoreSessionIfNeeded === 'function') {
    await window.restoreSessionIfNeeded();
  }
}

function getAuthHeaders() {
  const token = typeof window.getStoredAuthToken === 'function'
    ? window.getStoredAuthToken()
    : (localStorage.getItem('dumbdollars_token') || '');
  if (!token) {
    return {};
  }
  return {
    authorization: `Bearer ${token}`
  };
}

function setStatus(text, isError = false) {
  const statusNode = document.getElementById('pro-page-status');
  if (!statusNode) {
    return;
  }
  statusNode.textContent = text;
  statusNode.className = isError ? 'small-note auth-error' : 'small-note';
}

function getSafeCurrentPath() {
  const path = `${window.location.pathname || '/pro.html'}${window.location.search || ''}${window.location.hash || ''}`;
  if (!path.startsWith('/') || path.startsWith('//')) {
    return '/pro.html';
  }
  return path;
}

function rememberCheckoutReturnPath(path) {
  if (typeof window.rememberCheckoutReturnPath === 'function') {
    window.rememberCheckoutReturnPath(path);
    return;
  }
  try {
    sessionStorage.setItem('dumbdollars_return_after_checkout', path);
  } catch (_error) {
    // Ignore storage failures.
  }
}

function consumeCheckoutReturnPath() {
  if (typeof window.consumeCheckoutReturnPath === 'function') {
    return window.consumeCheckoutReturnPath();
  }
  try {
    const value = String(sessionStorage.getItem('dumbdollars_return_after_checkout') || '').trim();
    sessionStorage.removeItem('dumbdollars_return_after_checkout');
    if (!value.startsWith('/') || value.startsWith('//')) {
      return '';
    }
    return value;
  } catch (_error) {
    return '';
  }
}

function normalizeCheckoutErrorMessage(error) {
  const rawMessage = String(error?.message || '').trim();
  const rawErrorCode = String(error?.body?.error || '').trim().toLowerCase();
  if (rawErrorCode === 'stripe_account_inactive') {
    return 'Stripe account is not fully activated for live card processing yet. Complete activation in Stripe Dashboard, then retry.';
  }
  if (rawErrorCode === 'card_network_not_enabled') {
    return 'This card network is not enabled in Stripe yet. Enable it in Stripe Dashboard > Payments > Payment methods, then retry.';
  }
  if (rawErrorCode === 'test_live_mode_mismatch') {
    return 'Stripe mode mismatch detected. Use matching live keys + live price (or test keys + test price), then retry.';
  }
  if (rawErrorCode === 'stripe_customer_not_found') {
    return 'Stripe customer mapping was stale and has been reset. Retry checkout once now.';
  }
  return rawMessage || 'Could not start secure checkout.';
}

function isSecureHostedCheckoutUrl(url) {
  if (typeof url !== 'string') {
    return false;
  }
  const candidate = url.trim();
  if (!candidate) {
    return false;
  }
  if (candidate.startsWith('/')) {
    return !candidate.startsWith('//');
  }
  try {
    const parsed = new URL(candidate);
    const isHttps = parsed.protocol === 'https:';
    const isLocalHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (!isHttps && !isLocalHttp) {
      return false;
    }
    if (parsed.origin === window.location.origin) {
      return true;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'checkout.stripe.com'
      || host.endsWith('.stripe.com')
      || host === 'localhost'
      || host === '127.0.0.1'
      // Stripe custom checkout domains can use /c/pay/* path.
      || (parsed.protocol === 'https:' && /^\/(?:c\/)?pay\//.test(parsed.pathname))
    );
  } catch (_error) {
    return false;
  }
}

function clearCheckoutQueryParams() {
  const url = new URL(window.location.href);
  let changed = false;
  ['checkout', 'session_id'].forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (changed) {
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', nextUrl || '/pro.html');
  }
}

async function handleCheckoutReturn() {
  await restoreSessionIfNeededSafe();
  const params = new URLSearchParams(window.location.search);
  const checkoutState = String(params.get('checkout') || '').trim().toLowerCase();
  if (!checkoutState) {
    return;
  }
  if (checkoutState === 'cancelled') {
    setStatus('Checkout was cancelled. No charge was made.');
    clearCheckoutQueryParams();
    return;
  }
  if (checkoutState !== 'success') {
    clearCheckoutQueryParams();
    return;
  }

  const sessionId = String(params.get('session_id') || '').trim();
  if (!sessionId) {
    setStatus('Checkout finished but verification data is missing.', true);
    clearCheckoutQueryParams();
    return;
  }
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    setStatus('Please log in again to finalize Pro activation.', true);
    clearCheckoutQueryParams();
    return;
  }

  try {
    const payload = await fetchJson('/api/auth/stripe/confirm-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ sessionId })
    });
    if (payload?.token) {
      localStorage.setItem('dumbdollars_token', payload.token);
    }
    setStatus('Payment confirmed. Pro access is now active.');
    clearCheckoutQueryParams();
    const returnPath = consumeCheckoutReturnPath();
    if (returnPath && returnPath !== window.location.pathname) {
      window.location.href = returnPath;
      return;
    }
    window.location.href = '/';
  } catch (error) {
    setStatus(error.message || 'Could not verify checkout session.', true);
    clearCheckoutQueryParams();
  }
}

async function openPaymentPage() {
  await restoreSessionIfNeededSafe();
  const token = typeof window.getStoredAuthToken === 'function'
    ? window.getStoredAuthToken()
    : (localStorage.getItem('dumbdollars_token') || '');
  if (!token) {
    setStatus('Login required before secure checkout.', true);
    return;
  }
  rememberCheckoutReturnPath(getSafeCurrentPath());
  setStatus('Opening payment page...');
  window.location.href = '/payment.html';
}

function initProPage() {
  const startButton = document.getElementById('pro-page-start');
  if (!startButton) {
    return;
  }
  startButton.addEventListener('click', async () => {
    await openPaymentPage();
  });
}
handleCheckoutReturn()
  .catch(() => {
    setStatus('Could not verify checkout return.', true);
  })
  .finally(() => {
    initProPage();
  });
