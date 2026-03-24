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
  const statusNode = document.getElementById('checkout-status');
  if (!statusNode) {
    return;
  }
  statusNode.textContent = text;
  statusNode.className = isError ? 'small-note auth-error' : 'small-note';
}

async function startSecureCheckout() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  const startButton = document.getElementById('checkout-open-stripe');
  if (!token) {
    setStatus('Please sign in on the dashboard first.', true);
    return;
  }
  try {
    if (startButton) {
      startButton.disabled = true;
    }
    setStatus('Opening secure Stripe checkout...');
    const session = await fetchJson('/api/auth/stripe/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      }
    });
    if (!session || typeof session.url !== 'string' || !session.url.startsWith('https://checkout.stripe.com/')) {
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

async function initializeCheckoutPage() {
  const startButton = document.getElementById('checkout-open-stripe');
  if (!startButton) {
    return;
  }
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    setStatus('Sign in on the dashboard first, then return to finish checkout.', true);
    startButton.disabled = true;
  } else {
    setStatus('Ready for secure Stripe checkout.');
  }
  startButton.addEventListener('click', async () => {
    await startSecureCheckout();
  });
}

initializeCheckoutPage().catch(() => {
  setStatus('Could not initialize checkout page.', true);
});
