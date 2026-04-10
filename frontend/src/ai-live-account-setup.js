function setStatus(text, isError = false) {
  const node = document.getElementById('ai-live-setup-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function setupActions() {
  const startButton = document.getElementById('ai-live-setup-start');
  const fundingButton = document.getElementById('ai-live-setup-open-funding');
  const brokerButton = document.getElementById('ai-live-setup-open-broker');
  const accountButton = document.getElementById('ai-live-setup-open-account');
  const openIbApiButton = document.getElementById('ai-live-open-ib-api');
  const openIbBridgeButton = document.getElementById('ai-live-open-ib-bridge');
  const openRobinhoodApiButton = document.getElementById('ai-live-open-robinhood-api');
  const openRobinhoodBridgeButton = document.getElementById('ai-live-open-robinhood-bridge');
  const openTradestationApiButton = document.getElementById('ai-live-open-tradestation-api');
  const openTradestationBridgeButton = document.getElementById('ai-live-open-tradestation-bridge');

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
  if (openIbApiButton instanceof HTMLAnchorElement) {
    openIbApiButton.addEventListener('click', () => {
      setStatus('Opening Interactive Brokers account/API page...');
    });
  }
  if (openIbBridgeButton instanceof HTMLButtonElement) {
    openIbBridgeButton.addEventListener('click', () => {
      setStatus('Opening broker connect preselected for Interactive Brokers...');
      window.location.href = '/brokerage-onboarding.html?broker=interactive-brokers';
    });
  }
  if (openRobinhoodApiButton instanceof HTMLAnchorElement) {
    openRobinhoodApiButton.addEventListener('click', () => {
      setStatus('Opening Robinhood account page...');
    });
  }
  if (openRobinhoodBridgeButton instanceof HTMLButtonElement) {
    openRobinhoodBridgeButton.addEventListener('click', () => {
      setStatus('Opening broker connect preselected for Robinhood...');
      window.location.href = '/brokerage-onboarding.html?broker=robinhood';
    });
  }
  if (openTradestationApiButton instanceof HTMLAnchorElement) {
    openTradestationApiButton.addEventListener('click', () => {
      setStatus('Opening TradeStation account/API page...');
    });
  }
  if (openTradestationBridgeButton instanceof HTMLButtonElement) {
    openTradestationBridgeButton.addEventListener('click', () => {
      setStatus('Opening broker connect preselected for TradeStation...');
      window.location.href = '/brokerage-onboarding.html?broker=tradestation';
    });
  }
}

function init() {
  setupActions();
  setStatus('Use this checklist top-to-bottom to get AI trading on your account.');
}

init();
