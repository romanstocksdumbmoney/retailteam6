const PLAN_FREE = 'free';
const PLAN_PRO = 'pro';
const PRO_MONTHLY_PRICE = '$15/month';
let activePlan = PLAN_FREE;
let activeTicker = 'AAPL';
let authToken = '';
let currentUser = null;
let activeAiPlatform = 'x-com';
let activeTrendSource = 'all';
let activePatternFilter = 'all';
let activeInsiderSide = 'all';
let activeInsiderSymbol = '';
let activeInsiderMinValueUsd = 0;
let activeInsiderSortBy = 'anomaly_desc';
let activeInsiderUnusualOnly = true;
let sidebarOpen = false;
let billingInfo = null;
let proPopupVisible = false;
let earningsRefreshIntervalId = null;
let earningsDayRolloverIntervalId = null;
let earningsLastEtDateKey = '';
const AUTH_EMAIL_STORAGE_KEY = 'dumbdollars_saved_email';
const SAVED_EMAIL_KEY = 'dumbdollars_saved_email';
const FALLBACK_AI_DISCOVERY_LINK = 'https://x.com';

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
    const host = parsed.hostname.toLowerCase();
    const protocolOk = parsed.protocol === 'https:'
      || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(host));
    if (!protocolOk) {
      return false;
    }
    if (parsed.origin === window.location.origin) {
      return true;
    }
    return (
      host === 'checkout.stripe.com'
      || host.endsWith('.stripe.com')
      || host === 'localhost'
      || host === '127.0.0.1'
    );
  } catch (_error) {
    return false;
  }
}

function openExternal(url) {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (_error) {
    window.location.href = url;
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
    window.history.replaceState({}, '', nextUrl || '/');
  }
}

async function handleCheckoutReturn() {
  const checkoutState = String(new URLSearchParams(window.location.search).get('checkout') || '')
    .trim()
    .toLowerCase();
  if (!checkoutState) {
    return;
  }

  if (checkoutState === 'cancelled') {
    setAuthMessage('Checkout was cancelled. No charge was made.');
    clearCheckoutQueryParams();
    return;
  }

  if (checkoutState !== 'success') {
    clearCheckoutQueryParams();
    return;
  }

  const sessionId = String(new URLSearchParams(window.location.search).get('session_id') || '').trim();
  if (!sessionId) {
    setAuthMessage('Checkout finished but confirmation is missing. Contact support if your card was charged.', true);
    clearCheckoutQueryParams();
    return;
  }
  if (!authToken) {
    setAuthMessage('Please sign in again to finish activating Pro after checkout.', true);
    clearCheckoutQueryParams();
    return;
  }

  try {
    const payload = await fetchJson('/api/auth/stripe/confirm-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headersWithPlan()
      },
      body: JSON.stringify({ sessionId })
    });
    if (payload?.token) {
      authToken = payload.token;
      localStorage.setItem('dumbdollars_token', authToken);
    }
    if (payload?.user) {
      currentUser = payload.user;
    }
    clearCheckoutQueryParams();
    renderAuthState();
    setAuthMessage('Payment confirmed. Pro access is now active.');

    const returnAfterCheckout = String(sessionStorage.getItem('dumbdollars_return_after_checkout') || '').trim();
    sessionStorage.removeItem('dumbdollars_return_after_checkout');
    if (returnAfterCheckout && returnAfterCheckout.startsWith('/') && returnAfterCheckout !== window.location.pathname) {
      window.location.href = returnAfterCheckout;
    }
  } catch (error) {
    setAuthMessage(error.message || 'Could not verify checkout session. Please try again.', true);
    clearCheckoutQueryParams();
  }
}

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

function headersWithPlan() {
  const headers = {};
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }
  return headers;
}

function getSavedAuthEmail() {
  return String(localStorage.getItem(AUTH_EMAIL_STORAGE_KEY) || '').trim().toLowerCase();
}

function saveAuthEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return;
  }
  localStorage.setItem(AUTH_EMAIL_STORAGE_KEY, normalized);
}

function applySavedEmailToForms() {
  const saved = getSavedAuthEmail();
  if (!saved) {
    return;
  }
  const loginEmail = document.getElementById('login-email');
  const signupEmail = document.getElementById('signup-email');
  if (loginEmail instanceof HTMLInputElement && !loginEmail.value.trim()) {
    loginEmail.value = saved;
  }
  if (signupEmail instanceof HTMLInputElement && !signupEmail.value.trim()) {
    signupEmail.value = saved;
  }
}

function savePreferredEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return;
  }
  localStorage.setItem(SAVED_EMAIL_KEY, normalized);
}

function loadPreferredEmail() {
  return String(localStorage.getItem(SAVED_EMAIL_KEY) || '').trim().toLowerCase();
}

function fmtPct(value) {
  return `${Number(value).toFixed(0)}%`;
}

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function toEtNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || '00';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute'))
  };
}

