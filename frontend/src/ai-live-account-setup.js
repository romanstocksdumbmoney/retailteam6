function setStatus(text, isError = false) {
  const node = document.getElementById('ai-live-setup-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function openBrokerConnectWithBroker(broker) {
  const normalized = String(broker || '').trim().toLowerCase();
  if (!normalized) {
    window.location.href = '/brokerage-onboarding.html';
    return;
  }
  window.location.href = `/brokerage-onboarding.html?broker=${encodeURIComponent(normalized)}&autostart=1&from=live-setup`;
}

function setupActions() {
  const startButton = document.getElementById('ai-live-setup-start');
  const fundingButton = document.getElementById('ai-live-setup-open-funding');
  const brokerButton = document.getElementById('ai-live-setup-open-broker');
  const accountButton = document.getElementById('ai-live-setup-open-account');
  const directBrokerButton = document.getElementById('ai-live-setup-direct-broker');
  const openIbBridgeButton = document.getElementById('ai-live-open-broker-ibkr');
  const openRobinhoodBridgeButton = document.getElementById('ai-live-open-broker-robinhood');
  const openTradestationBridgeButton = document.getElementById('ai-live-open-broker-tradestation');

  if (startButton instanceof HTMLButtonElement) {
    startButton.addEventListener('click', () => {
      setStatus('Opening AI bot setup first...');
      window.location.href = '/ai-bot-trader.html';
    });
  }
  if (fundingButton instanceof HTMLButtonElement) {
    fundingButton.addEventListener('click', () => {
      setStatus('Opening funding + live mode setup...');
      window.location.href = '/ai-bot-funding.html';
    });
  }
  if (brokerButton instanceof HTMLButtonElement) {
    brokerButton.addEventListener('click', () => {
      setStatus('Opening broker connection checklist...');
      window.location.href = '/brokerage-onboarding.html';
    });
  }
  if (accountButton instanceof HTMLButtonElement) {
    accountButton.addEventListener('click', () => {
      setStatus('Opening AI account execution view...');
      window.location.href = '/ai-bot-account.html';
    });
  }
  if (directBrokerButton instanceof HTMLButtonElement) {
    directBrokerButton.addEventListener('click', () => {
      setStatus('Opening direct broker signup + AI auto setup...');
      window.location.href = '/ai-broker-direct-setup.html';
    });
  }
  if (openIbBridgeButton instanceof HTMLButtonElement) {
    openIbBridgeButton.addEventListener('click', () => {
      setStatus('Opening broker connect preselected for Interactive Brokers...');
      openBrokerConnectWithBroker('interactive-brokers');
    });
  }
  if (openRobinhoodBridgeButton instanceof HTMLButtonElement) {
    openRobinhoodBridgeButton.addEventListener('click', () => {
      setStatus('Opening broker connect preselected for Robinhood...');
      openBrokerConnectWithBroker('robinhood');
    });
  }
  if (openTradestationBridgeButton instanceof HTMLButtonElement) {
    openTradestationBridgeButton.addEventListener('click', () => {
      setStatus('Opening broker connect preselected for TradeStation...');
      openBrokerConnectWithBroker('tradestation');
    });
  }
}

function init() {
  setupActions();
  setStatus('Use this checklist top-to-bottom to get AI trading on your account. For fastest flow, use Direct Broker Signup + Auto AI Setup.');
}

init();
