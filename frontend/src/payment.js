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

const CHECKOUT_BUTTON_ID = 'payment-start-checkout';

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

function renderPlanAndBenefits(preview) {
  const planLine = document.getElementById('payment-plan-line');
  const benefits = document.getElementById('payment-benefits');
  if (!planLine || !benefits) {
    return;
  }
  if (!preview) {
    planLine.textContent = '$15/month';
    return;
  }
  const amount = Number(preview.monthlyAmountUsd || 15);
  planLine.textContent = `${preview.planName || 'DumbDollars Pro'} • $${amount}/month`;
  if (Array.isArray(preview.benefits) && preview.benefits.length > 0) {
    benefits.innerHTML = preview.benefits.map((item) => `<li>${item}</li>`).join('');
  }
}

async function loadPaymentSummary() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  const checkoutButton = document.getElementById(CHECKOUT_BUTTON_ID);
  if (!token) {
    setStatus('Sign in on the dashboard first, then return to complete payment.', true);
    renderPlanAndBenefits(null);
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
    renderPlanAndBenefits(preview);
    renderTrustPoints(preview, billingInfo);
    if (checkoutButton) {
      checkoutButton.disabled = !Boolean(billingInfo?.configured);
    }
    setStatus('Secure checkout is ready.');
  } catch (error) {
    renderPlanAndBenefits(null);
    renderTrustPoints(null, null);
    if (checkoutButton) {
      checkoutButton.disabled = true;
    }
    setStatus(error.message || 'Could not load payment summary.', true);
  }
}

async function beginCheckout() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  const startButton = document.getElementById(CHECKOUT_BUTTON_ID);
  if (!token) {
    setStatus('Please sign in first.', true);
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
    if (startButton) {
      startButton.disabled = false;
    }
    setStatus(error.message || 'Could not start secure checkout.', true);
  }
}

function initPaymentPage() {
  const startButton = document.getElementById(CHECKOUT_BUTTON_ID);
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