function getEtDateKey() {
  const now = toEtNow();
  return `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
}

function parseEventDateParts(isoDate) {
  const text = String(isoDate || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function parseSessionCutoffMinutes(reportTimeLabel) {
  const value = String(reportTimeLabel || '').toLowerCase();
  if (value.includes('pre-market')) {
    return 9 * 60 + 30;
  }
  if (value.includes('after-hours')) {
    return 16 * 60 + 30;
  }
  return 16 * 60 + 30;
}

function isEarningsItemStillActive(item) {
  const dateParts = parseEventDateParts(item.eventDate || item.eventDateLabel || '');
  if (!dateParts) {
    return true;
  }
  const now = toEtNow();
  const eventKey = dateParts.year * 10000 + dateParts.month * 100 + dateParts.day;
  const nowKey = now.year * 10000 + now.month * 100 + now.day;
  if (eventKey > nowKey) {
    return true;
  }
  if (eventKey < nowKey) {
    return false;
  }
  const nowMinutes = now.hour * 60 + now.minute;
  const cutoffMinutes = parseSessionCutoffMinutes(item.reportTimeLabel);
  return nowMinutes < cutoffMinutes;
}

function startEarningsDayRolloverWatcher() {
  earningsLastEtDateKey = getEtDateKey();
  if (earningsDayRolloverIntervalId) {
    clearInterval(earningsDayRolloverIntervalId);
  }
  earningsDayRolloverIntervalId = window.setInterval(() => {
    const currentDateKey = getEtDateKey();
    if (currentDateKey === earningsLastEtDateKey) {
      return;
    }
    earningsLastEtDateKey = currentDateKey;
    loadEarningsBoard().catch((error) => {
      console.error(error);
    });
  }, 60_000);
}

function renderStatus(text) {
  const status = document.getElementById('status');
  status.textContent = text;
}

function openProPopup(message = 'Pro access needed. Upgrade to unlock this feature.') {
  const backdrop = document.getElementById('pro-popup-backdrop');
  const body = document.getElementById('pro-popup-text');
  if (!backdrop || !body) {
    return;
  }
  body.textContent = message;
  backdrop.classList.remove('hidden');
  document.body.classList.add('pro-popup-open');
  proPopupVisible = true;
}

function closeProPopup() {
  const backdrop = document.getElementById('pro-popup-backdrop');
  if (!backdrop) {
    return;
  }
  backdrop.classList.add('hidden');
  document.body.classList.remove('pro-popup-open');
  proPopupVisible = false;
}

function openProPlanScreen() {
  const targetUrl = '/payment.html';
  if (window.location.pathname.endsWith('/payment.html')) {
    return;
  }
  window.location.href = targetUrl;
}

function openAutoTraderPage() {
  window.location.href = '/ai-bot-trader.html';
}

function openInsiderTradesPage() {
  window.location.href = '/insider-trades.html';
}

function openPortfoliosPage() {
  window.location.href = '/portfolios.html';
}

async function focusPremiumSpikesSection(options = {}) {
  const sectionHeader = document.getElementById('premium-spikes-section');
  const shouldLoad = options.load !== false;
  openSidebarMenu();
  if (sectionHeader) {
    sectionHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
    sectionHeader.classList.remove('module-highlight');
    // Force restart of highlight animation when opened repeatedly.
    void sectionHeader.offsetWidth;
    sectionHeader.classList.add('module-highlight');
    window.setTimeout(() => {
      sectionHeader.classList.remove('module-highlight');
    }, 1500);
  }
  if (!shouldLoad) {
    return;
  }
  try {
    await loadPremiumSpikes();
  } catch (error) {
    renderPremiumSpikesLocked(error.message || 'Could not load Call / Put Premium Spikes.');
    if (error.status === 403) {
      openProPopup('Pro access needed for Call / Put Premium Spikes.');
    }
  }
}

function closeSidebarMenu() {
  const sidebar = document.getElementById('sidebar-panel');
  const backdrop = document.getElementById('sidebar-backdrop');
  const menuToggle = document.getElementById('sidebar-menu-toggle');
  if (!sidebar || !menuToggle) {
    return;
  }
  sidebarOpen = false;
  sidebar.classList.remove('sidebar-open');
  if (backdrop) {
    backdrop.classList.add('hidden');
  }
  document.body.classList.remove('sidebar-menu-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}

function openSidebarMenu() {
  const sidebar = document.getElementById('sidebar-panel');
  const backdrop = document.getElementById('sidebar-backdrop');
  const menuToggle = document.getElementById('sidebar-menu-toggle');
  if (!sidebar || !menuToggle) {
    return;
  }
  sidebarOpen = true;
  sidebar.classList.add('sidebar-open');
  if (backdrop) {
    backdrop.classList.remove('hidden');
  }
  document.body.classList.add('sidebar-menu-open');
  menuToggle.setAttribute('aria-expanded', 'true');
}

function toggleSidebarMenu() {
  if (sidebarOpen) {
    closeSidebarMenu();
  } else {
    openSidebarMenu();
  }
}

function setAuthMessage(text, isError = false) {
  const node = document.getElementById('auth-message');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function formatBillingAmount(info) {
  if (!info || !Number.isFinite(Number(info.amountMonthly))) {
    return '$15';
  }
  return `$${Number(info.amountMonthly)}`;
}

function renderBillingInfo(info, checkoutPreview = null) {
  const planLine = document.getElementById('billing-plan-line');
  const trustPoints = document.getElementById('billing-trust-points');
  const continueButton = document.getElementById('billing-safe-continue');
  if (!planLine || !trustPoints) {
    return;
  }

  trustPoints.innerHTML = '';
  if (!info) {
    planLine.textContent = 'Billing details are temporarily unavailable.';
    if (continueButton) {
      continueButton.disabled = true;
    }
    return;
  }

  const monthly = formatBillingAmount(info);
  const configured = Boolean(info.configured);
  planLine.textContent = `Plan: DumbDollars Pro • ${monthly}/${info.recurringInterval || 'month'}`;

  const points = [
    `${info.provider || 'Stripe'} hosts checkout so card data is not entered on DumbDollars.`,
    checkoutPreview?.cancellationPolicy || info.cancellationPolicy || 'Cancel anytime from Manage Billing.',
    checkoutPreview?.renewalPolicy || 'Recurring monthly subscription until canceled.'
  ];
  if (Array.isArray(checkoutPreview?.benefits)) {
    checkoutPreview.benefits.forEach((benefit) => points.push(benefit));
  }
  if (info.secureCheckoutUrl) {
    points.push(`Security: <a class="open-link" href="${info.secureCheckoutUrl}" target="_blank" rel="noopener noreferrer">Stripe security overview</a>`);
  }
  if (info.billingTermsUrl) {
    points.push(`Billing terms: <a class="open-link" href="${info.billingTermsUrl}" target="_blank" rel="noopener noreferrer">Stripe billing terms</a>`);
  }

  trustPoints.innerHTML = points.map((point) => `<li>${point}</li>`).join('');
  if (continueButton) {
    continueButton.disabled = !configured;
  }
}

function openAllAiPlatforms(query) {
  const select = document.getElementById('ai-platform-select');
  if (!select) {
    return;
  }
  const payload = {
    query,
    platforms: Array.from(select.options).map((option) => ({
      id: option.value,
      label: option.textContent || option.value
    }))
  };
  fetchJson(`/api/market/ai-discovery?query=${encodeURIComponent(query)}`, {
    headers: headersWithPlan()
  })
    .then((response) => {
      const platforms = response.platforms || [];
      platforms.forEach((platform) => {
        if (platform.searchUrl && platform.searchUrl !== '#') {
          openExternal(platform.searchUrl);
        }
      });
    })
    .catch((_error) => {
      // Fallback: open known source pages if API discovery is unavailable.
      const fallbackLinks = [
        'https://x.com/search?q=' + encodeURIComponent(query),
        'https://grok.com/',
        'https://chatgpt.com/',
        'https://claude.ai/',
        'https://www.anthropic.com/claude/'
      ];
      fallbackLinks.forEach((url) => openExternal(url));
    });
}

function renderAuthState() {
  const planBadge = document.getElementById('plan-badge');
  const checkoutButton = document.getElementById('upgrade-pro-btn');
  const billingPortalButton = document.getElementById('billing-portal-btn');
  const logoutButton = document.getElementById('logout-btn');

  activePlan = currentUser && currentUser.plan === PLAN_PRO ? PLAN_PRO : PLAN_FREE;
  planBadge.textContent = activePlan === PLAN_PRO ? 'PRO ACCESS' : 'FREE ACCESS';
  planBadge.className = activePlan === PLAN_PRO ? 'plan-badge plan-pro' : 'plan-badge plan-free';

  setAuthMessage(
    currentUser
      ? `${currentUser.email} • ${activePlan === PLAN_PRO ? 'Pro active' : 'Free plan'}`
      : 'Not logged in'
  );

  if (checkoutButton) {
    checkoutButton.disabled = !currentUser || activePlan === PLAN_PRO;
    checkoutButton.textContent = activePlan === PLAN_PRO ? 'Pro Active' : `Upgrade to Pro (${PRO_MONTHLY_PRICE})`;
  }

  if (billingPortalButton) {
    billingPortalButton.disabled = !currentUser;
  }

  if (logoutButton) {
    logoutButton.disabled = !currentUser;
  }
}

function renderOutlook(payload) {
  const target = document.getElementById('stock-results');
  const outlook = payload.outlook;
  target.innerHTML = `
    <article class="prob-card">
      <h3>${payload.ticker} Outlook</h3>
      <p><strong>Day:</strong> ${fmtPct(outlook.day.up)} up / ${fmtPct(outlook.day.down)} down</p>
      <p><strong>Week:</strong> ${fmtPct(outlook.week.up)} up / ${fmtPct(outlook.week.down)} down</p>
      <p><strong>Month:</strong> ${fmtPct(outlook.month.up)} up / ${fmtPct(outlook.month.down)} down</p>
      <p><strong>Year:</strong> ${fmtPct(outlook.year.up)} up / ${fmtPct(outlook.year.down)} down</p>
      <p class="small-note">Analysts tracked: ${payload.coverage.analystsTracked.toLocaleString()}</p>
      <p class="small-note">Articles analyzed: ${payload.coverage.articlesAnalyzed.toLocaleString()}</p>
    </article>
  `;
}

function renderScanner(payload) {
  const target = document.getElementById('scan-results');
  const result = payload.result;
  let metrics = '';
  if (result.metrics) {
    metrics = `
      <p><strong>Market flow score:</strong> ${result.metrics.marketFlowScore}</p>
      <p><strong>Gamma exposure:</strong> ${fmtUsd(result.metrics.gammaExposureUsd)}</p>
      <p><strong>Call premium:</strong> ${fmtUsd(result.metrics.callPremiumUsd)}</p>
      <p><strong>Put premium:</strong> ${fmtUsd(result.metrics.putPremiumUsd)}</p>
      <p><strong>Put/Call ratio:</strong> ${result.metrics.putCallRatio}</p>
    `;
  }
  target.innerHTML = `
    <article class="stack-item">
      <p><strong>${result.ticker}</strong> (${result.method})</p>
      <p>${result.summary}</p>
      <p class="small-note">Source: ${result.source}</p>
      <p class="small-note">Last run: ${result.lastRunUtc}</p>
      ${metrics}
      ${result.isLimited ? '<p class="pro-lock">Free preview. Upgrade to Pro for full market flow detail.</p>' : ''}
    </article>
  `;
}

function renderOptions(payload) {
  const target = document.getElementById('options-results');
  target.innerHTML = `
    <article class="stack-item">
      <p><strong>${payload.ticker}</strong> ${payload.contract.type.toUpperCase()} ${payload.contract.strike}</p>
      <p><strong>Expiration:</strong> ${payload.contract.expiration}</p>
      <p><strong>Premium/contract:</strong> ${fmtUsd(payload.contract.premiumPerContractUsd)}</p>
      <p><strong>Call premium:</strong> ${fmtUsd(payload.premium.callPremiumUsd)}</p>
      <p><strong>Put premium:</strong> ${fmtUsd(payload.premium.putPremiumUsd)}</p>
      <p><strong>Net gamma exposure:</strong> ${fmtUsd(payload.gammaExposure.net)} (${payload.gammaExposure.signedDirection})</p>
    </article>
  `;
}

function renderOptionsLocked(message) {
  const target = document.getElementById('options-results');
  target.innerHTML = `<div class="pro-lock">${message}</div>`;
}

function renderUnusual(payload) {
  const target = document.getElementById('unusual-results');
  target.innerHTML = '';
  payload.data.forEach((move) => {
    const row = document.createElement('article');
    row.className = 'stack-item';
    row.innerHTML = `
      <p><strong>${move.ticker}</strong> ${move.size} (${move.sentiment})</p>
      <p>Premium: ${fmtUsd(move.premiumUsd)}</p>
      <p class="small-note">${move.detectedAt}</p>
    `;
    target.appendChild(row);
  });
}

function renderUnusualLocked(message) {
  const target = document.getElementById('unusual-results');
  target.innerHTML = `<div class="pro-lock">${message}</div>`;
}

function renderHighIv(payload) {
  const target = document.getElementById('high-iv-results');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  (payload.items || []).forEach((item) => {
    const card = document.createElement('article');
    card.className = 'high-iv-card';
    card.innerHTML = `
      <h4>${item.symbol}</h4>
      <p><strong>IV:</strong> ${(Number(item.impliedVolatility || 0) * 100).toFixed(1)}%</p>
      <p><strong>IV Rank:</strong> ${item.ivRank} • <strong>IV Percentile:</strong> ${item.ivPercentile}</p>
      <p><strong>Expected Move:</strong> ±${Number(item.expectedMovePct || 0).toFixed(1)}%</p>
      <p><strong>Premium Bias:</strong> ${item.premiumBias || 'N/A'}</p>
      <p><strong>Session:</strong> ${item.sessionFocus || 'Mixed'}</p>
      <ul class="detail-list">
        ${(item.catalysts || []).map((catalyst) => `<li>${catalyst}</li>`).join('')}
      </ul>
    `;
    target.appendChild(card);
  });

  if (!payload.items || payload.items.length === 0) {
    target.innerHTML = '<div class="pro-lock">No elevated IV names are available right now.</div>';
  }
}

function renderHighIvLocked(message) {
  const target = document.getElementById('high-iv-results');
  if (!target) {
    return;
  }
  target.innerHTML = `<div class="pro-lock">${message}</div>`;
}

function renderPremiumSpikes(payload) {
  const target = document.getElementById('premium-spikes-results');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  rows.forEach((item) => {
    const isCall = String(item.premiumType || '').toLowerCase() === 'call';
    const card = document.createElement('article');
    card.className = `premium-spike-card premium-spike-card--${isCall ? 'call' : 'put'}`;
    const reaction = item.reaction || {};
    const reactionMove = Number(reaction.movePct || 0);
    const reactionSign = reactionMove > 0 ? '+' : '';
    const happenedAt = item.happenedAt || payload.generatedAt || 'N/A';
    card.innerHTML = `
      <h4>${item.symbol} • ${isCall ? 'CALL' : 'PUT'} spike</h4>
      <p><strong>Spike:</strong> ${fmtUsd(item.spikeAmountUsd)} (${Number(item.spikeMultiple || 0).toFixed(2)}x baseline)</p>
      <p><strong>When:</strong> ${happenedAt}</p>
      <p><strong>Expected:</strong> ${String(item.expectedDirection || '').toUpperCase()} • <strong>Reacted:</strong> ${reaction.label || 'N/A'}</p>
      <p><strong>Move after spike:</strong> ${reactionSign}${reactionMove.toFixed(2)}%</p>
      <p class="small-note">Call prem ${fmtUsd(item.callPremiumUsd)} • Put prem ${fmtUsd(item.putPremiumUsd)} • PCR ${Number(item.putCallRatio || 0).toFixed(2)}</p>
    `;
    target.appendChild(card);
  });

  if (!rows.length) {
    target.innerHTML = '<div class="pro-lock">No premium spikes detected right now.</div>';
  }
}

function renderPremiumSpikesLocked(message) {
  const target = document.getElementById('premium-spikes-results');
  if (!target) {
    return;
  }
  target.innerHTML = `<div class="pro-lock">${message}</div>`;
}

function renderEarningsBoard(payload) {
  const target = document.getElementById('earnings-board');
  target.innerHTML = '';
  const scheduleLabel = payload.scheduleLabel || 'Upcoming earnings';
  const dataSource = payload.source === 'nasdaq' ? 'Nasdaq calendar' : 'Estimated board';
  const activeItems = (payload.items || []).filter((item) => isEarningsItemStillActive(item));
  const displayItems = activeItems.length > 0 ? activeItems : (payload.items || []);
  displayItems.forEach((item) => {
    const up = Number(item.predictedMove.up || 0);
    const down = Number(item.predictedMove.down || 0);
    const directionClass = up >= down ? 'up' : 'down';
    const spread = Math.abs(up - down);
    const dateLabel = item.eventDateLabel || item.eventDate || scheduleLabel;
    const volumeSourceLabel = String(item.volumeSource || '').includes('yahoo')
      ? 'live vol'
      : 'est vol';
    const verificationState = String(item.verificationStatus || 'estimated').toLowerCase();
    const verificationLabel = verificationState === 'verified'
      ? 'verified'
      : verificationState === 'partial'
        ? 'partially verified'
        : 'estimated';
    const verificationClass = verificationState === 'verified'
      ? 'high'
      : verificationState === 'partial'
        ? 'medium'
        : 'low';
    const card = document.createElement('article');
    card.className = `earnings-card earnings-card--${directionClass} earnings-card--strength-${spread >= 14 ? 'high' : spread >= 7 ? 'mid' : 'low'}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.addEventListener('click', () => renderEarningsDetail(item));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        renderEarningsDetail(item);
      }
    });
    card.innerHTML = `
      <h3>${item.ticker}</h3>
      <p>${dateLabel} • ${item.reportTimeLabel}</p>
      <p>
        <span class="earnings-up-pct">${fmtPct(up)} up</span>
        /
        <span class="earnings-down-pct">${fmtPct(down)} down</span>
      </p>
      <p class="small-note">Volume: ${Number(item.volume || 0).toLocaleString()} <span class="earnings-volume-source">(${volumeSourceLabel})</span></p>
      <p class="small-note">Status: <span class="earnings-verification-chip earnings-verification-chip--${verificationClass}">${verificationLabel}</span></p>
      <p class="small-note">${directionClass.toUpperCase()} bias</p>
    `;
    target.appendChild(card);
  });

  const detail = document.getElementById('earnings-detail');
  if (detail) {
    detail.setAttribute('data-schedule-label', scheduleLabel);
    detail.setAttribute('data-source-label', dataSource);
  }

  if (displayItems.length > 0) {
    renderEarningsDetail(displayItems[0]);
  } else {
    const detail = document.getElementById('earnings-detail');
    if (detail) {
      detail.innerHTML = '<div class="pro-lock">No active earnings sessions right now. The board will auto-refresh for the next session.</div>';
    }
  }
}

