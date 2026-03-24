function initProPage() {
  const startButton = document.getElementById('pro-page-start');
  if (!startButton) {
    return;
  }
  startButton.addEventListener('click', () => {
    window.location.href = '/payment.html';
  });
}

initProPage();
