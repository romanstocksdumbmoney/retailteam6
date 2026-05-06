async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let body = {};
    try {
      body = await response.json();
    } catch (_error) {
      body = { message: `Request failed (${response.status})` };
    }
    throw new Error(String(body.message || 'Request failed.'));
  }
  return response.json();
}

function query(name) {
  return String(new URLSearchParams(window.location.search).get(name) || '').trim();
}

function setStatus(message, isError = false) {
  const node = document.getElementById('unsubscribe-status');
  if (!node) {
    return;
  }
  node.textContent = String(message || '');
  node.className = isError ? 'small-note auth-error' : 'small-note auth-ok';
}

function getPayload(scopeOverride) {
  const scope = String(scopeOverride || query('scope') || 'cancel').trim().toLowerCase();
  const type = String(query('type') || '').trim().toLowerCase();
  const uid = String(query('uid') || '').trim();
  return { scope, type, userId: uid };
}

async function submit(scopeOverride) {
  const payload = getPayload(scopeOverride);
  if (!payload.userId) {
    setStatus('Missing unsubscribe user ID in the link.', true);
    return;
  }
  try {
    const result = await fetchJson('/api/auth/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setStatus(result?.message || 'Your preferences were updated.');
  } catch (error) {
    setStatus(error.message || 'Could not update unsubscribe settings.', true);
  }
}

function setupButtons() {
  const oneButton = document.getElementById('unsubscribe-type-btn');
  const allButton = document.getElementById('unsubscribe-all-btn');
  const cancelButton = document.getElementById('unsubscribe-cancel-btn');
  if (oneButton instanceof HTMLButtonElement) {
    oneButton.addEventListener('click', () => submit('type'));
  }
  if (allButton instanceof HTMLButtonElement) {
    allButton.addEventListener('click', () => submit('all'));
  }
  if (cancelButton instanceof HTMLButtonElement) {
    cancelButton.addEventListener('click', () => {
      window.location.href = '/';
    });
  }
}

function init() {
  setupButtons();
}

init();