function renderEarningsDetail(item) {
  const target = document.getElementById('earnings-detail');
  if (!target || !item) {
    return;
  }
  const scheduleLabel = target.getAttribute('data-schedule-label') || 'Upcoming earnings';
  const sourceLabel = target.getAttribute('data-source-label') || 'Estimated board';

  const fallbackIntel = item.unusualWhalesIntel || item.intel || {};
  const upPct = item.predictedMove?.up ?? item.probabilityUp ?? 0;
  const downPct = item.predictedMove?.down ?? item.probabilityDown ?? 0;
  const plays = item.unusualWhales?.plays || fallbackIntel.unusualPlays || [];
  const commentary = item.unusualWhales?.commentary || fallbackIntel.notes || [];
  const growth = item.futureGrowthSignals || fallbackIntel.notes || [];
  const outlookLines = item.unusualWhales?.futureGrowthOutlook || (fallbackIntel.headline ? [fallbackIntel.headline] : []);
  const analystPushes = item.analystPushes || [];
  const recentNews = item.recentNews || [];

  const playsHtml = plays
    .map(
      (play) => {
        const type = play.type || play.side || 'Flow';
        const strike = play.strike || play.strikeHint || '?';
        const expiration = play.expiration || `${play.expiry || '?'}d`;
        const sentiment = play.sentiment || 'watchlist';
        return `<li><strong>${type}</strong> ${strike} exp ${expiration} • ${fmtUsd(play.premiumUsd)} • ${sentiment}</li>`;
      }
    )
    .join('');
  const commentaryHtml = commentary.map((line) => `<li>${line}</li>`).join('');
  const growthHtml = growth.map((line) => `<li>${line}</li>`).join('');
  const outlookHtml = outlookLines.map((line) => `<li>${line}</li>`).join('');
  const analystPushesHtml = analystPushes
    .map((push) => {
      if (typeof push === 'string') {
        return `<li>${push}</li>`;
      }
      return `<li>${push.firm}: ${push.action} (${push.impact})</li>`;
    })
    .join('');
  const recentNewsHtml = recentNews
    .map((headline) => {
      const title = headline.title || 'Headline';
      const url = headline.url || '#';
      const publishedAt = headline.publishedAt ? ` • ${headline.publishedAt}` : '';
      return `<li><a class="open-link" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>${publishedAt}</li>`;
    })
    .join('');

  target.innerHTML = `
    <article class="earnings-detail-card">
      <h3>${item.ticker} Earnings Intel</h3>
      <p><strong>Date:</strong> ${item.eventDateLabel || item.eventDate || scheduleLabel}</p>
      <p><strong>Session:</strong> ${item.reportTimeLabel || 'Pre-Market'}</p>
      <p class="small-note"><strong>Calendar source:</strong> ${sourceLabel}</p>
      <p><strong>Direction:</strong> ${item.direction.toUpperCase()} • ${upPct}% up / ${downPct}% down</p>
      <p><strong>Estimated volume:</strong> ${Number(item.volume || 0).toLocaleString()}</p>
      <h4>Analyst Pushes</h4>
      <ul class="detail-list">${analystPushesHtml || '<li>No fresh analyst pushes detected.</li>'}</ul>
      <h4>Recent News</h4>
      <ul class="detail-list">${recentNewsHtml || '<li>No recent headlines available.</li>'}</ul>
      <h4>Unusual Plays (Whales-style)</h4>
      <ul class="detail-list">${playsHtml || '<li>No unusual plays detected.</li>'}</ul>
      <h4>Earnings / Future Growth Commentary</h4>
      <ul class="detail-list">${commentaryHtml || '<li>No commentary available.</li>'}</ul>
      <ul class="detail-list">${growthHtml || '<li>No growth signals available.</li>'}</ul>
      <h4>Whale Outlook</h4>
      <ul class="detail-list">${outlookHtml || '<li>No outlook notes available.</li>'}</ul>
    </article>
  `;
}

