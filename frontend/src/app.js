const PLAN_FREE = 'free';
const PLAN_PRO = 'pro';
const PRO_MONTHLY_PRICE = '$15/month';

let activePlan = PLAN_FREE;
let activeTicker = 'AAPL';
let authToken = '';
let currentUser = null;
let activeAiPlatform = 'x-com';
let activeTrendSource = 'all';

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

function fmtPct(value) {
  return `${Number(value).toFixed(0)}%`;
}

function fmtUsd(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function renderStatus(text) {
  const status = document.getElementById('status');
  status.textContent = text;
}

function setAuthMessage(text, isError = false) {
  const node = document.getElementById('auth-message');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
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

function renderEarningsBoard(payload) {
  const target = document.getElementById('earnings-board');
  target.innerHTML = '';
  const scheduleLabel = payload.scheduleLabel || 'Tomorrow';
  payload.items.forEach((item) => {
    const card = document.createElement('article');
    card.className = `earnings-card earnings-card--${item.direction}`;
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
      <p>${scheduleLabel} • ${item.reportTimeLabel}</p>
      <p><strong>${fmtPct(item.predictedMove.up)} up</strong> / ${fmtPct(item.predictedMove.down)} down</p>
      <p class="small-note">Volume: ${Number(item.volume || 0).toLocaleString()}</p>
      <p class="small-note">${item.direction.toUpperCase()} bias</p>
    `;
    target.appendChild(card);
  });

  if ((payload.items || []).length > 0) {
    renderEarningsDetail(payload.items[0]);
  } else {
    const detail = document.getElementById('earnings-detail');
    if (detail) {
      detail.innerHTML = '<div class="pro-lock">No earnings details available.</div>';
    }
  }
}

function renderEarningsDetail(item) {
  const target = document.getElementById('earnings-detail');
  if (!target || !item) {
    return;
  }

  const fallbackIntel = item.unusualWhalesIntel || item.intel || {};
  const upPct = item.predictedMove?.up ?? item.probabilityUp ?? 0;
  const downPct = item.predictedMove?.down ?? item.probabilityDown ?? 0;
  const plays = item.unusualWhales?.plays || fallbackIntel.unusualPlays || [];
  const commentary = item.unusualWhales?.commentary || fallbackIntel.notes || [];
  const growth = item.futureGrowthSignals || fallbackIntel.notes || [];
  const outlookLines = item.unusualWhales?.futureGrowthOutlook || (fallbackIntel.headline ? [fallbackIntel.headline] : []);

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

  target.innerHTML = `
    <article class="earnings-detail-card">
      <h3>${item.ticker} Earnings Intel</h3>
      <p><strong>Session:</strong> ${item.reportTimeLabel || 'Pre-Market'}</p>
      <p><strong>Direction:</strong> ${item.direction.toUpperCase()} • ${upPct}% up / ${downPct}% down</p>
      <p><strong>Estimated volume:</strong> ${Number(item.volume || 0).toLocaleString()}</p>
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
    openLink.setAttribute('href', '#');
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

async function loadOutlook(ticker) {
  const payload = await fetchJson(`/api/market/stock-outlook?ticker=${encodeURIComponent(ticker)}`, {
    headers: headersWithPlan()
  });
  renderOutlook(payload);
}

async function loadEarningsBoard() {
  const payload = await fetchJson('/api/market/earnings-gambling', {
    headers: headersWithPlan()
  });
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
      return;
    }
    throw error;
  }
}

async function loadUnusualFeed() {
  try {
    const payload = await fetchJson('/api/market/unusual-moves', { headers: headersWithPlan() });
    renderUnusual(payload);
  } catch (error) {
    if (error.status === 403) {
      renderUnusualLocked('Pro feature locked. Upgrade to access unusual moves feed.');
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
      return;
    }
    throw error;
  }
}

async function refreshBaseline() {
  const health = await fetchJson('/health');
  renderStatus(`API status: ${health.status}`);
  await Promise.all([loadOutlook(activeTicker), loadEarningsBoard(), loadAiSidebar(activeTicker), loadTrendTrades()]);
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
  await fetchCurrentUser();
}

function setupAuthForms() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const logoutButton = document.getElementById('logout-btn');
  const checkoutButton = document.getElementById('upgrade-pro-btn');
  const billingPortalButton = document.getElementById('billing-portal-btn');

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    try {
      await login(email, password);
      setAuthMessage('Logged in successfully.');
      await Promise.all([refreshBaseline(), loadUnusualFeed(), loadTrendTrades()]);
    } catch (error) {
      setAuthMessage(error.message || 'Login failed.', true);
    }
  });

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-password').value;
    try {
      await signup(email, password);
      setAuthMessage('Account created and logged in.');
      await Promise.all([refreshBaseline(), loadUnusualFeed(), loadTrendTrades()]);
    } catch (error) {
      setAuthMessage(error.message || 'Signup failed.', true);
    }
  });

  logoutButton.addEventListener('click', async () => {
    authToken = '';
    currentUser = null;
    localStorage.removeItem('dumbdollars_token');
    renderAuthState();
    setAuthMessage('Logged out.');
    await Promise.all([refreshBaseline(), loadUnusualFeed(), loadTrendTrades()]);
  });

  checkoutButton.addEventListener('click', async () => {
    if (!currentUser) {
      setAuthMessage('Please login first.', true);
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
      window.location.href = payload.url;
    } catch (error) {
      setAuthMessage(error.message || 'Could not start checkout.', true);
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
  const select = document.getElementById('ai-platform-select');
  const trendSourceSelect = document.getElementById('trend-source-select');

  if (!form || !trendForm || !select || !trendSourceSelect) {
    return;
  }

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
    }
  });

  trendSourceSelect.addEventListener('change', async () => {
    activeTrendSource = trendSourceSelect.value || 'all';
    try {
      await loadTrendTrades();
    } catch (error) {
      renderTrendTradesLocked(error.message || 'Could not load trend trades.');
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
    }
  });
}

async function init() {
  authToken = localStorage.getItem('dumbdollars_token') || '';
  setupAuthForms();
  setupAiSidebar();
  setupStockForm();
  setupScanForm();
  setupOptionsForm();
  setupUnusualRefresh();

  try {
    await fetchCurrentUser();
    await refreshBaseline();
    await loadUnusualFeed();
    await loadAiSidebar(activeTicker);
    await loadTrendTrades();
    await runScanner(activeTicker, 'llm-sentiment');
  } catch (error) {
    console.error(error);
    renderStatus('Failed to initialize dashboard.');
  }
}

init();
