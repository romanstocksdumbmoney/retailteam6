const BROKER_OPENING_LINKS = {
  robinhood: 'https://robinhood.com/us/en/support/articles/opening-an-account/',
  webull: 'https://www.webull.com/help/category/47-Open-an-account',
  'interactive-brokers': 'https://www.interactivebrokers.com/en/accounts/open_account_pro.php',
  tradestation: 'https://www.tradestation.com/open-an-account/',
  fidelity: 'https://www.fidelity.com/open-account/all-accounts',
  schwab: 'https://www.schwab.com/open-an-account',
  etrade: 'https://us.etrade.com/what-we-offer/our-accounts'
};

function setStatus(text, isError = false) {
  const node = document.getElementById('brokerage-onboarding-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function getSelectedBroker() {
  const select = document.getElementById('brokerage-picker-select');
  if (!(select instanceof HTMLSelectElement)) {
    return 'robinhood';
  }
  const broker = String(select.value || 'robinhood').trim().toLowerCase();
  return BROKER_OPENING_LINKS[broker] ? broker : 'robinhood';
}

function updateSelectedBrokerLink() {
  const broker = getSelectedBroker();
  const target = document.getElementById('brokerage-selection-summary');
  if (!target) {
    return;
  }
  const href = BROKER_OPENING_LINKS[broker];
  const label = broker.replace(/-/g, ' ').toUpperCase();
  target.innerHTML = `
    <h3>Selected Broker: ${label}</h3>
    <p class="small-note">Direct signup link:</p>
    <a id="brokerage-direct-link" class="open-link" href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>
  `;
}

function openBrokerSignup() {
  const broker = getSelectedBroker();
  const target = BROKER_OPENING_LINKS[broker];
  if (!target) {
    setStatus('Could not find broker onboarding link.', true);
    return;
  }
  localStorage.setItem('dumbdollars_selected_broker', broker);
  setStatus('Opening broker account signup in a new tab...');
  window.open(target, '_blank', 'noopener,noreferrer');
}

function setupForm() {
  const form = document.getElementById('brokerage-picker-form');
  const select = document.getElementById('brokerage-picker-select');
  const openButton = document.getElementById('brokerage-open-account');
  const copyButton = document.getElementById('brokerage-copy-link');
  const continueButton = document.getElementById('brokerage-go-funding');
  if (!(select instanceof HTMLSelectElement) || !(openButton instanceof HTMLButtonElement)) {
    return;
  }
  const rememberedBroker = String(localStorage.getItem('dumbdollars_selected_broker') || '').trim().toLowerCase();
  if (rememberedBroker && BROKER_OPENING_LINKS[rememberedBroker]) {
    select.value = rememberedBroker;
  }
  updateSelectedBrokerLink();
  select.addEventListener('change', () => {
    updateSelectedBrokerLink();
  });
  if (form instanceof HTMLFormElement) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      openBrokerSignup();
    });
  }
  if (copyButton instanceof HTMLButtonElement) {
    copyButton.addEventListener('click', async () => {
      const broker = getSelectedBroker();
      const targetLink = BROKER_OPENING_LINKS[broker];
      if (!targetLink) {
        setStatus('Could not copy broker signup link.', true);
        return;
      }
      try {
        await navigator.clipboard.writeText(targetLink);
        setStatus('Broker signup link copied.');
      } catch (_error) {
        setStatus('Copy failed. Please copy the link manually from below.', true);
      }
    });
  }
  openButton.addEventListener('click', () => {
    openBrokerSignup();
  });
  if (continueButton instanceof HTMLButtonElement) {
    continueButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-funding.html';
    });
  }
}

function init() {
  setupForm();
}

init();
