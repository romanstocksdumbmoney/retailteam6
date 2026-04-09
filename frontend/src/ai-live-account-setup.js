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
}

function init() {
  setupActions();
  setStatus('Use this checklist top-to-bottom to get AI trading on your account.');
}

init();
