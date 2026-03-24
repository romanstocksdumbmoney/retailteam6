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
  const statusNode = document.getElementById('payment-status');
  if (!statusNode) {
    return;
  }
  statusNode.textContent = text;
  statusNode.className = isError ? 'small-note auth-error' : 'small-note';
}

function renderTrustPoints(preview, billingInfo) {
  const trustPoints = document.getElementById('payment-trust-points');
  if (!trustPoints) {
    return;
  }
  if (!preview || !billingInfo) {
    trustPoints.innerHTML = '<li>Login required to view payment details.</li>';
    return;
  }

  const rows = [
    `${billingInfo.provider || 'Stripe'} hosts checkout so card data is not entered on DumbDollars.`,
    preview.cancellationPolicy || billingInfo.cancellationPolicy || 'Cancel anytime from Manage Billing.',
    preview.renewalPolicy || 'Recurring monthly subscription until canceled.'
  ];
  if (billingInfo.secureCheckoutUrl) {
    rows.push(
      `Security: <a class="open-link" href="${billingInfo.secureCheckoutUrl}" target="_blank" rel="noopener noreferrer">Stripe security overview</a>`
    );
  }
  if (billingInfo.billingTermsUrl) {
    rows.push(
      `Billing terms: <a class="open-link" href="${billingInfo.billingTermsUrl}" target="_blank" rel="noopener noreferrer">Stripe billing terms</a>`
    );
  }
  trustPoints.innerHTML = rows.map((item) => `<li>${item}</li>`).join('');
}

async function loadPaymentSummary() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  const checkoutButton = document.getElementById('payment-start-checkout');
  if (!token) {
    setStatus('Sign in on the dashboard first, then return to complete payment.', true);
    renderTrustPoints(null, null);
    if (checkoutButton) {
      checkoutButton.disabled = true;
    }
    return;
  }
  try {
    const billingInfo = await fetchJson('/api/auth/billing-info');
    const preview = await fetchJson('/api/auth/billing/checkout-preview', {
      headers: getAuthHeaders()
    });
    renderTrustPoints(preview, billingInfo);
    if (checkoutButton) {
      checkoutButton.disabled = !Boolean(billingInfo?.configured);
    }
    setStatus('Secure checkout is ready.');
  } catch (error) {
    renderTrustPoints(null, null);
    if (checkoutButton) {
      checkoutButton.disabled = true;
    }
    setStatus(error.message || 'Could not load payment summary.', true);
  }
}

async function beginCheckout() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    setStatus('Please sign in first.', true);
    return;
  }
  try {
    setStatus('Starting secure checkout...');
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

function initPaymentPage() {
  const startButton = document.getElementById('payment-start-checkout');
  if (!startButton) {
    return;
  }
  startButton.addEventListener('click', async () => {
    await beginCheckout();
  });
  loadPaymentSummary().catch(() => {
    setStatus('Could not initialize payment page.', true);
  });
}

initPaymentPage();
