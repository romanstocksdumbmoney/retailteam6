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

function isSecureCheckoutUrl(url) {
  if (typeof url !== 'string' || !url) {
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
    const protocol = parsed.protocol.toLowerCase();
    const isHttps = protocol === 'https:';
    const isLocalHttp = protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname.toLowerCase());
    if (!isHttps && !isLocalHttp) {
      return false;
    }
    if (parsed.origin === window.location.origin) {
      return true;
    }
    const host = parsed.hostname.toLowerCase();
    return host === 'checkout.stripe.com'
      || host.endsWith('.stripe.com')
      || host === 'localhost'
      || host === '127.0.0.1';
  } catch (_error) {
    return false;
  }
}

function setStatus(text, isError = false) {
  const statusNode = document.getElementById('checkout-status');
  if (!statusNode) {
    return;
  }
  statusNode.textContent = text;
  statusNode.className = isError ? 'small-note auth-error' : 'small-note';
}

async function startSecureCheckout() {
  const startButton = document.getElementById('checkout-open-stripe');
  try {
    if (startButton) {
      startButton.disabled = true;
    }
    setStatus('Opening secure Stripe checkout...');
    const token = localStorage.getItem('dumbdollars_token') || '';
    if (!token) {
      throw new Error('Login required before secure checkout.');
    }
    const session = await fetchJson('/api/auth/stripe/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      }
    });
    if (!session || !isSecureCheckoutUrl(session.url)) {
      throw new Error('Could not verify secure Stripe checkout URL.');
    }
    window.location.href = session.url;
  } catch (error) {
    setStatus(error.message || 'Could not start Stripe checkout.', true);
    if (startButton) {
      startButton.disabled = false;
    }
  }
}

async function initializeCheckoutPage() {
  const startButton = document.getElementById('checkout-open-stripe');
  if (!startButton) {
    return;
  }
  setStatus('Ready for secure Stripe checkout.');
  startButton.addEventListener('click', async () => {
    await startSecureCheckout();
  });
}

initializeCheckoutPage().catch(() => {
  setStatus('Could not initialize checkout page.', true);
});
