function parsePlanPrice() {
  return '$15.00 / month';
}

function getAuthHeaders() {
  const token = localStorage.getItem('dumbdollars_token') || '';
  if (!token) {
    return {};
  }
  return {
    authorization: `Bearer ${token}`
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch (_error) {
      body = { message: 'Unknown API error' };
    }
    const error = new Error(body.message || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      submit.disabled = true;
      const name = String(document.getElementById('hosted-name')?.value || '').trim();
      const card = String(cardInput?.value || '').trim();
      const exp = String(expInput?.value || '').trim();
      const cvc = String(cvcInput?.value || '').trim();
      const zip = String(zipInput?.value || '').trim();
      if (!name || !card || !exp || !cvc || !zip) {
        throw new Error('Complete all payment fields before continuing.');
      }
      setStatus('Processing secure payment...');
      const payload = await fetchJson('/api/auth/hosted-checkout/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          cardholderName: name,
          cardNumber: card,
          exp,
          cvc,
          zip
        })
      });
      if (payload?.token) {
        localStorage.setItem('dumbdollars_token', payload.token);
      }
      setStatus('Payment approved. Your Pro access is now active.');
      submit.textContent = 'Payment Completed';
    } catch (error) {
      setStatus(error.message || 'Could not complete payment.', true);
      submit.disabled = false;
    }
  });
}

initHostedCheckout();
