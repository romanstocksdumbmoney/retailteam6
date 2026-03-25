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
  const node = document.getElementById('ai-analyzer-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error' : 'small-note';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read screenshot file.'));
    reader.readAsDataURL(file);
  });
}

function renderPreview(file) {
  const wrap = document.getElementById('ai-analyzer-preview-wrap');
  const target = document.getElementById('ai-analyzer-preview');
  if (!wrap || !target) {
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

function renderList(targetId, values, fallback) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }
  const items = Array.isArray(values) ? values : [];
  if (items.length === 0) {
    target.innerHTML = `<li>${fallback}</li>`;
    return;
  }
  target.innerHTML = items.map((line) => `<li>${line}</li>`).join('');
}

function renderModelReviews(reviews) {
  const target = document.getElementById('ai-analyzer-model-reviews');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  (reviews || []).forEach((review) => {
    const row = document.createElement('article');
    row.className = `ai-trade-vote ai-trade-vote--${review.verdict === 'good' ? 'up' : 'down'}`;
    row.innerHTML = `
      <h4>${review.model}</h4>
      <p><strong>${review.verdict.toUpperCase()}</strong> • ${review.score}/100</p>
      <p class="small-note">${review.review}</p>
    `;
    target.appendChild(row);
  });
  if (!reviews || reviews.length === 0) {
    target.innerHTML = '<div class="pro-lock">No model review data available.</div>';
  }
}

function renderPatterns(patterns) {
  const target = document.getElementById('ai-analyzer-patterns');
  if (!target) {
    return;
  }
  target.innerHTML = '';
  const rows = Array.isArray(patterns) ? patterns : [];
  rows.forEach((pattern) => {
    const row = document.createElement('article');
    row.className = `ai-trade-vote ai-trade-vote--${pattern.bias === 'bullish' ? 'up' : 'down'}`;
    row.innerHTML = `
      <h4>${pattern.name}</h4>
      <p><strong>${String(pattern.bias || '').toUpperCase()}</strong> • ${Number(pattern.confidencePct || 0)}% confidence</p>
      <p class="small-note">${pattern.status || ''}</p>
      <p class="small-note">${pattern.summary || ''}</p>
    `;
    target.appendChild(row);
  });
  if (!rows.length) {
    target.innerHTML = '<div class="pro-lock">No active patterns detected right now.</div>';
  }
}

function renderResult(payload) {
  const resultsSection = document.getElementById('ai-analyzer-results');
  const summary = document.getElementById('ai-analyzer-summary');
  const scoreBreakdown = document.getElementById('ai-analyzer-score-breakdown');
  if (!resultsSection || !summary || !scoreBreakdown) {
    return;
  }

  const verdictClass = payload.verdict === 'good_trade' ? 'up' : 'down';
  summary.innerHTML = `
    <article class="ai-trade-consensus ai-trade-consensus--${verdictClass}">
      <h3>${payload.ticker} • ${payload.verdictLabel} (${payload.qualityScore}/100)</h3>
      <p><strong>Direction:</strong> ${String(payload.direction || '').toUpperCase()} • <strong>Timeframe:</strong> ${payload.timeframe}</p>
      <p><strong>Entry:</strong> ${fmtUsd(payload.entryPrice)}${payload.exitPrice ? ` • <strong>Exit:</strong> ${fmtUsd(payload.exitPrice)}` : ''}</p>
      <p><strong>Realized move:</strong> ${payload.realizedMovePct == null ? 'N/A' : fmtPct(payload.realizedMovePct)}</p>
      <p class="small-note">Screenshot: ${payload.image?.name || 'uploaded image'} • ${Number(payload.image?.sizeBytes || 0).toLocaleString()} bytes</p>
    </article>
  `;

  scoreBreakdown.innerHTML = `
    <li>Structure: ${payload.subscores?.structure ?? 0}/100</li>
    <li>Risk: ${payload.subscores?.risk ?? 0}/100</li>
    <li>Timing: ${payload.subscores?.timing ?? 0}/100</li>
    <li>Realized: ${payload.subscores?.realized ?? 0}/100</li>
  `;

  renderPatterns(payload.possiblePatterns || []);
  renderModelReviews(payload.modelReviews || []);
  renderList('ai-analyzer-strengths', payload.strengths, 'No strengths captured.');
  renderList('ai-analyzer-risks', payload.risks, 'No risk notes captured.');
  renderList('ai-analyzer-improvements', payload.improvements, 'No improvement notes captured.');

  resultsSection.classList.remove('hidden');
}

function setupAiAnalyzerForm() {
  const form = document.getElementById('ai-analyzer-form');
  const imageInput = document.getElementById('ai-analyzer-image');
  if (!form || !imageInput) {
    return;
  }

  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) {
      return;
    }
    renderPreview(file);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = document.getElementById('ai-analyzer-submit');
    try {
      const file = imageInput.files?.[0];
      if (!file) {
        throw new Error('Please upload a screenshot first.');
      }

      const token = localStorage.getItem('dumbdollars_token') || '';
      if (!token) {
        throw new Error('Please log in to use AI Analyzer.');
      }

      const symbol = String(document.getElementById('ai-analyzer-symbol')?.value || '').trim().toUpperCase() || 'SPY';
      const timeframe = String(document.getElementById('ai-analyzer-timeframe')?.value || 'intraday').trim().toLowerCase();
      const direction = String(document.getElementById('ai-analyzer-direction')?.value || 'long').trim().toLowerCase();
      const entryPrice = Number(document.getElementById('ai-analyzer-entry')?.value || 0);
      const exitPrice = Number(document.getElementById('ai-analyzer-exit')?.value || 0);
      const imageDataUrl = await fileToDataUrl(file);

      if (submitButton) {
        submitButton.disabled = true;
      }
      setStatus('Running AI Analyzer on your screenshot...');

      const payload = await fetchJson('/api/market/ai-analyzer/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          symbol,
          timeframe,
          direction,
          entryPrice,
          exitPrice,
          imageDataUrl,
          imageName: file.name,
          imageSize: file.size
        })
      });

      renderResult(payload);
      setStatus('AI Analyzer review complete.');
    } catch (error) {
      setStatus(error.message || 'AI Analyzer failed.', true);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

setupAiAnalyzerForm();
