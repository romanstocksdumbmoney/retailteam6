const FALLBACK_CATEGORIES = [
  'Meals',
  'Travel',
  'Transportation',
  'Fuel',
  'Office',
  'Software',
  'Utilities',
  'Healthcare',
  'Entertainment',
  'Other',
];

const state = {
  accessToken: localStorage.getItem('dumbdollars-access-token') || '',
  scannedDraft: null,
  subscriptionRequired: true,
};

function withAuthHeaders(headers = {}) {
  const merged = { ...headers };
  if (state.accessToken) {
    merged['x-subscription-token'] = state.accessToken;
  }
  return merged;
}

async function parseJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return {};
  }
  return response.json();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: withAuthHeaders(options.headers || {}),
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    const error = new Error(body.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }

  return body;
}

function setStatus(element, message, type = '') {
  element.className = `status ${type}`.trim();
  element.textContent = message;
}

function persistToken(token) {
  state.accessToken = token;
  localStorage.setItem('dumbdollars-access-token', token);
}

function clearToken() {
  state.accessToken = '';
  localStorage.removeItem('dumbdollars-access-token');
}

function refreshTokenPreview() {
  const tokenStatus = document.getElementById('token-status');
  const tokenInput = document.getElementById('subscription-token');

  if (!state.accessToken) {
    tokenStatus.textContent = 'No active token. Paid features are locked.';
    tokenInput.value = '';
    return;
  }

  tokenInput.value = state.accessToken;
  tokenStatus.textContent = `Token saved (${state.accessToken.slice(0, 10)}...).`;
}

const subscriptionForm = document.getElementById('subscription-form');
const subscriptionEmailInput = document.getElementById('subscription-email');
const subscriptionStatus = document.getElementById('subscription-status');
const tokenInput = document.getElementById('subscription-token');
const saveTokenButton = document.getElementById('save-token');

subscriptionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(subscriptionStatus, 'Creating Stripe checkout session...', '');

  try {
    const checkout = await requestJson('/api/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: subscriptionEmailInput.value.trim() }),
    });

    if (!checkout.checkout?.url) {
      throw new Error('Stripe checkout URL is missing.');
    }

    setStatus(subscriptionStatus, 'Redirecting to Stripe checkout...', 'success-text');
    window.location.assign(checkout.checkout.url);
  } catch (error) {
    setStatus(subscriptionStatus, error.message, 'error');
  }
});

saveTokenButton.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus(subscriptionStatus, 'Enter your token from checkout confirmation first.', 'error');
    return;
  }

  persistToken(token);
  refreshTokenPreview();
  setStatus(subscriptionStatus, 'Token saved. Verifying subscription...', '');

  try {
    const status = await requestJson('/api/subscription/status');
    if (!status.active) {
      clearToken();
      refreshTokenPreview();
      throw new Error('Token is not active.');
    }
    setStatus(subscriptionStatus, 'Subscription verified. Paid features unlocked.', 'success-text');
    await loadCategories();
  } catch (error) {
    setStatus(subscriptionStatus, error.message, 'error');
  }
});

async function loadSubscriptionPlan() {
  try {
    const plan = await requestJson('/api/subscription/plan');
    state.subscriptionRequired = Boolean(plan.requiresActiveSubscription);
    if (!state.subscriptionRequired) {
      setStatus(
        subscriptionStatus,
        'Test mode active: Stripe paywall is temporarily bypassed for validation.',
        'success-text',
      );
    }
  } catch (_error) {
    state.subscriptionRequired = true;
  }
}

async function handleCheckoutConfirmationFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const checkoutState = params.get('checkout');
  const sessionId = params.get('session_id');

  if (checkoutState !== 'success' || !sessionId) {
    return;
  }

  setStatus(subscriptionStatus, 'Confirming Stripe checkout...', '');
  try {
    const confirmation = await requestJson('/api/subscription/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    persistToken(confirmation.token);
    refreshTokenPreview();
    setStatus(subscriptionStatus, 'Payment confirmed. Subscription active.', 'success-text');
    await loadCategories();

    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, '', cleanUrl);
  } catch (error) {
    setStatus(subscriptionStatus, error.message, 'error');
  }
}

const receiptForm = document.getElementById('receipt-form');
const receiptFileInput = document.getElementById('receipt-file');
const scanStatus = document.getElementById('scan-status');
const scanResult = document.getElementById('scan-result');
const reviewSection = document.getElementById('review-section');
const reviewForm = document.getElementById('review-form');
const reviewVendorInput = document.getElementById('review-vendor');
const reviewTotalInput = document.getElementById('review-total');
const reviewDateInput = document.getElementById('review-date');
const reviewCategoryInput = document.getElementById('review-category');
const saveStatus = document.getElementById('save-status');