function renderAiSidebar(payload) {
  const details = document.getElementById('ai-platform-details');
  const select = document.getElementById('ai-platform-select');
  const openLink = document.getElementById('ai-open-link');
  if (!details || !select || !openLink) {
    return;
  }

  const platforms = payload.platforms || [];
  select.innerHTML = '';
  details.innerHTML = '';

  if (!platforms.length) {
    details.innerHTML = '<div class="pro-lock">No AI platforms available.</div>';
    openLink.setAttribute('href', FALLBACK_AI_DISCOVERY_LINK);
    return;
  }

  if (!platforms.some((platform) => platform.id === activeAiPlatform)) {
    activeAiPlatform = platforms[0].id;
  }

  platforms.forEach((platform) => {
    const option = document.createElement('option');
    option.value = platform.id;
    option.textContent = platform.label;
    select.appendChild(option);

    const isActive = activeAiPlatform === platform.id;
    if (isActive) {
      details.innerHTML = `
        <article class="stack-item">
          <p><strong>${platform.label}</strong> <span class="chip">Selected</span></p>
          <p class="small-note">${platform.description}</p>
        </article>
      `;
      openLink.setAttribute('href', platform.searchUrl);
    }
  });

  select.value = activeAiPlatform;
}

function humanizeSource(source) {
  const value = String(source || '').toLowerCase();
  const map = {
    all: 'All sources',
    tiktok: 'TikTok',
    youtube_shorts: 'YouTube Shorts',
    youtube: 'YouTube',
    snapchat_spotlight: 'Snapchat Spotlight',
    instagram_reels: 'Instagram Reels',
    facebook: 'Facebook',
    x_com: 'X.com'
  };
  return map[value] || source;
}

function renderTrendTrades(payload) {
  const target = document.getElementById('trend-trades-results');
  const sourceSelect = document.getElementById('trend-source-select');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  if (sourceSelect) {
    const sources = payload.availableSources || payload.sources || ['all'];
    sourceSelect.innerHTML = '';
    sources.forEach((source) => {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = humanizeSource(source);
      sourceSelect.appendChild(option);
    });
    if (!sources.includes(activeTrendSource)) {
      activeTrendSource = 'all';
    }
    sourceSelect.value = activeTrendSource;
  }
  (payload.items || []).forEach((item) => {
    const card = document.createElement('article');
    card.className = `trend-card trend-card--${item.momentum}`;
    card.innerHTML = `
      <h4>${item.symbol}</h4>
      <p><strong>${item.source}</strong> • ${item.visibility}</p>
      <p>Trend score: ${item.trendScore}</p>
      <p>Views: ${Number(item.views).toLocaleString()}</p>
      <p>${item.confidence.up}% up / ${item.confidence.down}% down</p>
    `;
    target.appendChild(card);
  });
}

function renderTrendTradesLocked(message) {
  const target = document.getElementById('trend-trades-results');
  if (!target) {
    return;
  }
  target.innerHTML = `<div class="pro-lock">${message}</div>`;
}

function humanizePatternType(type) {
  const value = String(type || '').toLowerCase();
  const map = {
    all: 'All Patterns',
    candlestick: 'Candlestick',
    volume_down: 'Volume-Down',
    volume_down_patterns: 'Volume-Down'
  };
  return map[value] || type;
}

