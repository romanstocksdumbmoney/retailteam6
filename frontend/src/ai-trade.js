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

async function tryRestoreSession() {
  if (typeof window.restoreSessionIfNeeded === 'function') {
    const restored = await window.restoreSessionIfNeeded();
    if (typeof restored === 'string') {
      return restored;
    }
    return String(restored?.token || '').trim();
  }
  return '';
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

function setStatus(text, isError = false) {
  const node = document.getElementById('ai-trade-status');
  if (!node) {
    return;
  }
  if (typeof window.clearSignInCallout === 'function') {
    window.clearSignInCallout('ai-trade-status');
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function showSignInNeeded(message = 'Please log in to use AI Trade.') {
  const nextPath = `${window.location.pathname || '/ai-trade.html'}${window.location.search || ''}${window.location.hash || ''}`;
  if (typeof window.showSignInCallout === 'function') {
    window.showSignInCallout({
      statusElementId: 'ai-trade-status',
      message,
      nextPath,
      linkLabel: 'Sign in to continue'
    });
    return;
  }
  setStatus(message, true);
}

function setQueueStatus(text, isError = false) {
  const node = document.getElementById('ai-trade-queue-status');
  if (!node) {
    return;
  }
  if (typeof window.clearSignInCallout === 'function') {
    window.clearSignInCallout('ai-trade-queue-status');
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function getImageMimeType(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('image/')) {
    return type;
  }
  return 'image/png';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function renderPreview(file) {
  const wrap = document.getElementById('ai-trade-preview-wrap');
  const target = document.getElementById('ai-trade-preview');
  if (!target || !wrap) {
    return;
  }
  target.src = URL.createObjectURL(file);
  wrap.classList.remove('hidden');
}

function fmtUsd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function fmtPct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatShareCount(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 'N/A';
  }
  return Math.trunc(numeric).toLocaleString();
}

let latestAnalysis = null;

function renderVotes(votes) {
  const target = document.getElementById('ai-trade-votes');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  (votes || []).forEach((vote) => {
    const row = document.createElement('article');
    row.className = `ai-trade-vote ai-trade-vote--${vote.trend === 'bullish' ? 'up' : 'down'}`;
    row.innerHTML = `
      <h4>${vote.model}</h4>
      <p><strong>${vote.trend.toUpperCase()}</strong> • ${vote.confidencePct}% confidence</p>
      <p class="small-note">${vote.signal}</p>
    `;
    target.appendChild(row);
  });
  if (!votes || votes.length === 0) {
    target.innerHTML = '<div class="pro-lock">No model votes available.</div>';
  }
}

function renderResult(payload) {
  const resultsSection = document.getElementById('ai-trade-results');
  const summary = document.getElementById('ai-trade-summary');
  const rationale = document.getElementById('ai-trade-rationale');
  const riskControls = document.getElementById('ai-trade-risk-controls');
  if (!summary || !rationale || !riskControls || !resultsSection) {
    return;
  }

  const trend = payload.consensus?.trend || 'bullish';
  const confidence = Number(payload.consensus?.confidencePct || 0);
  summary.innerHTML = `
    <article class="ai-trade-consensus ai-trade-consensus--${trend === 'bullish' ? 'up' : 'down'}">
      <h3>${payload.ticker} • ${trend.toUpperCase()} consensus (${confidence}%)</h3>
      <p><strong>Timeframe:</strong> ${payload.timeframe}</p>
      <p><strong>Entry:</strong> ${fmtUsd(payload.consensus?.entryPrice)}</p>
      <p><strong>Stop loss:</strong> ${fmtUsd(payload.consensus?.stopLoss)}</p>
      <p><strong>Take profit:</strong> ${fmtUsd(payload.consensus?.takeProfit)}</p>
      <p><strong>Risk/Reward:</strong> ${payload.consensus?.riskRewardRatio || 'N/A'}x</p>
      <p class="small-note">Image: ${payload.image?.name || 'uploaded file'} • ${Number(payload.image?.sizeBytes || 0).toLocaleString()} bytes</p>
    </article>
  `;

  const rationaleLines = payload.consensus?.rationale || [];
  rationale.innerHTML = rationaleLines.map((line) => `<li>${line}</li>`).join('');
  if (!rationaleLines.length) {
    rationale.innerHTML = '<li>No rationale available.</li>';
  }

  const controls = payload.riskControls || [];
  riskControls.innerHTML = controls.map((line) => `<li>${line}</li>`).join('');
  if (!controls.length) {
    riskControls.innerHTML = '<li>No risk controls available.</li>';
  }

  renderVotes(payload.modelVotes || []);
  resultsSection.classList.remove('hidden');
  latestAnalysis = payload;
  setQueueStatus('AI setup ready. Send this setup to the live queue if you want the bot to use it.');
}

function setOrderSetupStatus(text, isError = false) {
  const node = document.getElementById('ai-order-setup-status');
  if (!node) {
    return;
  }
  if (typeof window.clearSignInCallout === 'function') {
    window.clearSignInCallout('ai-order-setup-status');
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function renderOrderSetupPreview(file) {
  const wrap = document.getElementById('ai-order-preview-wrap');
  const target = document.getElementById('ai-order-preview');
  if (!target || !wrap) {
    return;
  }
  target.src = URL.createObjectURL(file);
  wrap.classList.remove('hidden');
}

function renderOrderSetupResult(payload) {
  const results = document.getElementById('ai-order-setup-results');
  const summary = document.getElementById('ai-order-setup-summary');
  const levels = document.getElementById('ai-order-setup-levels');
  const steps = document.getElementById('ai-order-setup-steps');
  if (!results || !summary || !levels || !steps) {
    return;
  }
  const sideLabel = String(payload?.side || 'long').toUpperCase();
  const ticker = String(payload?.ticker || 'N/A');
  const guidance = String(payload?.aiGuidance || '').trim();
  const percentages = payload?.percentages || {};
  const orderLevels = payload?.levels || {};
  const tradeMath = payload?.tradeMath || {};
  summary.innerHTML = `
    <h3>${ticker} • ${sideLabel} order setup</h3>
    <p>${guidance}</p>
    <p class="small-note"><strong>Loss:</strong> ${fmtPct(percentages.lossPct)} • <strong>Gain:</strong> ${fmtPct(percentages.gainPct)} • <strong>Stop buffer:</strong> ${fmtPct(percentages.stopBufferPct || 0)}</p>
    <p class="small-note"><strong>Risk/Reward:</strong> ${(Number(tradeMath.riskRewardRatio || 0)).toFixed(2)}x</p>
  `;
  levels.innerHTML = `
    <article class="ai-order-level-card">
      <h4>Entry Limit</h4>
      <p>${fmtUsd(orderLevels.entryLimit)}</p>
    </article>
    <article class="ai-order-level-card">
      <h4>Stop Trigger</h4>
      <p>${fmtUsd(orderLevels.stopTrigger)}</p>
    </article>
    <article class="ai-order-level-card">
      <h4>Stop Limit</h4>
      <p>${fmtUsd(orderLevels.stopLimit)}</p>
    </article>
    <article class="ai-order-level-card">
      <h4>Take Profit Limit</h4>
      <p>${fmtUsd(orderLevels.takeProfitLimit)}</p>
    </article>
    <article class="ai-order-level-card">
      <h4>Risk / Share</h4>
      <p>${fmtUsd(tradeMath.riskPerShare)}</p>
    </article>
    <article class="ai-order-level-card">
      <h4>Reward / Share</h4>
      <p>${fmtUsd(tradeMath.rewardPerShare)}</p>
    </article>
    <article class="ai-order-level-card">
      <h4>Max Loss USD</h4>
      <p>${fmtUsd(tradeMath.maxLossUsd)}</p>
    </article>
    <article class="ai-order-level-card">
      <h4>Target Gain USD</h4>
      <p>${fmtUsd(tradeMath.targetGainUsd)}</p>
    </article>
    <article class="ai-order-level-card">
      <h4>Shares</h4>
      <p>${formatShareCount(tradeMath.shares)}</p>
    </article>
  `;
  const setupSteps = Array.isArray(payload?.setupSteps) ? payload.setupSteps : [];
  steps.innerHTML = setupSteps.map((step) => `<li>${step}</li>`).join('');
  if (!setupSteps.length) {
    steps.innerHTML = '<li>No setup steps returned.</li>';
  }
  results.classList.remove('hidden');
}

function setupOrderSetupAssistant() {
  const form = document.getElementById('ai-order-setup-form');
  const imageInput = document.getElementById('ai-order-image');
  if (!(form instanceof HTMLFormElement) || !(imageInput instanceof HTMLInputElement)) {
    return;
  }
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) {
      return;
    }
    if (!getImageMimeType(file).startsWith('image/')) {
      setOrderSetupStatus('Please upload a valid order screenshot image.', true);
      return;
    }
    renderOrderSetupPreview(file);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = document.getElementById('ai-order-setup-submit');
    try {
      const file = imageInput.files?.[0];
      if (!file) {
        throw new Error('Please upload an order screenshot first.');
      }
      let token = String(localStorage.getItem('dumbdollars_token') || '').trim();
      if (!token) {
        await tryRestoreSession();
        token = String(localStorage.getItem('dumbdollars_token') || '').trim();
      }
      if (!token) {
        showSignInNeeded('Please log in to use order setup assistant.');
        throw new Error('Please log in to use order setup assistant.');
      }
      const symbol = String(document.getElementById('ai-order-symbol')?.value || '').trim().toUpperCase() || 'SPY';
      const side = String(document.getElementById('ai-order-side')?.value || 'long').trim().toLowerCase();
      const entryPrice = Number(document.getElementById('ai-order-entry-price')?.value || 0);
      const lossPct = Number(document.getElementById('ai-order-loss-pct')?.value || 0);
      const gainPct = Number(document.getElementById('ai-order-gain-pct')?.value || 0);
      const stopBufferPct = Number(document.getElementById('ai-order-stop-buffer-pct')?.value || 0);
      const positionSize = Number(document.getElementById('ai-order-position-size')?.value || 0);
      const imageDataUrl = await fileToDataUrl(file);
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = true;
      }
      setOrderSetupStatus('Building exact limit + stop setup from your screenshot...');
      const payload = await fetchJson('/api/market/ai-trade/order-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          symbol,
          side,
          entryPrice,
          lossPct,
          gainPct,
          stopBufferPct,
          positionSize,
          imageDataUrl,
          imageName: file.name,
          imageSize: file.size
        })
      });
      const results = document.getElementById('ai-order-setup-results');
      if (results instanceof HTMLElement) {
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      renderOrderSetupResult(payload);
      setOrderSetupStatus('Order setup ready. Copy the exact numbers into your broker ticket.');
    } catch (error) {
      setOrderSetupStatus(error.message || 'Could not build order setup.', true);
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
      }
    }
  });
}

