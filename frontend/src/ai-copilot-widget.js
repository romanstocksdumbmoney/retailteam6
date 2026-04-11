function normalizePathname(pathname) {
  const raw = String(pathname || '/').trim() || '/';
  if (raw === '/index.html') {
    return '/';
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

const AUTH_TOKEN_STORAGE_KEY = 'dumbdollars_token';
const LAST_COMPLAINT_TICKET_KEY = 'dumbdollars_last_complaint_ticket';

function getStoredAuthToken() {
  try {
    return String(localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '').trim();
  } catch (_error) {
    return '';
  }
}

function getLastComplaintTicketId() {
  try {
    return String(localStorage.getItem(LAST_COMPLAINT_TICKET_KEY) || '').trim();
  } catch (_error) {
    return '';
  }
}

function setLastComplaintTicketId(ticketId) {
  try {
    const value = String(ticketId || '').trim();
    if (!value) {
      localStorage.removeItem(LAST_COMPLAINT_TICKET_KEY);
      return;
    }
    localStorage.setItem(LAST_COMPLAINT_TICKET_KEY, value);
  } catch (_error) {
    // Non-fatal if storage is unavailable.
  }
}

async function submitCopilotComplaint(input = {}) {
  const authToken = getStoredAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }
  const response = await fetch('/api/market/copilot/complaints', {
    method: 'POST',
    headers,
    body: JSON.stringify(input)
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.message || 'Could not submit complaint.');
    error.status = response.status;
    error.body = payload;
    throw error;
  }
  return payload;
}

async function fetchComplaintTicketStatus(ticketId) {
  const response = await fetch(`/api/market/copilot/complaints/${encodeURIComponent(ticketId)}`, { method: 'GET' });
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.message || 'Could not load complaint status.');
    error.status = response.status;
    error.body = payload;
    throw error;
  }
  return payload;
}

function statusLabel(status) {
  const key = String(status || '').trim().toLowerCase();
  if (!key) {
    return 'Open';
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function includesAny(text, tokens) {
  return tokens.some((token) => text.includes(token));
}

function buildRouteSuggestion(input, pathname) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) {
    return null;
  }

  const routes = [
    {
      href: '/ai-bot-funding.html',
      label: 'Live AI Account Setup',
      keywords: ['live account', 'open live account', 'live ai', 'ai will run', 'run ai on my account', 'hands-free live', 'ai run it']
    },
    {
      href: '/brokerage-onboarding.html',
      label: 'Broker Connection',
      keywords: ['broker', 'robinhood', 'alpaca', 'ibkr', 'interactive brokers', 'connect account', 'connection test', 'bridge']
    },
    {
      href: '/ai-bot-account.html',
      label: 'AI Account View',
      keywords: ['account view', 'approval inbox', 'take selected', 'execute order', 'submit trade']
    },
    {
      href: '/ai-bot-trader.html',
      label: 'AI Bot Setup',
      keywords: ['ai bot', 'auto trader', 'setup ai', 'hands-free', 'risk reward', 'prompt control']
    },
    {
      href: '/ai-live-account-setup.html',
      label: 'AI Live Account Guide',
      keywords: ['guided', 'set up trading account', 'setup trading account', 'ai setup guide', 'start here ai', 'open brokerage account', 'broker account with api', 'good api keys']
    },
    {
      href: '/ai-bot-funding.html',
      label: 'Funding + Test Area',
      keywords: ['funding', 'deposit', 'paper trade', 'test area', 'live funding']
    },
    {
      href: '/ai-bot-paper-connect.html',
      label: 'TradingView Paper Connect',
      keywords: ['tradingview', 'paper connect']
    },
    {
      href: '/ai-trade.html',
      label: 'AI Trade',
      keywords: ['ai trade', 'chart upload', 'trade setup', 'analyze chart']
    },
    {
      href: '/ai-analyzer.html',
      label: 'AI Screenshot Analyzer',
      keywords: ['screenshot', 'pattern', 'analyzer', 'good trade']
    },
    {
      href: '/payment.html',
      label: 'Payment',
      keywords: ['pay', 'payment', 'billing', 'subscribe', 'upgrade']
    },
    {
      href: '/checkout.html',
      label: 'Checkout',
      keywords: ['checkout', 'card', 'stripe']
    },
    {
      href: '/pro.html',
      label: 'Pro Plan',
      keywords: ['pro', 'plan', 'membership']
    },
    {
      href: '/insider-trades.html',
      label: 'Insider Trades',
      keywords: ['insider', 'insider trades']
    },
    {
      href: '/portfolios.html',
      label: 'Portfolios',
      keywords: ['portfolio', 'portfolios']
    },
    {
      href: '/',
      label: 'Dashboard',
      keywords: ['dashboard', 'home', 'stocks', 'stock', 'scanner', 'earnings', 'outlook']
    }
  ];

  const match = routes.find((route) => includesAny(text, route.keywords));
  if (!match) {
    return null;
  }
  if (normalizePathname(pathname) === normalizePathname(match.href)) {
    return null;
  }
  const wantsRedirect = /(go to|open|take me|send me|redirect|navigate|bring me)/i.test(text);
  return {
    ...match,
    wantsRedirect
  };
}