function renderRealizedPatterns(payload) {
  const target = document.getElementById('patterns-results');
  const filterSelect = document.getElementById('pattern-type-select');
  if (!target) {
    return;
  }
  target.innerHTML = '';

  if (filterSelect) {
    const filters = payload.availableTypes || payload.availableFilters || ['all'];
    filterSelect.innerHTML = '';
    filters.forEach((filter) => {
      const option = document.createElement('option');
      option.value = filter;
      option.textContent = humanizePatternType(filter);
      filterSelect.appendChild(option);
    });
    if (!filters.includes(activePatternFilter)) {
      activePatternFilter = 'all';
    }
    filterSelect.value = activePatternFilter;
  }

  (payload.items || []).forEach((item) => {
    const card = document.createElement('article');
    card.className = 'pattern-card';
    const sessionLabel = item.sessionLabel
      || (item.session === 'pre-market' ? 'Pre-Market' : item.session === 'after-hours' ? 'After-Hours' : 'Live');
    const patternTypeLabel = item.patternTypeLabel || humanizePatternType(item.patternType);
    const triggerAt = item.triggerAt || `${item.targetMovePct || '?'}% target / ${item.invalidationPct || '?'}% invalidation`;
    const note = item.note || `Confidence ${item.confidence || '?'} • ${item.candleSignal || 'Pattern tracking active'}`;
    const volume = Number(item.volume || item.estVolume || item.volumeEstimate || 0).toLocaleString();
    card.innerHTML = `
      <h4>${item.ticker || item.symbol} • ${item.patternName}</h4>
      <p><strong>Session:</strong> ${sessionLabel}</p>
      <p><strong>Type:</strong> ${patternTypeLabel}</p>
      <p><strong>Trigger:</strong> ${triggerAt}</p>
      <p><strong>Volume:</strong> ${volume}</p>
      <p class="small-note">${note}</p>
    `;
    target.appendChild(card);
  });

  if (!payload.items || payload.items.length === 0) {
    target.innerHTML = '<div class="pro-lock">No active realized patterns right now. Triggered patterns are removed automatically.</div>';
  }
}

function renderWildTakes(payload) {
  const target = document.getElementById('wild-takes-results');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  (payload.items || []).forEach((item) => {
    const card = document.createElement('article');
    card.className = `wild-take-card wild-take-card--${item.sentiment || item.direction || 'neutral'}`;
    const title = item.title || `${item.symbol || 'Market'} ${String(item.direction || '').toUpperCase() || 'TAKE'}`;
    const summary = item.summary || item.text || 'No summary available.';
    const timeLabel = item.createdAtLabel || item.generatedAtLabel || 'Now';
    card.innerHTML = `
      <p><strong>${title}</strong></p>
      <p>${summary}</p>
      <p class="small-note">${item.source} • ${timeLabel}</p>
    `;
    target.appendChild(card);
  });

  if (!payload.items || payload.items.length === 0) {
    target.innerHTML = '<div class="pro-lock">No fresh wild takes right now.</div>';
  }
}

function renderInsiderTrades(payload) {
  const target = document.getElementById('insider-trades-results');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const filters = payload?.filters || {};
  const summary = document.createElement('p');
  summary.className = 'small-note insider-trades-summary';
  summary.textContent = `Matches: ${Number(payload?.totalMatches || rows.length).toLocaleString()} • Weird flow: ${Number(payload?.unusualCount || 0).toLocaleString()} • Side: ${String(filters.side || 'all').toUpperCase()} • Sort: ${String(filters.sortBy || 'anomaly_desc').replaceAll('_', ' ')}`;
  target.appendChild(summary);
  rows.forEach((item) => {
    const side = String(item.side || item.action || '').toLowerCase() === 'buy' ? 'buy' : 'sell';
    const valueUsd = Number(item.valueUsd ?? item.totalUsd ?? 0);
    const averagePriceUsd = Number(item.averagePriceUsd ?? item.priceUsd ?? 0);
    const shares = Number(item.shares || item.shareCount || 0);
    const reactionPct = Number(item.stockReactionPct || 0);
    const reactionSign = reactionPct > 0 ? '+' : '';
    const reactionClass = reactionPct > 0 ? 'up' : reactionPct < 0 ? 'down' : 'flat';
    const anomalyScore = Number(item.anomalyScore || 0);
    const unusualVolumeMultiple = Number(item.unusualVolumeMultiple || 0);
    const filedAtLabel = item.filedAt
      ? new Date(item.filedAt).toLocaleString()
      : (item.filedAtLabel || 'Filed recently');
    const role = item.role || item.insiderTitle || item.insiderRole || 'N/A';
    const conviction = String(item.conviction || item.impactLabel || 'medium')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
    const card = document.createElement('article');
    card.className = `insider-trade-card insider-trade-card--${side}`;
    card.innerHTML = `
      <h4>${item.symbol} • ${side.toUpperCase()}</h4>
      <p><strong>Insider:</strong> ${item.insiderName || 'N/A'} (${role})</p>
      <p><strong>Shares:</strong> ${shares.toLocaleString()} • <strong>Avg price:</strong> ${fmtUsd(averagePriceUsd)}</p>
      <p><strong>Total trade:</strong> ${fmtUsd(valueUsd)} • <strong>Conviction:</strong> ${conviction}</p>
      <p><strong>Anomaly score:</strong> <span class="insider-trade-anomaly-score">${anomalyScore}/100</span> • <strong>Size vs baseline:</strong> ${unusualVolumeMultiple.toFixed(2)}x</p>
      ${(item.unusualSignals || []).length ? `<ul class="detail-list insider-trade-signals">${(item.unusualSignals || []).map((signal) => `<li>${signal}</li>`).join('')}</ul>` : ''}
      <p><strong>Stock reaction:</strong> <span class="insider-trade-reaction insider-trade-reaction--${reactionClass}">${reactionSign}${reactionPct.toFixed(2)}%</span></p>
      <p class="small-note">${filedAtLabel} • Source: ${item.source || 'Insider feed'}</p>
      <p class="small-note">${item.details || item.summary || ''}</p>
    `;
    target.appendChild(card);
  });

  if (!rows.length) {
    target.innerHTML = '<div class="pro-lock">No large insider trades available right now.</div>';
  }
}

async function loadOutlook(ticker) {
  const payload = await fetchJson(`/api/market/stock-outlook?ticker=${encodeURIComponent(ticker)}`, {
    headers: headersWithPlan()
  });
  renderOutlook(payload);
}

async function loadEarningsBoard() {
  let payload;
  try {
    payload = await fetchJson('/api/market/earnings-gambling?targetDate=today', {
      headers: headersWithPlan()
    });
  } catch (_error) {
    payload = null;
  }
  const hasTodayItems = payload && Array.isArray(payload.items) && payload.items.length > 0;
  if (!hasTodayItems) {
    payload = await fetchJson('/api/market/earnings-gambling?targetDate=today&includeCompleted=true', {
      headers: headersWithPlan()
    });
  }
  renderEarningsBoard(payload);
}

async function runScanner(query, method) {
  const payload = await fetchJson(
    `/api/market/scan-x?ticker=${encodeURIComponent(query)}&method=${encodeURIComponent(method)}`,
    { headers: headersWithPlan() }
  );
  renderScanner(payload);
}

async function loadAiSidebar(query = '') {
  const payload = await fetchJson(`/api/market/ai-discovery?query=${encodeURIComponent(query)}`, {
    headers: headersWithPlan()
  });
  renderAiSidebar(payload);
}

