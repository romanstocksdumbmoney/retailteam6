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

function getGuestCheckoutId() {
  const key = 'dumbdollars_guest_checkout_id';
  let id = localStorage.getItem(key);
  if (!id) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else {
      id = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    localStorage.setItem(key, id);
  }
  return id;
}

function setStatus(text, isError = false) {
  const statusNode = document.getElementById('payment-status');
  if (!statusNode) {
    return;
  }
  statusNode.textContent = text;
  statusNode.className = isError ? 'small-note auth-error' : 'small-note';
}

function isSecureHostedCheckoutUrl(url) {
  if (typeof url !== 'string' || !url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const protocolOk = parsed.protocol === 'https:'
      || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(host));
    if (!protocolOk) {
      return false;
    }
    const isTrustedProvider = host === 'checkout.stripe.com' || host.endsWith('.stripe.com') || host.endsWith('.shopify.com');
    const isLocalHosted = ['localhost', '127.0.0.1'].includes(host);
    return isTrustedProvider || isLocalHosted;
  } catch (_error) {
    return false;
  }
}

function displayCheckoutProviderName(billingInfo) {
  if (!billingInfo) {
    return 'Checkout';
  }
  if (billingInfo.checkoutMode === 'hosted_url') {
    return billingInfo.provider || 'Hosted Checkout';
  }
  return billingInfo.provider || 'Stripe';
}

function renderTrustPoints(preview, billingInfo) {
  const trustPoints = document.getElementById('payment-trust-points');
  if (!trustPoints) {
    return;
  }
  if (!preview || !billingInfo) {
    trustPoints.innerHTML = '<li>Checkout details are loading.</li>';
    return;
  }

  const providerName = displayCheckoutProviderName(billingInfo);
  const rows = [
    `${providerName} hosts checkout so card data is not entered on DumbDollars.`,
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
  const checkoutButton = document.getElementById(CHECKOUT_BUTTON_ID);
  try {
    const billingInfo = await fetchJson('/api/auth/billing-info');
    let preview = null;
    try {
      preview = await fetchJson('/api/auth/billing/checkout-preview', {
        headers: getAuthHeaders()
      });
    } catch (_error) {
      // Guests can still proceed to Stripe card entry.
      preview = null;
    }
    renderPlanAndBenefits(preview);
    renderTrustPoints(preview, billingInfo);
    if (checkoutButton) {
      checkoutButton.disabled = !Boolean(billingInfo?.configured);
    }
    if (billingInfo?.configured) {
      const provider = displayCheckoutProviderName(billingInfo);
      setStatus(`Secure checkout is ready via ${provider}.`);
    } else {
      setStatus('Checkout is not configured yet.', true);
    }
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
  const startButton = document.getElementById(CHECKOUT_BUTTON_ID);
  try {
    if (startButton) {
      startButton.disabled = true;
    }
    setStatus('Opening secure checkout...');
    const token = localStorage.getItem('dumbdollars_token') || '';
    const guestCheckoutId = getGuestCheckoutId();
    let session;
    const basePayload = {
      email: '',
      guestCheckoutId
    };

    if (token) {
      try {
        session = await fetchJson('/api/auth/stripe/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify(basePayload)
        });
      } catch (error) {
        if (error.status !== 401) {
          throw error;
        }
      }
    }

    if (!session) {
      session = await fetchJson('/api/auth/stripe/create-checkout-session-public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(basePayload)
      });
    }

    if (!session || !isSecureHostedCheckoutUrl(session.url)) {
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
