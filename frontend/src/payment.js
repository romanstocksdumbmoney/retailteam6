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

function normalizeCheckoutErrorMessage(error) {
  const rawMessage = String(error?.message || '').trim();
  const rawErrorCode = String(error?.body?.error || '').trim().toLowerCase();
  if (rawErrorCode === 'stripe_account_inactive') {
    return 'Stripe account is not fully activated for live card processing yet. Complete activation in Stripe Dashboard (activate payments, submit business details, and enable charges), then retry.';
  }
  if (rawErrorCode === 'card_network_not_enabled') {
    return 'This card network is not enabled in Stripe yet. In Stripe Dashboard go to Payments -> Payment methods and enable the needed network (for example Amex), then retry.';
  }
  if (rawErrorCode === 'test_live_mode_mismatch') {
    return 'Stripe mode mismatch detected. Use matching live keys + live price (or test keys + test price), then retry.';
  }
  if (rawErrorCode === 'stripe_customer_not_found') {
    return 'Stripe customer mapping was stale and has been reset. Retry checkout once now.';
  }
  const normalized = rawMessage.toLowerCase();
  const processingLike = normalized.includes('processing')
    || normalized.includes('authentication')
    || normalized.includes('3d secure')
    || normalized.includes('card was declined')
    || normalized.includes('payment_intent');
  if (processingLike) {
    return `${rawMessage || 'Checkout failed.'} If this was specifically an Amex card, confirm Amex is enabled in Stripe Dashboard > Payments > Payment methods.`;
  }
  return rawMessage || 'Could not start secure checkout.';
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
    window.history.replaceState({}, '', nextUrl || '/payment.html');
  }
}

async function handleCheckoutReturn() {
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
    window.location.href = '/';
  } catch (error) {
    setStatus(error.message || 'Could not verify checkout session.', true);
    clearCheckoutQueryParams();
  }
}

function isSecureHostedCheckoutUrl(url) {
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
    const host = parsed.hostname.toLowerCase();
    const protocolOk = parsed.protocol === 'https:'
      || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(host));
    if (!protocolOk) {
      return false;
    }
    if (parsed.origin === window.location.origin) {
      return true;
    }
    const isTrustedProvider = host === 'checkout.stripe.com' || host.endsWith('.stripe.com');
    const isLocalHosted = ['localhost', '127.0.0.1'].includes(host);
    const isStripeCustomCheckoutPath = parsed.protocol === 'https:' && /^\/(?:c\/)?pay\//.test(parsed.pathname);
    return isTrustedProvider || isLocalHosted || isStripeCustomCheckoutPath;
  } catch (_error) {
    return false;
  }
}

function displayCheckoutProviderName(billingInfo) {
  if (!billingInfo) {
    return 'Checkout';
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
    'Accepted card networks through Stripe typically include Visa, Mastercard, Amex, and Discover (depends on Stripe account settings).',
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
    if (!token) {
      throw new Error('Login required before secure checkout.');
    }
    const session = await fetchJson('/api/auth/stripe/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({})
    });

    if (!session || !isSecureHostedCheckoutUrl(session.url)) {
      throw new Error('Could not verify secure Stripe checkout URL.');
    }
    window.location.href = session.url;
  } catch (error) {
    if (startButton) {
      startButton.disabled = false;
    }
    setStatus(normalizeCheckoutErrorMessage(error), true);
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

handleCheckoutReturn()
  .catch(() => {
    setStatus('Could not verify checkout return.', true);
  })
  .finally(() => {
    initPaymentPage();
  });
