function parsePlanPrice() {
  return '$15.00 / month';
}

function setStatus(text, isError = false) {
  const statusNode = document.getElementById('hosted-checkout-status');
  if (!statusNode) {
    return;
  }
  statusNode.textContent = text;
  statusNode.className = isError ? 'small-note auth-error' : 'small-note';
}

function maskCardPreview(cardNumber) {
  const digits = String(cardNumber || '').replace(/\D/g, '');
  if (digits.length < 4) {
    return '****';
  }
  return `**** **** **** ${digits.slice(-4)}`;
}

function initHostedCheckout() {
  const form = document.getElementById('hosted-checkout-form');
  const submit = document.getElementById('hosted-pay-now');
  const priceLine = document.getElementById('hosted-checkout-plan');
  const cardPreview = document.getElementById('hosted-card-preview');
  const cardInput = document.getElementById('card-number');

  if (priceLine) {
    priceLine.textContent = `DumbDollars Pro — ${parsePlanPrice()}`;
  }

  if (cardInput && cardPreview) {
    cardInput.addEventListener('input', () => {
      cardPreview.textContent = maskCardPreview(cardInput.value);
    });
  }

  if (!form || !submit) {
    return;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.disabled = true;
    setStatus('Processing secure payment...');
    window.setTimeout(() => {
      setStatus('Payment approved. Your Pro access is now active.');
      submit.disabled = false;
      submit.textContent = 'Payment Completed';
    }, 1200);
  });
}

initHostedCheckout();
