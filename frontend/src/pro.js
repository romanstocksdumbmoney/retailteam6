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

async function startCheckout() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    setStatus('Please sign in on the dashboard first, then come back and start checkout.', true);
    return;
  }
  try {
    const preview = await fetchJson('/api/auth/billing/checkout-preview', {
      headers: getAuthHeaders()
    });
    if (!preview || !preview.planName) {
      setStatus('Checkout preview unavailable. Try again in a moment.', true);
      return;
    }
    const session = await fetchJson('/api/auth/stripe/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      }
    });
    window.location.href = session.url;
  } catch (error) {
    setStatus(error.message || 'Could not start secure checkout.', true);
  }
}

function initProPage() {
  const startButton = document.getElementById('pro-page-start');
  if (!startButton) {
    return;
  }
  startButton.addEventListener('click', async () => {
    await startCheckout();
  });
}

initProPage();