async function loadTrendTrades() {
  try {
    const payload = await fetchJson(
      `/api/market/trend-trades?limit=8&source=${encodeURIComponent(activeTrendSource)}`,
      {
        headers: headersWithPlan()
      }
    );
    renderTrendTrades(payload);
  } catch (error) {
    if (error.status === 403) {
      renderTrendTradesLocked('Trend Trades is Pro-only. Upgrade to see social trend trading signals.');
      openProPopup('Pro access needed for Trend Trades. Upgrade to see social trend trading signals.');
      return;
    }
    throw error;
  }
}

async function loadRealizedPatterns() {
  const payload = await fetchJson(
    `/api/market/realized-patterns?limit=8&type=${encodeURIComponent(activePatternFilter)}`,
    { headers: headersWithPlan() }
  );
  renderRealizedPatterns(payload);
}

async function loadWildTakes() {
  const payload = await fetchJson('/api/market/wild-takes?limit=6', {
    headers: headersWithPlan()
  });
  renderWildTakes(payload);
}

async function loadInsiderTrades() {
  const params = new URLSearchParams({
    limit: '12',
    side: activeInsiderSide,
    symbol: activeInsiderSymbol,
    minValueUsd: String(Math.max(0, Math.trunc(activeInsiderMinValueUsd || 0))),
    sortBy: activeInsiderSortBy,
    unusualOnly: activeInsiderUnusualOnly ? 'true' : 'false'
  });
  const payload = await fetchJson(`/api/market/insider-trades?${params.toString()}`, {
    headers: headersWithPlan()
  });
  renderInsiderTrades(payload);
}

async function loadUnusualFeed() {
  try {
    const payload = await fetchJson('/api/market/unusual-moves', { headers: headersWithPlan() });
    renderUnusual(payload);
  } catch (error) {
    if (error.status === 403) {
      renderUnusualLocked('Pro feature locked. Upgrade to access unusual moves feed.');
      openProPopup('Pro access needed for Unusual Moves Feed.');
      return;
    }
    throw error;
  }
}

async function loadHighIvTracker() {
  try {
    const payload = await fetchJson('/api/market/high-iv?limit=8', {
      headers: headersWithPlan()
    });
    renderHighIv(payload);
  } catch (error) {
    if (error.status === 403) {
      renderHighIvLocked('High IV Tracker is Pro-only. Upgrade to unlock elevated IV monitoring.');
      openProPopup('Pro access needed for High IV Tracker.');
      return;
    }
    throw error;
  }
}

async function loadPremiumSpikes() {
  try {
    const payload = await fetchJson('/api/market/premium-spikes?limit=10', {
      headers: headersWithPlan()
    });
    renderPremiumSpikes(payload);
  } catch (error) {
    if (error.status === 403) {
      renderPremiumSpikesLocked('Call / Put Premium Spikes is Pro-only. Upgrade to unlock this module.');
      openProPopup('Pro access needed for Call / Put Premium Spikes.');
      return;
    }
    throw error;
  }
}

async function calculateOptions(formValues) {
  const query = new URLSearchParams({
    ticker: formValues.symbol,
    spot: formValues.spotPrice,
    strike: formValues.strikePrice,
    daysToExpiry: formValues.daysToExpiry,
    iv: formValues.impliedVolatility,
    type: formValues.contractType
  });
  try {
    const payload = await fetchJson(`/api/market/options?${query.toString()}`, {
      headers: headersWithPlan()
    });
    renderOptions(payload);
  } catch (error) {
    if (error.status === 403) {
      renderOptionsLocked('Pro feature locked. Upgrade to use options calculator and gamma exposure.');
      openProPopup('Pro access needed for the Options Calculator + Gamma Exposure.');
      return;
    }
    throw error;
  }
}

async function refreshBaseline() {
  const health = await fetchJson('/health');
  renderStatus(`API status: ${health.status}`);
  await Promise.all([
    loadOutlook(activeTicker),
    loadEarningsBoard(),
    loadAiSidebar(activeTicker),
    loadTrendTrades(),
    loadRealizedPatterns(),
    loadWildTakes(),
    loadInsiderTrades(),
    loadHighIvTracker(),
    loadPremiumSpikes()
  ]);
}

async function fetchBillingInfo() {
  try {
    billingInfo = await fetchJson('/api/auth/billing-info');
  } catch (_error) {
    billingInfo = null;
  }
  renderBillingInfo(billingInfo, null);
}

async function fetchCurrentUser() {
  if (!authToken) {
    currentUser = null;
    renderAuthState();
    return;
  }

  try {
    const payload = await fetchJson('/api/auth/me', { headers: headersWithPlan() });
    currentUser = payload.user;
  } catch (_error) {
    authToken = '';
    localStorage.removeItem('dumbdollars_token');
    currentUser = null;
    setAuthMessage('Session expired. Please sign in again.', true);
  }

  renderAuthState();
}

async function login(email, password) {
  const payload = await fetchJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  authToken = payload.token;
  localStorage.setItem('dumbdollars_token', authToken);
  saveAuthEmail(email);
  await fetchCurrentUser();
}

async function signup(email, password) {
  const payload = await fetchJson('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  authToken = payload.token;
  localStorage.setItem('dumbdollars_token', authToken);
  saveAuthEmail(email);
  await fetchCurrentUser();
}

async function socialSignIn(provider, email) {
  const payload = await fetchJson('/api/auth/oauth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, email })
  });
  authToken = payload.token;
  localStorage.setItem('dumbdollars_token', authToken);
  saveAuthEmail(email);
  await fetchCurrentUser();
  return payload;
}