function buildCopilotReply(input, context, pathname) {
  const text = String(input || '').trim().toLowerCase();
  const route = buildRouteSuggestion(text, pathname);
  let message = '';

  if (!text) {
    message = 'Ask me what to do on this page, and I will guide you step-by-step.';
  } else if (text.includes('next') || text.includes('what now') || text.includes('step')) {
    message = `Next step: ${context.nextLabel}.`;
  } else if (text.includes('sign up') || text.includes('signup') || text.includes('open account')) {
    message = 'Account sign-up must be done by the user (identity/KYC). After sign-up, return here to connect broker permissions for AI execution.';
  } else if (text.includes('risk') || text.includes('reward')) {
    message = 'Use max risk per trade and min reward/risk ratio to filter weaker setups. Higher minimum reward/risk means fewer but cleaner proposals.';
  } else if (includesAny(text, ['live account', 'open live account', 'live ai', 'ai will run', 'hands-free live', 'run ai on my account'])) {
    message = 'To open a live AI account flow: choose Live Funding mode, connect broker bridge, run the bridge test, then enable hands-free live execution.';
  } else if (text.includes('broker') || text.includes('connect')) {
    message = 'For broker mode: save credentials, run bridge test, and clear pending setup steps. AI live automation should only be enabled after those checks pass.';
  } else if (text.includes('paper') || text.includes('test')) {
    message = 'Paper/Test mode is the safest first run. Tune risk and prompt quality there before enabling live execution.';
  } else if (text.includes('pay') || text.includes('checkout') || text.includes('billing')) {
    message = 'For billing: review payment details, continue to checkout, then return to dashboard after success. Use Manage Billing for subscription changes.';
  } else if (text.includes('login') || text.includes('sign in') || text.includes('auth')) {
    message = 'If sign-in fails, retry once, confirm email/password, or use social provider. Keep remember-login enabled for a smoother experience.';
  } else if (text.includes('complaint') || text.includes('report issue') || text.includes('bug report') || text.includes('not working')) {
    message = 'Use "Report an issue" in this Copilot panel. Include what page you are on and what button failed. You will get a ticket ID we can track and fix.';
  } else if (text.includes('trade') || text.includes('execute') || text.includes('submit') || text.includes('auto')) {
    message = 'In account view, run a cycle, review proposals, select trades, and submit. If hands-free mode is enabled, auto-submit can run after readiness checks.';
  } else if (text.includes('stock') || text.includes('scanner') || text.includes('earnings') || text.includes('options')) {
    message = 'I can help with stocks by guiding you to scanner, outlook, earnings, and AI modules, then routing you to the right page.';
  } else {
    message = 'I can help with setup, stocks, risk settings, broker connection, and next steps. Try asking: "take me to AI setup" or "open checkout".';
  }

  if (route && !route.wantsRedirect) {
    message = `${message} I can route you to ${route.label}.`;
  }
  if (route && route.wantsRedirect) {
    message = `${message} Redirecting you now to ${route.label}.`;
  }

  return {
    message,
    route
  };
}

