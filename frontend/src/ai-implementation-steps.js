function setupActions() {
  const toBrokerButton = document.getElementById('open-brokerage-from-steps');
  const toAiTradeButton = document.getElementById('open-ai-trade-from-steps');
  const toAiBotButton = document.getElementById('open-ai-bot-from-steps');
  const toAiAccountViewButton = document.getElementById('open-ai-account-view-from-steps');
  const toDirectFlowButton = document.getElementById('open-direct-broker-flow-from-steps');
  const quickEasySetupButton = document.getElementById('open-easy-setup-from-steps');
  const quickAiGuideButton = document.getElementById('open-easy-guide-ai-from-steps');
  const quickBrokerButton = document.getElementById('open-broker-quick-from-steps');
  const statusNode = document.getElementById('ai-implementation-steps-status');
  const setStatus = (text) => {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = text;
  };
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
  if (quickEasySetupButton) {
    quickEasySetupButton.addEventListener('click', () => {
      setStatus('Opening Easy AI Setup...');
      window.location.href = '/ai-simple-setup.html?entry=implementation-guide';
    });
  }
  if (quickBrokerButton) {
    quickBrokerButton.addEventListener('click', () => {
      setStatus('Opening Broker Connect...');
      window.location.href = '/brokerage-onboarding.html';
    });
  }
  if (quickAiGuideButton) {
    quickAiGuideButton.addEventListener('click', () => {
      setStatus('Opening Easy Setup with AI guide...');
      window.location.href = '/ai-simple-setup.html?entry=implementation-guide&guide=1';
    });
  }
}

function init() {
  setupActions();
}

init();
