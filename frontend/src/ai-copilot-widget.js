function getAiCopilotContext(pathname) {
  const baseContext = {
    pageTitle: 'AI Trading',
    nextHref: '/ai-bot-trader.html',
    nextLabel: 'Open AI Trader setup',
    starterTips: [
      'Use the quick-nav bar at the top to jump between setup, funding, and broker pages.',
      'You can ask things like: "what do I fill out here?" or "what is my next step?"',
      'Broker sign-up must be completed by the user due identity verification requirements.'
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
    }
  };

  return {
    ...baseContext,
    ...(contexts[pathname] || {})
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
  if (text.includes('trade') || text.includes('execute') || text.includes('submit')) {
    return 'In account view, run a cycle, review proposals, select trades, and submit. If hands-free mode is enabled, auto-submit can run after readiness checks.';
  }
  return 'I can help with setup, risk settings, broker connection, and next steps. Try asking: "what should I do next?"';
}

function buildQuickNav(pathname) {
  const links = [
    { href: '/ai-bot-trader.html', label: 'AI Setup' },
    { href: '/ai-bot-funding.html', label: 'Funding + Test' },
    { href: '/ai-bot-paper-connect.html', label: 'Paper Connect' },
    { href: '/ai-bot-account.html', label: 'Account View' },
    { href: '/brokerage-onboarding.html', label: 'Broker Connect' }
  ];
  if (pathname === '/ai-bot-funding-payment.html') {
    links.splice(2, 0, { href: '/ai-bot-funding-payment.html', label: 'Funding Payment' });
  }
  return links;
}

function mountAiQuickNav() {
  const card = document.querySelector('.ai-trade-page-card, .payment-page-card');
  if (!card) {
    return;
  }
  const pathname = window.location.pathname || '/';
  const nav = document.createElement('section');
  nav.className = 'ai-page-quick-nav';
  nav.setAttribute('aria-label', 'AI trading quick navigation');

  const links = buildQuickNav(pathname);
  nav.innerHTML = `
    <h3>Quick AI Navigation</h3>
    <div class="ai-page-quick-nav-links">
      ${links.map((link) => {
        const active = pathname === link.href;
        return `<a class="${active ? 'ai-page-quick-link ai-page-quick-link--active' : 'ai-page-quick-link'}" href="${link.href}">${link.label}</a>`;
      }).join('')}
    </div>
  `;

  const heading = card.querySelector('h1');
  if (heading && heading.parentElement === card) {
    heading.insertAdjacentElement('afterend', nav);
    return;
  }
  card.prepend(nav);
}

function mountAiCopilotWidget() {
  const pathname = window.location.pathname || '/';
  const context = getAiCopilotContext(pathname);

  const shell = document.createElement('div');
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