function getAiCopilotContext(pathname) {
  const page = normalizePathname(pathname);
  const baseContext = {
    pageTitle: 'DumbDollars',
    nextHref: '/ai-bot-trader.html',
    nextLabel: 'Open AI setup',
    starterTips: [
      'Use the quick links above to move around the app quickly.',
      'Ask things like: "what should I do next?" or "what do I put here?"',
      'AI can assist with strategy and routing, but broker sign-up/KYC must be completed by the user.'
    ]
  };

  const contexts = {
    '/ai-bot-trader.html': {
      pageTitle: 'AI Bot Trader setup',
      nextHref: '/ai-bot-funding.html',
      nextLabel: 'Next: Funding + Test Area',
      starterTips: [
        'Set risk per trade, min reward/risk, and holdings before saving.',
        'Enable hands-free live execution only after broker bridge tests are passing.',
        'After saving, continue to Funding + Test Area.'
      ]
    },
    '/ai-bot-funding.html': {
      pageTitle: 'Funding + Test Area',
      nextHref: '/brokerage-onboarding.html',
      nextLabel: 'Next: Connect broker bridge',
      starterTips: [
        'Use Test Area first for paper trading confidence.',
        'For live mode, complete funding and then connect broker credentials.',
        'Open the broker page when you are ready for live bridge testing.'
      ]
    },
    '/ai-bot-paper-connect.html': {
      pageTitle: 'TradingView paper connect',
      nextHref: '/ai-bot-account.html',
      nextLabel: 'Next: Open AI account view',
      starterTips: [
        'Use the same TradingView email that you use in TradingView.',
        'Save risk and target return carefully; these drive sizing behavior.',
        'After connect success, open the account view to monitor activity.'
      ]
    },
    '/ai-bot-funding-payment.html': {
      pageTitle: 'Funding payment',
      nextHref: '/ai-bot-account.html',
      nextLabel: 'Next: Open AI account view',
      starterTips: [
        'Complete payment first, then apply deposit to your AI account.',
        'If payment is cancelled, retry from this page.',
        'After deposit apply, check account cash and execution readiness.'
      ]
    },
    '/ai-bot-account.html': {
      pageTitle: 'AI brokerage account',
      nextHref: '/brokerage-onboarding.html',
      nextLabel: 'Open broker setup checklist',
      starterTips: [
        'Run cycle to generate proposals, then choose trades in the approval inbox.',
        'Use "Take Selected Trades" to submit only checked proposals.',
        'If broker submissions fail, open broker checklist and complete pending steps.'
      ]
    },
    '/brokerage-onboarding.html': {
      pageTitle: 'Broker connection',
      nextHref: '/ai-bot-account.html',
      nextLabel: 'Back to account execution view',
      starterTips: [
        'Broker sign-up and KYC are user-completed steps and cannot be automated.',
        'Save credentials, run connection test, and resolve pending checklist steps.',
        'Once bridge is ready, go back to account view for trading actions.'
      ]
    },
    '/': {
      pageTitle: 'Dashboard',
      nextHref: '/ai-bot-trader.html',
      nextLabel: 'Open AI Trader setup',
      starterTips: [
        'Use module search to jump to any feature quickly.',
        'For AI trading, start with AI setup, then Funding/Test, then Broker Connect.',
        'If you are new, start paper mode first before moving to live.'
      ]
    },
    '/pro.html': {
      pageTitle: 'Pro plan',
      nextHref: '/payment.html',
      nextLabel: 'Continue to payment page',
      starterTips: [
        'Review pro features first, then continue to payment.',
        'You can return to dashboard anytime from the back link.',
        'After upgrade, AI live features are easier to unlock.'
      ]
    },
    '/payment.html': {
      pageTitle: 'Payment review',
      nextHref: '/checkout.html',
      nextLabel: 'Continue to checkout',
      starterTips: [
        'Review benefits and billing safety details here.',
        'Continue to checkout for secure Stripe flow.',
        'If checkout fails, come back and retry.'
      ]
    },
    '/checkout.html': {
      pageTitle: 'Checkout',
      nextHref: '/payment.html',
      nextLabel: 'Back to payment review',
      starterTips: [
        'This is the final step before hosted checkout.',
        'After purchase, return to dashboard and AI pages.',
        'Use Manage Billing later from the dashboard.'
      ]
    },
    '/ai-trade.html': {
      pageTitle: 'AI Trade analyzer',
      nextHref: '/ai-bot-funding.html',
      nextLabel: 'Open Funding + Test Area',
      starterTips: [
        'Upload a chart to get AI trade analysis.',
        'Queue strong setups to live execution flow when ready.',
        'Use Funding/Test page to control risk and capital.'
      ]
    },
    '/ai-trade-access.html': {
      pageTitle: 'AI Trade access',
      nextHref: '/ai-trade.html',
      nextLabel: 'Open AI Trade',
      starterTips: [
        'Sign up or log in first to unlock AI trading tools.',
        'After login, go to AI Trade and AI Bot Trader pages.',
        'Keep remember-login enabled for smoother sessions.'
      ]
    },
    '/ai-analyzer.html': {
      pageTitle: 'AI screenshot analyzer',
      nextHref: '/ai-bot-trader.html',
      nextLabel: 'Open AI Bot Trader',
      starterTips: [
        'Upload screenshots to review if a trade was good or risky.',
        'Use scores and pattern suggestions to refine your setup.',
        'Then apply what you learned in AI Bot Trader config.'
      ]
    },
    '/ai-implementation-steps.html': {
      pageTitle: 'AI implementation steps',
      nextHref: '/ai-bot-trader.html',
      nextLabel: 'Start with AI setup',
      starterTips: [
        'Follow steps in order: setup, test, then live.',
        'Risk controls should be in place before automation.',
        'Broker sign-up/KYC cannot be automated and must be user-completed.'
      ]
    },
    '/ai-live-account-setup.html': {
      pageTitle: 'Set up Trading account with AI',
      nextHref: '/ai-bot-funding.html',
      nextLabel: 'Open Funding + Test Area',
      starterTips: [
        'Use this page as your exact checklist to get AI running on your account.',
        'Complete broker onboarding and connection test before turning on hands-free live mode.',
        'Start with small size first even after setup is complete.'
      ]
    },
    '/insider-trades.html': {
      pageTitle: 'Insider trades',
      nextHref: '/',
      nextLabel: 'Back to dashboard',
      starterTips: [
        'Use this as signal context, not stand-alone trade advice.',
        'Refresh to update list and check large value moves.',
        'Combine with AI Trade and Trend modules for better decisions.'
      ]
    },
    '/portfolios.html': {
      pageTitle: 'Portfolios',
      nextHref: '/',
      nextLabel: 'Back to dashboard',
      starterTips: [
        'Filter for strong performance and larger asset managers.',
        'Use trade activity as idea generation, then verify risk.',
        'Cross-check with scanner and AI modules before acting.'
      ]
    },
    '/social-auth.html': {
      pageTitle: 'Social sign-in',
      nextHref: '/',
      nextLabel: 'Back to dashboard',
      starterTips: [
        'Pick provider and confirm your email carefully.',
        'If a provider fails, retry or use email/password login.',
        'After login, continue from dashboard quick links.'
      ]
    }
  };

  return {
    ...baseContext,
    ...(contexts[page] || {})
  };
}