function setupAuthForms() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const socialButtons = Array.from(document.querySelectorAll('.oauth-btn'));
  const logoutButton = document.getElementById('logout-btn');
  const checkoutButton = document.getElementById('upgrade-pro-btn');
  const billingPortalButton = document.getElementById('billing-portal-btn');
  const billingCard = document.getElementById('billing-safety-card');
  const billingCancelButton = document.getElementById('billing-safe-cancel');
  const billingContinueButton = document.getElementById('billing-safe-continue');

  function closeBillingCard() {
    if (!billingCard) {
      return;
    }
    billingCard.classList.add('hidden');
  }

  function setButtonBusy(button, isBusy, idleLabel, busyLabel) {
    if (!button) {
      return;
    }
    button.disabled = isBusy;
    button.textContent = isBusy ? busyLabel : idleLabel;
  }

  applySavedEmailToForms();

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const idleLabel = submitButton?.textContent || 'Log in';
    try {
      setButtonBusy(submitButton, true, idleLabel, 'Signing in...');
      await login(email, password);
      savePreferredEmail(email);
      setAuthMessage('Logged in successfully.');
      await Promise.all([refreshBaseline(), loadUnusualFeed(), loadTrendTrades()]);
    } catch (error) {
      setAuthMessage(error.message || 'Login failed.', true);
    } finally {
      setButtonBusy(submitButton, false, idleLabel, 'Signing in...');
    }
  });

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-password').value;
    const submitButton = signupForm.querySelector('button[type="submit"]');
    const idleLabel = submitButton?.textContent || 'Sign up';
    try {
      setButtonBusy(submitButton, true, idleLabel, 'Creating...');
      await signup(email, password);
      savePreferredEmail(email);
      setAuthMessage('Account created and logged in.');
      await Promise.all([refreshBaseline(), loadUnusualFeed(), loadTrendTrades()]);
    } catch (error) {
      setAuthMessage(error.message || 'Signup failed.', true);
    } finally {
      setButtonBusy(submitButton, false, idleLabel, 'Creating...');
    }
  });

  socialButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const provider = String(button.getAttribute('data-provider') || '').trim().toLowerCase();
      const loginInput = document.getElementById('login-email');
      const signupInput = document.getElementById('signup-email');
      const fallbackEmail = loadPreferredEmail() || getSavedAuthEmail();
      const preferred = String(loginInput?.value || signupInput?.value || fallbackEmail || '').trim().toLowerCase();
      if (!preferred) {
        setAuthMessage('Enter your email first, then choose Google/Apple/etc.', true);
        return;
      }
      try {
        button.disabled = true;
        const payload = await socialSignIn(provider, preferred);
        savePreferredEmail(preferred);
        const providerLabel = payload.providerLabel || provider;
        setAuthMessage(`${providerLabel} sign in successful.`);
        await Promise.all([refreshBaseline(), loadUnusualFeed(), loadTrendTrades()]);
      } catch (error) {
        setAuthMessage(error.message || 'Social sign in failed.', true);
      } finally {
        button.disabled = false;
      }
    });
  });

  logoutButton.addEventListener('click', async () => {
    authToken = '';
    currentUser = null;
    localStorage.removeItem('dumbdollars_token');
    closeBillingCard();
    renderAuthState();
    setAuthMessage('Logged out.');
    await Promise.all([refreshBaseline(), loadUnusualFeed(), loadTrendTrades()]);
  });

  if (billingCancelButton) {
    billingCancelButton.addEventListener('click', closeBillingCard);
  }

  if (billingContinueButton) {
    billingContinueButton.addEventListener('click', async () => {
      if (!currentUser) {
        setAuthMessage('Please login first.', true);
        closeBillingCard();
        return;
      }
      if (!billingInfo?.configured) {
        setAuthMessage('Billing is not configured yet. Try again later.', true);
        return;
      }

      try {
        const payload = await fetchJson('/api/auth/stripe/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headersWithPlan()
          }
        });
        if (!payload || !isSecureCheckoutUrl(payload.url)) {
          throw new Error('Could not verify secure Stripe checkout URL.');
        }
        closeBillingCard();
        window.location.href = payload.url;
      } catch (error) {
        setAuthMessage(error.message || 'Could not start checkout.', true);
      }
    });
  }

  checkoutButton.addEventListener('click', async () => {
    if (!currentUser) {
      setAuthMessage('Please login first.', true);
      return;
    }
    openProPlanScreen();
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !billingCard) {
      return;
    }
    if (!billingCard.classList.contains('hidden') && !billingCard.contains(target) && target !== checkoutButton) {
      const clickedCheckoutButton = checkoutButton.contains(target);
      if (!clickedCheckoutButton) {
        closeBillingCard();
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeBillingCard();
      closeProPopup();
    }
  });

  billingPortalButton.addEventListener('click', async () => {
    if (!currentUser) {
      setAuthMessage('Please login first.', true);
      return;
    }
    try {
      const payload = await fetchJson('/api/auth/stripe/create-customer-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headersWithPlan()
        }
      });
      window.location.href = payload.url;
    } catch (error) {
      setAuthMessage(error.message || 'Could not open billing portal.', true);
    }
  });
}

function setupAiSidebar() {
  const form = document.getElementById('ai-search-form');
  const trendForm = document.getElementById('trend-trades-form');
  const patternForm = document.getElementById('patterns-form');
  const insiderForm = document.getElementById('insider-trades-form');
  const select = document.getElementById('ai-platform-select');
  const trendSourceSelect = document.getElementById('trend-source-select');
  const patternTypeSelect = document.getElementById('pattern-type-select');
  const insiderSideSelect = document.getElementById('insider-side-select');
  const insiderSymbolInput = document.getElementById('insider-symbol-input');
  const insiderMinValueInput = document.getElementById('insider-min-value-input');
  const insiderSortSelect = document.getElementById('insider-sort-select');
  const insiderUnusualOnlyInput = document.getElementById('insider-unusual-only-input');
  const wildTakesButton = document.getElementById('wild-takes-refresh');
  const searchAllButton = document.getElementById('ai-search-all');
  const jumpPremiumSpikesButton = document.getElementById('jump-premium-spikes');

  if (
    !form
    || !trendForm
    || !patternForm
    || !insiderForm
    || !select
    || !trendSourceSelect
    || !patternTypeSelect
    || !insiderSideSelect
    || !insiderSymbolInput
    || !insiderMinValueInput
    || !insiderSortSelect
    || !insiderUnusualOnlyInput
    || !wildTakesButton
  ) {
    return;
  }

  insiderSideSelect.value = activeInsiderSide;
  insiderSortSelect.value = activeInsiderSortBy;
  insiderSymbolInput.value = activeInsiderSymbol;
  insiderMinValueInput.value = activeInsiderMinValueUsd > 0 ? String(activeInsiderMinValueUsd) : '';
  insiderUnusualOnlyInput.checked = activeInsiderUnusualOnly;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = document.getElementById('ai-search-query').value.trim() || activeTicker;
    try {
      activeAiPlatform = select.value || activeAiPlatform;
      await loadAiSidebar(query);
      await runScanner(query, 'llm-sentiment');
    } catch (error) {
      const target = document.getElementById('scan-results');
      target.innerHTML = `<div class="pro-lock">${error.message || 'AI search failed.'}</div>`;
    }
  });

  select.addEventListener('change', async () => {
    activeAiPlatform = select.value || 'x-com';
    const query = document.getElementById('ai-search-query').value.trim() || activeTicker;
    await loadAiSidebar(query);
  });

  trendForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    activeTrendSource = trendSourceSelect.value || 'all';
    try {
      await loadTrendTrades();
    } catch (error) {
      renderTrendTradesLocked(error.message || 'Could not load trend trades.');
      if (error.status === 403) {
        openProPopup('Pro access needed for Trend Trades.');
      }
    }
  });

  trendSourceSelect.addEventListener('change', async () => {
    activeTrendSource = trendSourceSelect.value || 'all';
    try {
      await loadTrendTrades();
    } catch (error) {
      renderTrendTradesLocked(error.message || 'Could not load trend trades.');
      if (error.status === 403) {
        openProPopup('Pro access needed for Trend Trades.');
      }
    }
  });

  patternForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    activePatternFilter = patternTypeSelect.value || 'all';
    try {
      await loadRealizedPatterns();
    } catch (error) {
      const target = document.getElementById('patterns-results');
      target.innerHTML = `<div class="pro-lock">${error.message || 'Could not load realized patterns.'}</div>`;
    }
  });

  patternTypeSelect.addEventListener('change', async () => {
    activePatternFilter = patternTypeSelect.value || 'all';
    try {
      await loadRealizedPatterns();
    } catch (error) {
      const target = document.getElementById('patterns-results');
      target.innerHTML = `<div class="pro-lock">${error.message || 'Could not load realized patterns.'}</div>`;
    }
  });

  wildTakesButton.addEventListener('click', async () => {
    try {
      await loadWildTakes();
    } catch (error) {
      const target = document.getElementById('wild-takes-results');
      target.innerHTML = `<div class="pro-lock">${error.message || 'Could not load wild takes.'}</div>`;
    }
  });

  insiderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    activeInsiderSide = String(insiderSideSelect.value || 'all').trim().toLowerCase();
    activeInsiderSymbol = String(insiderSymbolInput.value || '').trim().toUpperCase();
    const parsedMin = Number(insiderMinValueInput.value || 0);
    activeInsiderMinValueUsd = Number.isFinite(parsedMin) && parsedMin > 0 ? Math.round(parsedMin) : 0;
    activeInsiderSortBy = String(insiderSortSelect.value || 'anomaly_desc').trim().toLowerCase();
    activeInsiderUnusualOnly = Boolean(insiderUnusualOnlyInput.checked);
    try {
      await loadInsiderTrades();
    } catch (error) {
      const target = document.getElementById('insider-trades-results');
      if (target) {
        target.innerHTML = `<div class="pro-lock">${error.message || 'Could not load insider trades.'}</div>`;
      }
    }
  });

  insiderSortSelect.addEventListener('change', async () => {
    activeInsiderSortBy = String(insiderSortSelect.value || 'anomaly_desc').trim().toLowerCase();
    activeInsiderUnusualOnly = Boolean(insiderUnusualOnlyInput.checked);
    try {
      await loadInsiderTrades();
    } catch (_error) {
      // Form submit handler surfaces visible error states.
    }
  });

  if (searchAllButton) {
    searchAllButton.addEventListener('click', () => {
      const query = document.getElementById('ai-search-query').value.trim() || activeTicker;
      openAllAiPlatforms(query);
    });
  }

  const highIvButton = document.getElementById('high-iv-refresh');
  const premiumSpikesButton = document.getElementById('premium-spikes-refresh');
  const insiderTradesPageButton = document.getElementById('open-insider-trades-page');
  const portfoliosPageButton = document.getElementById('open-portfolios-page');
  const aiTradeButton = document.getElementById('open-ai-trade');
  const autoTraderButton = document.getElementById('open-ai-auto-trader');
  const aiAnalyzerButton = document.getElementById('open-ai-analyzer');
  if (highIvButton) {
    highIvButton.addEventListener('click', async () => {
      try {
        await loadHighIvTracker();
      } catch (error) {
        renderHighIvLocked(error.message || 'Could not load High IV Tracker.');
        if (error.status === 403) {
          openProPopup('Pro access needed for High IV Tracker.');
        }
      }
    });
  }

  if (premiumSpikesButton) {
    premiumSpikesButton.addEventListener('click', async () => {
      await focusPremiumSpikesSection();
    });
  }

  if (insiderTradesPageButton) {
    insiderTradesPageButton.addEventListener('click', () => {
      openInsiderTradesPage();
    });
  }

  if (portfoliosPageButton) {
    portfoliosPageButton.addEventListener('click', () => {
      openPortfoliosPage();
    });
  }

  if (jumpPremiumSpikesButton) {
    jumpPremiumSpikesButton.addEventListener('click', async () => {
      await focusPremiumSpikesSection();
    });
  }

  if (aiTradeButton) {
    aiTradeButton.addEventListener('click', async () => {
      window.location.href = '/ai-trade.html';
    });
  }

  if (autoTraderButton) {
    autoTraderButton.addEventListener('click', () => {
      openAutoTraderPage();
    });
  }

  if (aiAnalyzerButton) {
    aiAnalyzerButton.addEventListener('click', () => {
      window.location.href = '/ai-analyzer.html';
    });
  }
}

