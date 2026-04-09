function normalizePathname(pathname) {
  const raw = String(pathname || '/').trim() || '/';
  if (raw === '/index.html') {
    return '/';
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
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

function getCopilotResponse(input, context) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) {
    return 'Ask me what to do on this page, and I will guide you step-by-step.';
  }

  if (text.includes('next') || text.includes('what now') || text.includes('step')) {
    return `Next step: ${context.nextLabel}.`;
  }
  if (text.includes('sign up') || text.includes('signup') || text.includes('open account')) {
    return 'Account sign-up must be done by the user (identity/KYC). After sign-up, return here to connect broker permissions for AI execution.';
  }
  if (text.includes('risk') || text.includes('reward')) {
    return 'Use max risk per trade and min reward/risk ratio to filter weaker setups. Higher minimum reward/risk means fewer but cleaner proposals.';
  }
  if (text.includes('broker') || text.includes('connect')) {
    return 'For broker mode: save credentials, run bridge test, and clear pending setup steps. AI live automation should only be enabled after those checks pass.';
  }
  if (text.includes('paper') || text.includes('test')) {
    return 'Paper/Test mode is the safest first run. Tune risk and prompt quality there before enabling live execution.';
  }
  if (text.includes('pay') || text.includes('checkout') || text.includes('billing')) {
    return 'For billing: review payment details, continue to checkout, then return to dashboard after success. Use Manage Billing for subscription changes.';
  }
  if (text.includes('login') || text.includes('sign in') || text.includes('auth')) {
    return 'If sign-in fails, retry once, confirm email/password, or use social provider. Keep remember-login enabled for a smoother experience.';
  }
  if (text.includes('trade') || text.includes('execute') || text.includes('submit') || text.includes('auto')) {
    return 'In account view, run a cycle, review proposals, select trades, and submit. If hands-free mode is enabled, auto-submit can run after readiness checks.';
  }
  return 'I can help with setup, risk settings, broker connection, and next steps. Try asking: "what should I do next?"';
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
      AI Copilot
    </button>
    <section class="ai-copilot-panel" id="ai-copilot-panel" hidden aria-live="polite" aria-label="AI Copilot helper">
      <header class="ai-copilot-header">
        <strong>AI Copilot</strong>
        <button type="button" id="ai-copilot-close" class="btn-secondary">Close</button>
      </header>
      <p class="small-note">Helping on: ${context.pageTitle}</p>
      <div class="ai-copilot-feed" id="ai-copilot-feed"></div>
      <div class="ai-copilot-actions">
        <a class="open-link" href="${context.nextHref}">${context.nextLabel}</a>
      </div>
      <form id="ai-copilot-form" class="ai-copilot-form" novalidate>
        <label for="ai-copilot-input" class="small-note">Ask for help</label>
        <input id="ai-copilot-input" type="text" maxlength="220" placeholder="What should I do next?" />
        <button type="submit">Ask Copilot</button>
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

  if (!fab || !panel || !closeButton || !form || !input || !feed) {
    return;
  }

  const appendMessage = (role, message) => {
    const row = document.createElement('p');
    row.className = role === 'assistant' ? 'ai-copilot-msg ai-copilot-msg--assistant' : 'ai-copilot-msg ai-copilot-msg--user';
    row.textContent = message;
    feed.appendChild(row);
    feed.scrollTop = feed.scrollHeight;
  };

  context.starterTips.forEach((tip, index) => {
    appendMessage('assistant', index === 0 ? `Hi, I can help here. ${tip}` : tip);
  });
  const liveAutoHintPages = new Set(['/ai-bot-trader.html', '/ai-bot-funding.html', '/ai-bot-account.html', '/brokerage-onboarding.html']);
  if (liveAutoHintPages.has(pathname)) {
    appendMessage('assistant', 'To make AI trade for you: turn on "hands-free live execution", connect broker bridge, run the bridge test, and keep live funding mode active.');
  }

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

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = String(input.value || '').trim();
    if (!question) {
      return;
    }
    appendMessage('user', question);
    appendMessage('assistant', getCopilotResponse(question, context));
    input.value = '';
  });
}

function initAiCopilotWidget() {
  mountAiQuickNav();
  mountAiCopilotWidget();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAiCopilotWidget);
} else {
  initAiCopilotWidget();
}