function buildQuickNav(pathname) {
  const page = normalizePathname(pathname);
  const tradeFlow = [
    { href: '/ai-bot-trader.html', label: '1) Setup AI' },
    { href: '/ai-bot-funding.html', label: '2) Funding/Test' },
    { href: '/brokerage-onboarding.html', label: '3) Broker Connect' },
    { href: '/ai-bot-account.html', label: '4) Run + Trade' }
  ];
  const core = [
    { href: '/', label: 'Dashboard' },
    { href: '/ai-trade.html', label: 'AI Trade' },
    { href: '/ai-analyzer.html', label: 'AI Analyzer' },
    { href: '/pro.html', label: 'Pro' }
  ];
  const links = page.startsWith('/ai-bot') || page === '/brokerage-onboarding.html'
    ? tradeFlow
    : core;
  if (page === '/ai-bot-funding-payment.html') {
    return [
      { href: '/ai-bot-funding.html', label: 'Funding Setup' },
      { href: '/ai-bot-funding-payment.html', label: 'Funding Payment' },
      { href: '/ai-bot-account.html', label: 'Account View' }
    ];
  }
  if (page === '/payment.html' || page === '/checkout.html') {
    return [
      { href: '/pro.html', label: 'Pro Plan' },
      { href: '/payment.html', label: 'Payment' },
      { href: '/checkout.html', label: 'Checkout' }
    ];
  }
  return links;
}

