function initSettingsBrokerPage() {
  const mount = document.getElementById('broker-settings-page-root');
  if (!mount || typeof window.mountBrokerConnectExperience !== 'function') {
    return;
  }
  const searchParams = new URLSearchParams(window.location.search || '');
  const rotate = searchParams.get('rotate') === '1' || searchParams.get('action') === 'rotate';
  window.mountBrokerConnectExperience(mount, {
    mode: 'page',
    rotate,
    onSaved: () => {
      window.location.href = '/ai-bot-trader.html';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettingsBrokerPage);
} else {
  initSettingsBrokerPage();
}
