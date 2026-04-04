const STEPS = [
  {
    title: 'Step 1: Define the trading decision',
    details: [
      'Pick one decision the AI should make first (example: bullish vs bearish bias).',
      'Write down exactly what input it gets (ticker, timeframe, screenshot, risk limits).',
      'Define what output format is required (JSON fields and allowed values).'
    ]
  },
  {
    title: 'Step 2: Build a clean data input layer',
    details: [
      'Validate symbols and reject unknown tickers early.',
      'Normalize percentages so paired values sum to 100%.',
      'Store input snapshots for debugging before model calls.'
    ]
  },
  {
    title: 'Step 3: Add model inference with strict guardrails',
    details: [
      'Start with one model prompt template and fixed schema.',
      'Clamp numeric outputs to safe ranges (risk %, stop %, target %).',
      'Reject malformed responses and retry with fallback logic.'
    ]
  },
  {
    title: 'Step 4: Add risk management before execution',
    details: [
      'Cap risk per trade and max gross exposure.',
      'Require stop loss + take profit to be defined before order routing.',
      'Block live mode if account funding or compliance checks fail.'
    ]
  },
  {
    title: 'Step 5: Connect brokerage onboarding and account mode',
    details: [
      'Guide users to open a broker account first.',
      'Support paper mode and live mode as separate paths.',
      'Show a clear account view: cash, positions, equity, realized/unrealized PnL.'
    ]
  },
  {
    title: 'Step 6: Monitor, audit, and improve',
    details: [
      'Log every recommendation, execution result, and failure reason.',
      'Review win rate and drawdown by strategy profile.',
      'Iterate prompt + feature inputs using measured performance.'
    ]
  }
];

function renderSteps() {
  const target = document.getElementById('ai-implementation-steps-list');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  STEPS.forEach((step) => {
    const card = document.createElement('article');
    card.className = 'ai-trade-consensus';
    card.innerHTML = `
      <h3>${step.title}</h3>
      <ul class="detail-list">
        ${step.details.map((item) => `<li>${item}</li>`).join('')}
      </ul>
    `;
    target.appendChild(card);
  });
}

function setupActions() {
  const toBrokerButton = document.getElementById('open-broker-onboarding-from-steps');
  const toAiTradeButton = document.getElementById('open-ai-trade-from-steps');
  if (toBrokerButton) {
    toBrokerButton.addEventListener('click', () => {
      window.location.href = '/brokerage-onboarding.html';
    });
  }
  if (toAiTradeButton) {
    toAiTradeButton.addEventListener('click', () => {
      window.location.href = '/ai-trade-access.html';
    });
  }
}

function init() {
  renderSteps();
  setupActions();
}

init();
