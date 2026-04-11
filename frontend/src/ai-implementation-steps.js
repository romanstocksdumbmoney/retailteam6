function setupActions() {
  const toBrokerButton = document.getElementById('open-brokerage-from-steps');
  const toAiTradeButton = document.getElementById('open-ai-trade-from-steps');
  const toAiBotButton = document.getElementById('open-ai-bot-from-steps');
  const toAiAccountViewButton = document.getElementById('open-ai-account-view-from-steps');
  const toDirectFlowButton = document.getElementById('open-direct-broker-flow-from-steps');
  if (toBrokerButton) {
    toBrokerButton.addEventListener('click', () => {
      window.location.href = '/brokerage-onboarding.html';
    });
  }
  if (toAiTradeButton) {
    toAiTradeButton.addEventListener('click', () => {
      window.location.href = '/ai-trade-access.html?next=%2Fai-trade.html';
    });
  }
  if (toAiBotButton) {
    toAiBotButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-trader.html';
    });
  }
  if (toAiAccountViewButton) {
    toAiAccountViewButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-account.html';
    });
  }
  if (toDirectFlowButton) {
    toDirectFlowButton.addEventListener('click', () => {
      window.location.href = '/ai-broker-direct-setup.html?entry=implementation-guide';
    });
  }
}

function init() {
  setupActions();
}

init();