function mountAiQuickNav() {
  if (document.querySelector('.ai-page-quick-nav')) {
    return;
  }
  const host = document.querySelector('.ai-trade-page-card, .payment-page-card, .pro-page-card, .container');
  if (!host) {
    return;
  }
  const pathname = normalizePathname(window.location.pathname || '/');
  const nav = document.createElement('section');
  nav.className = 'ai-page-quick-nav';
  nav.setAttribute('aria-label', 'AI trading quick navigation');

  const links = buildQuickNav(pathname);
  nav.innerHTML = `
    <h3>Quick AI Navigation</h3>
    <div class="ai-page-quick-nav-links">
      ${links.map((link) => {
        const active = pathname === normalizePathname(link.href);
        return `<a class="${active ? 'ai-page-quick-link ai-page-quick-link--active' : 'ai-page-quick-link'}" href="${link.href}">${link.label}</a>`;
      }).join('')}
    </div>
  `;

  const heading = host.querySelector(':scope > h1, :scope h1');
  if (heading && heading.parentElement === host) {
    heading.insertAdjacentElement('afterend', nav);
    return;
  }
  host.prepend(nav);
}

function mountAiCopilotWidget() {
  if (document.getElementById('ai-copilot-shell')) {
    return;
  }
  const pathname = normalizePathname(window.location.pathname || '/');
  const context = getAiCopilotContext(pathname);

  const shell = document.createElement('div');
  shell.id = 'ai-copilot-shell';
  shell.className = 'ai-copilot-shell';
  shell.innerHTML = `
    <button type="button" class="ai-copilot-fab" id="ai-copilot-fab" aria-controls="ai-copilot-panel" aria-expanded="false">
      <span class="ai-copilot-fab-dot" aria-hidden="true"></span>
      <span>AI Copilot</span>
    </button>
    <section class="ai-copilot-panel" id="ai-copilot-panel" hidden aria-live="polite" aria-label="AI Copilot helper">
      <header class="ai-copilot-header">
        <div>
          <strong>AI Copilot</strong>
          <p class="small-note">Chat, routing, and live account help</p>
        </div>
        <button type="button" id="ai-copilot-close" class="btn-secondary">Close</button>
      </header>
      <p class="small-note">Helping on: ${context.pageTitle}</p>
      <p class="small-note ai-copilot-health" id="ai-copilot-health">Copilot status: checking...</p>
      <div class="ai-copilot-feed" id="ai-copilot-feed"></div>
      <div class="ai-copilot-actions">
        <a class="open-link" href="${context.nextHref}">${context.nextLabel}</a>
        <a class="open-link" href="/ai-bot-funding.html">Open Live AI Account</a>
      </div>
      <div class="ai-copilot-quick-actions" id="ai-copilot-quick-actions">
        <button type="button" class="ai-copilot-quick-btn" data-copilot-prompt="Open AI live account setup guide">AI Setup Guide</button>
        <button type="button" class="ai-copilot-quick-btn" data-copilot-prompt="Open live AI account setup">Open Live AI Account</button>
        <button type="button" class="ai-copilot-quick-btn" data-copilot-prompt="Open stock scanner and outlook tools">Stock Tools</button>
        <button type="button" class="ai-copilot-quick-btn" data-copilot-prompt="Open broker connection setup">Broker Connect</button>
        <button type="button" class="ai-copilot-quick-btn" data-copilot-prompt="Open checkout page">Checkout</button>
      </div>
      <form id="ai-copilot-form" class="ai-copilot-form" novalidate>
        <label for="ai-copilot-input" class="small-note">Ask for help</label>
        <input id="ai-copilot-input" type="text" maxlength="220" placeholder="What should I do next?" />
        <button type="submit">Ask Copilot</button>
      </form>
      <button type="button" id="ai-copilot-report-toggle" class="btn-secondary ai-copilot-report-toggle">Report an issue</button>
      <form id="ai-copilot-report-form" class="ai-copilot-report-form" hidden novalidate>
        <label for="ai-copilot-report-category" class="small-note">Issue category</label>
        <select id="ai-copilot-report-category">
          <option value="bug">Bug / button not working</option>
          <option value="login">Login / session</option>
          <option value="navigation">Navigation confusion</option>
          <option value="ai-copilot">AI Copilot helper</option>
          <option value="billing">Billing / checkout</option>
          <option value="trading">AI trading / broker flow</option>
          <option value="other">Other</option>
        </select>
        <label for="ai-copilot-report-message" class="small-note">What happened?</label>
        <textarea id="ai-copilot-report-message" maxlength="1400" rows="4" placeholder="Describe exactly what did not work."></textarea>
        <label for="ai-copilot-report-contact" class="small-note">Contact email (optional)</label>
        <input id="ai-copilot-report-contact" type="email" maxlength="254" placeholder="name@email.com" />
        <button type="submit">Submit complaint ticket</button>
      </form>
    </section>
  `;
  document.body.appendChild(shell);

  const fab = document.getElementById('ai-copilot-fab');
  const panel = document.getElementById('ai-copilot-panel');
  const closeButton = document.getElementById('ai-copilot-close');
  const form = document.getElementById('ai-copilot-form');
  const input = document.getElementById('ai-copilot-input');
  const feed = document.getElementById('ai-copilot-feed');
  const health = document.getElementById('ai-copilot-health');
  const reportToggle = document.getElementById('ai-copilot-report-toggle');
  const reportForm = document.getElementById('ai-copilot-report-form');
  const reportCategory = document.getElementById('ai-copilot-report-category');
  const reportMessage = document.getElementById('ai-copilot-report-message');
  const reportContact = document.getElementById('ai-copilot-report-contact');
  const quickActions = document.getElementById('ai-copilot-quick-actions');

  if (!fab || !panel || !closeButton || !form || !input || !feed || !health || !reportToggle || !reportForm || !reportCategory || !reportMessage || !reportContact) {
    return;
  }

  const appendMessage = (role, message) => {
    const row = document.createElement('p');
    row.className = role === 'assistant' ? 'ai-copilot-msg ai-copilot-msg--assistant' : 'ai-copilot-msg ai-copilot-msg--user';
    row.textContent = message;
    feed.appendChild(row);
    feed.scrollTop = feed.scrollHeight;
  };

  const appendRouteLink = (route) => {
    if (!route || !route.href || !route.label) {
      return;
    }
    const row = document.createElement('div');
    row.className = 'ai-copilot-msg ai-copilot-msg--assistant ai-copilot-msg--action';
    const link = document.createElement('a');
    link.className = 'open-link ai-copilot-action-link';
    link.href = route.href;
    link.textContent = `Go to ${route.label}`;
    row.appendChild(link);
    feed.appendChild(row);
    feed.scrollTop = feed.scrollHeight;
  };

  const maybeRedirectToRoute = (route) => {
    if (!route || !route.wantsRedirect) {
      return;
    }
    setTimeout(() => {
      window.location.assign(route.href);
    }, 250);
  };

  const handleQuestion = (question) => {
    const normalizedQuestion = String(question || '').trim();
    if (!normalizedQuestion) {
      return;
    }
    appendMessage('user', normalizedQuestion);
    if (normalizedQuestion.toLowerCase().includes('check complaint status')) {
      const ticketId = getLastComplaintTicketId();
      if (!ticketId) {
        appendMessage('assistant', 'No complaint ticket found yet. Use "Report an issue" to create one.');
        return;
      }
      appendMessage('assistant', `Checking complaint ticket ${ticketId}...`);
      fetchComplaintTicketStatus(ticketId)
        .then((payload) => {
          const complaint = payload?.complaint || {};
          const currentStatus = statusLabel(complaint.status);
          appendMessage('assistant', `Ticket ${ticketId} status: ${currentStatus}.`);
        })
        .catch(() => {
          appendMessage('assistant', 'Could not load ticket status right now. Please try again in a moment.');
        });
      return;
    }
    const reply = buildCopilotReply(normalizedQuestion, context, pathname);
    appendMessage('assistant', reply.message);
    if (reply.route) {
      appendRouteLink(reply.route);
      maybeRedirectToRoute(reply.route);
    }
  };

  context.starterTips.forEach((tip, index) => {
    appendMessage('assistant', index === 0 ? `Hi, I can help here. ${tip}` : tip);
  });
  const liveAutoHintPages = new Set(['/ai-bot-trader.html', '/ai-bot-funding.html', '/ai-bot-account.html', '/brokerage-onboarding.html']);
  if (liveAutoHintPages.has(pathname)) {
    appendMessage('assistant', 'To make AI trade for you: turn on "hands-free live execution", connect broker bridge, run the bridge test, and keep live funding mode active.');
  }
  const lastTicketId = getLastComplaintTicketId();
  if (lastTicketId) {
    appendMessage('assistant', `Your last complaint ticket is ${lastTicketId}. Ask "check complaint status" to check progress.`);
  }

  const setHealth = (label, statusClass) => {
    health.textContent = label;
    health.classList.remove('ai-copilot-health--ok', 'ai-copilot-health--error');
    if (statusClass) {
      health.classList.add(statusClass);
    }
  };

  const runHealthCheck = async () => {
    try {
      const response = await fetch('/health', { cache: 'no-store' });
      if (response.ok) {
        setHealth('Copilot status: online and ready.', 'ai-copilot-health--ok');
      } else {
        setHealth('Copilot status: API warning. Reporting still available.', 'ai-copilot-health--error');
      }
    } catch (_error) {
      setHealth('Copilot status: network issue detected.', 'ai-copilot-health--error');
    }
  };
  runHealthCheck();

  const openPanel = () => {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    setTimeout(() => input.focus(), 0);
  };
  const closePanel = () => {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
  };

  fab.addEventListener('click', () => {
    if (panel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  });
  closeButton.addEventListener('click', closePanel);

  document.addEventListener('pointerdown', (event) => {
    if (panel.hidden) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && shell.contains(target)) {
      return;
    }
    closePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      closePanel();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = String(input.value || '').trim();
    if (!question) {
      return;
    }
    handleQuestion(question);
    input.value = '';
  });

  if (quickActions) {
    quickActions.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const button = target.closest('button[data-copilot-prompt]');
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const prompt = String(button.dataset.copilotPrompt || '').trim();
      if (!prompt) {
        return;
      }
      handleQuestion(prompt);
    });
  }

  reportToggle.addEventListener('click', () => {
    const opening = reportForm.hidden;
    reportForm.hidden = !opening;
    reportToggle.textContent = opening ? 'Hide issue form' : 'Report an issue';
    if (opening) {
      setTimeout(() => reportMessage.focus(), 0);
    }
  });

  reportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const category = String(reportCategory.value || 'other').trim().toLowerCase();
    const message = String(reportMessage.value || '').trim();
    const contactEmail = String(reportContact.value || '').trim();
    if (message.length < 8) {
      appendMessage('assistant', 'Please include a little more detail so we can reproduce and fix the issue.');
      return;
    }
    reportToggle.disabled = true;
    try {
      const payload = await submitCopilotComplaint({
        category,
        message,
        contactEmail,
        pagePath: pathname,
        pageTitle: context.pageTitle,
        userAgent: navigator?.userAgent || ''
      });
      const ticketId = String(payload?.complaint?.ticketId || '').trim();
      if (ticketId) {
        setLastComplaintTicketId(ticketId);
      }
      appendMessage('assistant', ticketId
        ? `Complaint submitted. Ticket ID: ${ticketId}. We can now track this and fix it.`
        : 'Complaint submitted successfully.');
      reportForm.reset();
      reportForm.hidden = true;
      reportToggle.textContent = 'Report an issue';
    } catch (error) {
      appendMessage('assistant', String(error?.message || 'Could not submit complaint. Please retry.'));
    } finally {
      reportToggle.disabled = false;
    }
  });
}

function initAiCopilotWidget() {
  mountAiQuickNav();
  mountAiCopilotWidget();
}

window.dumbdollarsAiCopilot = window.dumbdollarsAiCopilot || {};
window.dumbdollarsAiCopilot.openAndGuide = function openAndGuide(question) {
  const fab = document.getElementById('ai-copilot-fab');
  const panel = document.getElementById('ai-copilot-panel');
  const form = document.getElementById('ai-copilot-form');
  const input = document.getElementById('ai-copilot-input');
  if (!(fab instanceof HTMLButtonElement) || !panel || !(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) {
    return false;
  }
  if (panel.hidden) {
    fab.click();
  }
  const prompt = String(question || '').trim();
  if (!prompt) {
    return true;
  }
  input.value = prompt;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return true;
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAiCopilotWidget);
} else {
  initAiCopilotWidget();
}
