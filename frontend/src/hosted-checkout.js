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

function initHostedCheckout() {
  const form = document.getElementById('hosted-checkout-form');
  const submit = document.getElementById('hosted-submit');
  const cardInput = document.getElementById('hosted-card');
  const expInput = document.getElementById('hosted-exp');
  const cvcInput = document.getElementById('hosted-cvc');
  const zipInput = document.getElementById('hosted-zip');

  if (cardInput instanceof HTMLInputElement) {
    cardInput.placeholder = `Card number • ${parsePlanPrice()}`;
    cardInput.addEventListener('input', () => {
      const digits = cardInput.value.replace(/\D/g, '').slice(0, 19);
      cardInput.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
    });
  }
  if (expInput instanceof HTMLInputElement) {
    expInput.addEventListener('input', () => {
      const digits = expInput.value.replace(/\D/g, '').slice(0, 4);
      expInput.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    });
  }
  if (cvcInput instanceof HTMLInputElement) {
    cvcInput.addEventListener('input', () => {
      cvcInput.value = cvcInput.value.replace(/\D/g, '').slice(0, 4);
    });
  }
  if (zipInput instanceof HTMLInputElement) {
    zipInput.addEventListener('input', () => {
      zipInput.value = zipInput.value.replace(/[^a-zA-Z0-9 -]/g, '').slice(0, 10);
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
