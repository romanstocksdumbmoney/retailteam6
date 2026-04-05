function setupActions() {
  const toBrokerButton = document.getElementById('open-brokerage-from-steps');
  const toAiTradeButton = document.getElementById('open-ai-trade-from-steps');
  const toAiBotButton = document.getElementById('open-ai-bot-from-steps');
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
  if (toAiBotButton) {
    toAiBotButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-trader.html';
    });
  }
}

function init() {
  setupActions();
}

init();