async function queueLatestAnalysisForLiveExecution() {
  const token = String(localStorage.getItem('dumbdollars_token') || '').trim();
  if (!token) {
    await tryRestoreSession();
  }
  if (!latestAnalysis) {
    throw new Error('Run an AI Trade analysis first.');
  }
  const consensus = latestAnalysis.consensus || {};
  const queued = await fetchJson('/api/market/auto-trader/queue-ai-trade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({
      symbol: latestAnalysis.ticker,
      timeframe: latestAnalysis.timeframe,
      trend: consensus.trend,
      confidencePct: Number(consensus.confidencePct || 0),
      entryPrice: Number(consensus.entryPrice || 0),
      stopLoss: Number(consensus.stopLoss || 0),
      takeProfit: Number(consensus.takeProfit || 0),
      rationale: Array.isArray(consensus.rationale) ? consensus.rationale : []
    })
  });
  return queued;
}

function setupAiTradeForm() {
  const form = document.getElementById('ai-trade-form');
  const imageInput = document.getElementById('ai-trade-image');
  if (!form || !imageInput) {
    return;
  }
  const queueButton = document.getElementById('ai-trade-queue-live');
  const openFundingButton = document.getElementById('ai-trade-open-funding');
  const openAccountButton = document.getElementById('ai-trade-open-account');

  if (queueButton) {
    queueButton.addEventListener('click', async () => {
      try {
        queueButton.disabled = true;
        setQueueStatus('Queueing AI setup for live execution...');
        const payload = await queueLatestAnalysisForLiveExecution();
        setQueueStatus(`Queued for live execution. Pending queue depth: ${Number(payload.queueDepth || 0)}.`);
      } catch (error) {
        setQueueStatus(error.message || 'Could not queue AI setup for live execution.', true);
      } finally {
        queueButton.disabled = false;
      }
    });
  }

  if (openFundingButton) {
    openFundingButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-funding.html';
    });
  }

  if (openAccountButton) {
    openAccountButton.addEventListener('click', () => {
      window.location.href = '/ai-bot-account.html';
    });
  }

  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) {
      return;
    }
    if (!getImageMimeType(file).startsWith('image/')) {
      setStatus('Please upload a valid image file.', true);
      return;
    }
    renderPreview(file);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = document.getElementById('ai-trade-submit');
    try {
      const file = imageInput.files?.[0];
      if (!file) {
        throw new Error('Please upload a chart image first.');
      }

      let token = localStorage.getItem('dumbdollars_token') || '';
      if (!token) {
        await tryRestoreSession();
        token = localStorage.getItem('dumbdollars_token') || '';
      }
      if (!token) {
        showSignInNeeded('Please log in to use AI Trade.');
        throw new Error('Please log in to use AI Trade.');
      }

      const symbolInput = String(document.getElementById('ai-trade-symbol')?.value || '').trim().toUpperCase();
      const symbol = symbolInput || 'SPY';
      const timeframe = String(document.getElementById('ai-trade-timeframe')?.value || 'intraday').trim().toLowerCase();
      const currentPrice = Number(document.getElementById('ai-trade-current-price')?.value || 0);
      const imageDataUrl = await fileToDataUrl(file);

      if (submitButton) {
        submitButton.disabled = true;
      }
      setStatus('Analyzing chart with multiple AI models...');

      const payload = await fetchJson('/api/market/ai-trade/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          symbol,
          timeframe,
          currentPrice,
          imageDataUrl,
          imageName: file.name,
          imageSize: file.size
        })
      });

      renderResult(payload);
      setStatus('AI Trade analysis complete.');
    } catch (error) {
      setStatus(error.message || 'AI Trade analysis failed.', true);
    } finally {
      const submitButton = document.getElementById('ai-trade-submit');
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

async function init() {
  if (!localStorage.getItem('dumbdollars_token')) {
    await tryRestoreSession();
  }
  if (!localStorage.getItem('dumbdollars_token')) {
    showSignInNeeded('Please log in to use AI Trade.');
    setOrderSetupStatus('Please log in to use order setup assistant.', true);
  }
  setupAiTradeForm();
  setupOrderSetupAssistant();
}

init().catch(() => {
  setupAiTradeForm();
  setupOrderSetupAssistant();
});