function setupModuleDeepLinks() {
  const params = new URLSearchParams(window.location.search);
  const moduleParam = String(params.get('module') || '').trim().toLowerCase();
  const hash = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
  const wantsPremiumSpikes = moduleParam === 'premium-spikes' || hash === 'premium-spikes';
  if (!wantsPremiumSpikes) {
    return;
  }
  window.setTimeout(() => {
    focusPremiumSpikesSection().catch((error) => {
      console.error(error);
    });
  }, 180);
}

function setupSidebarMenu() {
  const menuToggle = document.getElementById('sidebar-menu-toggle');
  const sidebar = document.getElementById('sidebar-panel');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!menuToggle || !sidebar) {
    return;
  }

  menuToggle.addEventListener('click', () => {
    toggleSidebarMenu();
  });

  // Keep desktop as a dropdown too, so the menu behavior is consistent.
  closeSidebarMenu();

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (!sidebar.contains(target) && target !== menuToggle && !menuToggle.contains(target)) {
      closeSidebarMenu();
    }
  });

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      closeSidebarMenu();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSidebarMenu();
    }
  });
}

function setupStockForm() {
  const form = document.getElementById('stock-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('ticker-input');
    const next = (input.value || '').trim().toUpperCase();
    if (!next) {
      return;
    }
    activeTicker = next;
    try {
      await loadOutlook(activeTicker);
      await loadEarningsBoard();
    } catch (error) {
      console.error(error);
      renderStatus('Failed to load stock outlook.');
    }
  });
}

function setupScanForm() {
  const form = document.getElementById('scan-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const queryEl = document.getElementById('scan-query');
    const methodEl = document.getElementById('scan-method');
    const query = (queryEl.value || '').trim();
    if (!query) {
      return;
    }
    try {
      await runScanner(query, methodEl.value);
    } catch (error) {
      const target = document.getElementById('scan-results');
      if (error.status === 403) {
        target.innerHTML = `<div class="pro-lock">${error.message}</div>`;
        openProPopup(`Pro access needed. ${error.message}`);
      } else {
        target.innerHTML = '<div class="pro-lock">Scanner failed. Try again.</div>';
      }
    }
  });
}

function setupOptionsForm() {
  const form = document.getElementById('options-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = {
      symbol: document.getElementById('option-symbol').value.trim().toUpperCase() || activeTicker,
      spotPrice: document.getElementById('spot-price').value,
      strikePrice: document.getElementById('strike-price').value,
      daysToExpiry: document.getElementById('days-to-expiry').value,
      impliedVolatility: document.getElementById('iv').value,
      contractType: document.getElementById('contract-type').value
    };
    try {
      await calculateOptions(values);
    } catch (error) {
      console.error(error);
      renderOptionsLocked('Failed to calculate options. Check inputs and retry.');
      if (error.status === 403) {
        openProPopup('Pro access needed for the Options Calculator + Gamma Exposure.');
      }
    }
  });
}

function setupUnusualRefresh() {
  const button = document.getElementById('refresh-unusual');
  button.addEventListener('click', async () => {
    try {
      await loadUnusualFeed();
    } catch (error) {
      console.error(error);
      renderUnusualLocked('Failed to refresh unusual moves feed.');
      if (error.status === 403) {
        openProPopup('Pro access needed for Unusual Moves Feed.');
      }
    }
  });
}

function setupProPopup() {
  const backdrop = document.getElementById('pro-popup-backdrop');
  const popup = document.getElementById('pro-popup');
  const upgradeBtn = document.getElementById('pro-popup-upgrade');
  const closeBtn = document.getElementById('pro-popup-close');
  if (!backdrop || !popup || !closeBtn) {
    return;
  }

  closeBtn.addEventListener('click', closeProPopup);
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      closeProPopup();
      openProPlanScreen();
    });
  }
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeProPopup();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && proPopupVisible) {
      closeProPopup();
    }
  });
}

async function init() {
  authToken = localStorage.getItem('dumbdollars_token') || '';
  await handleCheckoutReturn();
  applySavedEmailToForms();
  const rememberedEmail = loadPreferredEmail();
  if (rememberedEmail) {
    const loginEmail = document.getElementById('login-email');
    const signupEmail = document.getElementById('signup-email');
    if (loginEmail instanceof HTMLInputElement) {
      loginEmail.value = rememberedEmail;
    }
    if (signupEmail instanceof HTMLInputElement) {
      signupEmail.value = rememberedEmail;
    }
  }
  await fetchBillingInfo();
  setupAuthForms();
  setupProPopup();
  setupSidebarMenu();
  setupAiSidebar();
  setupModuleDeepLinks();
  setupStockForm();
  setupScanForm();
  setupOptionsForm();
  setupUnusualRefresh();

  try {
    await fetchCurrentUser();
    await refreshBaseline();
    await Promise.all([loadUnusualFeed(), loadHighIvTracker()]);
    await runScanner(activeTicker, 'llm-sentiment');
  } catch (error) {
    console.error(error);
    renderStatus('Failed to initialize dashboard.');
  }

  if (earningsRefreshIntervalId) {
    clearInterval(earningsRefreshIntervalId);
  }
  earningsRefreshIntervalId = window.setInterval(() => {
    loadEarningsBoard().catch((error) => {
      console.error(error);
    });
  }, 90_000);

  startEarningsDayRolloverWatcher();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    const currentDateKey = getEtDateKey();
    if (currentDateKey !== earningsLastEtDateKey) {
      earningsLastEtDateKey = currentDateKey;
      loadEarningsBoard().catch((error) => {
        console.error(error);
      });
    }
  });
}

init();
