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

function getAuthHeaders() {
  const token = localStorage.getItem('dumbdollars_token') || '';
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
      || host.endsWith('.shopify.com')
      || host === 'localhost'
      || host === '127.0.0.1'
    );
  } catch (_error) {
    return false;
  }
}

async function startSecureCheckout() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  const startButton = document.getElementById('pro-page-start');
  try {
    if (startButton) {
      startButton.disabled = true;
    }
    setStatus('Opening secure card checkout...');
    const endpoint = token
      ? '/api/auth/stripe/create-checkout-session'
      : '/api/auth/stripe/create-checkout-session-public';
    const session = await fetchJson(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? getAuthHeaders() : {})
      },
      body: JSON.stringify({})
    });
    if (!session || !isSecureHostedCheckoutUrl(session.url)) {
      throw new Error('Could not verify secure Stripe checkout URL.');
    }
    window.location.href = session.url;
  } catch (error) {
    setStatus(error.message || 'Could not start secure checkout.', true);
    if (startButton) {
      startButton.disabled = false;
    }
  }
}

function initProPage() {
  const startButton = document.getElementById('pro-page-start');
  if (!startButton) {
    return;
  }
  startButton.addEventListener('click', async () => {
    await startSecureCheckout();
  });
}

initProPage();
