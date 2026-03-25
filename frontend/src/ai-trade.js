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
}

function setupAiTradeForm() {
  const form = document.getElementById('ai-trade-form');
  const imageInput = document.getElementById('ai-trade-image');
  if (!form || !imageInput) {
    return;
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

      const token = localStorage.getItem('dumbdollars_token') || '';
      if (!token) {
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

setupAiTradeForm();