function renderCategoryOptions(categories) {
  reviewCategoryInput.innerHTML = categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join('');
}

async function loadCategories() {
  if (!state.accessToken) {
    renderCategoryOptions(FALLBACK_CATEGORIES);
    return;
  }

  try {
    const result = await requestJson('/api/expenses/categories');
    renderCategoryOptions(result.categories || FALLBACK_CATEGORIES);
  } catch (_error) {
    renderCategoryOptions(FALLBACK_CATEGORIES);
  }
}

function fillReviewForm(draft) {
  reviewVendorInput.value = draft.vendor || '';
  reviewTotalInput.value = Number.isFinite(draft.total) ? String(draft.total) : '';
  reviewDateInput.value = draft.expenseDate || new Date().toISOString().slice(0, 10);
  reviewCategoryInput.value = draft.category || 'Other';
  reviewSection.classList.remove('hidden');
}

receiptForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (state.subscriptionRequired && !state.accessToken) {
    setStatus(scanStatus, 'Subscription token required. Complete checkout first.', 'error');
    return;
  }
  if (!receiptFileInput.files.length) {
    setStatus(scanStatus, 'Please choose a receipt image or video first.', 'error');
    return;
  }

  setStatus(scanStatus, 'Scanning receipt...', '');
  setStatus(saveStatus, '', '');

  try {
    const formData = new FormData();
    formData.append('receipt', receiptFileInput.files[0]);

    const response = await fetch('/api/expenses/scan-receipt?persist=false', {
      method: 'POST',
      body: formData,
      headers: withAuthHeaders(),
    });
    const result = await parseJsonResponse(response);
    if (!response.ok) {
      throw new Error(result.error || 'Scan failed.');
    }

    state.scannedDraft = result.draft;
    fillReviewForm(state.scannedDraft);
    setStatus(scanStatus, `Scan complete (${result.sourceType}). Review values below before saving.`, 'success-text');
    scanResult.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    setStatus(scanStatus, error.message, 'error');
  }
});

reviewForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.scannedDraft) {
    setStatus(saveStatus, 'Scan a receipt before trying to save.', 'error');
    return;
  }

  const payload = {
    vendor: reviewVendorInput.value.trim(),
    total: Number(reviewTotalInput.value),
    expenseDate: reviewDateInput.value,
    category: reviewCategoryInput.value,
    rawText: state.scannedDraft.rawText || '',
    ocrConfidence: state.scannedDraft.ocrConfidence || 0,
  };

  setStatus(saveStatus, 'Saving expense...', '');
  try {
    const result = await requestJson('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setStatus(saveStatus, `Saved expense ${result.expense.id}.`, 'success-text');
    receiptForm.reset();
    reviewForm.reset();
    state.scannedDraft = null;
    reviewSection.classList.add('hidden');
  } catch (error) {
    setStatus(saveStatus, error.message, 'error');
  }
});

const reportForm = document.getElementById('report-form');
const reportMonthInput = document.getElementById('report-month');
const reportStatus = document.getElementById('report-status');
const reportResult = document.getElementById('report-result');
const exportExcelButton = document.getElementById('export-excel');

reportMonthInput.value = new Date().toISOString().slice(0, 7);

reportForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(reportStatus, 'Building monthly report...', '');
  try {
    const result = await requestJson(`/api/expenses/monthly-report?month=${reportMonthInput.value}`);
    setStatus(reportStatus, 'Report generated.', 'success-text');
    reportResult.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    setStatus(reportStatus, error.message, 'error');
  }
});

exportExcelButton.addEventListener('click', async () => {
  const month = reportMonthInput.value;
  if (!month) {
    setStatus(reportStatus, 'Pick a month before exporting.', 'error');
    return;
  }

  setStatus(reportStatus, 'Preparing Excel export...', '');
  try {
    const response = await fetch(`/api/expenses/monthly-report.xlsx?month=${encodeURIComponent(month)}`, {
      headers: withAuthHeaders(),
    });
    if (!response.ok) {
      const body = await parseJsonResponse(response);
      throw new Error(body.error || 'Export failed.');
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `dumb-dollars-${month}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    setStatus(reportStatus, 'Excel export downloaded.', 'success-text');
  } catch (error) {
    setStatus(reportStatus, error.message, 'error');
  }
});

refreshTokenPreview();
loadSubscriptionPlan().then(() => {
  loadCategories();
  handleCheckoutConfirmationFromUrl();
});
