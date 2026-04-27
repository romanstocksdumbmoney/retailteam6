const PREVIEW_LAB_STORAGE_KEY = 'dumbdollars_pro_preview_lab_v2';

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
    error.body = body;
    throw error;
  }
  return response.json();
}

function getAuthHeaders() {
  const token = String(localStorage.getItem('dumbdollars_token') || '').trim();
  if (!token) {
    return {};
  }
  return {
    authorization: `Bearer ${token}`
  };
}

function readPreviewState() {
  try {
    const raw = localStorage.getItem(PREVIEW_LAB_STORAGE_KEY);
    if (!raw) {
      return {
        alerts: [],
        watchlists: [],
        journal: []
      };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { alerts: [], watchlists: [], journal: [] };
    }
    return {
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      watchlists: Array.isArray(parsed.watchlists) ? parsed.watchlists : [],
      journal: Array.isArray(parsed.journal) ? parsed.journal : []
    };
  } catch (_error) {
    return {
      alerts: [],
      watchlists: [],
      journal: []
    };
  }
}

function savePreviewState(state) {
  localStorage.setItem(PREVIEW_LAB_STORAGE_KEY, JSON.stringify(state));
}

function setStatus(text, isError = false) {
  const node = document.getElementById('pro-preview-lab-status');
  if (!node) {
    return;
  }
  node.textContent = text;
  node.className = isError ? 'small-note auth-error preview-lab-status' : 'small-note preview-lab-status';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 10);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pseudoRandom(seed) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function renderAlerts(state) {
  const target = document.getElementById('preview-alerts-feed');
  if (!target) {
    return;
  }
  if (!state.alerts.length) {
    target.innerHTML = '<p class="preview-lab-empty">No preview alerts yet. Submit the form to create one.</p>';
    return;
  }
  target.innerHTML = state.alerts
    .slice(-6)
    .reverse()
    .map((alert) => `
      <article class="stack-item">
        <p><strong>${escapeHtml(alert.symbol)}</strong> • ${escapeHtml(alert.typeLabel)} • ${escapeHtml(alert.channelsLabel)}</p>
        <p class="small-note">Created ${escapeHtml(alert.createdAtLabel)} (preview only, no real notifications sent).</p>
      </article>
    `)
    .join('');
}

function buildBacktestPreviewValues(form) {
  const strategy = String(form.querySelector('#preview-backtest-strategy')?.value || 'trend-following');
  const window = String(form.querySelector('#preview-backtest-window')?.value || '6m');
  const universe = String(form.querySelector('#preview-backtest-universe')?.value || 'large-cap');
  const seed = strategy.length * 11 + window.length * 23 + universe.length * 17;
  const winRate = clamp(42 + pseudoRandom(seed) * 30, 35, 79);
  const expectancy = clamp(-0.1 + pseudoRandom(seed + 3) * 1.4, -0.2, 1.9);
  const drawdown = clamp(4 + pseudoRandom(seed + 7) * 18, 2, 32);
  const trades = Math.round(clamp(18 + pseudoRandom(seed + 13) * 120, 12, 160));
  return {
    strategy,
    window,
    universe,
    winRate,
    expectancy,
    drawdown,
    trades
  };
}

function renderBacktestResult(values) {
  const target = document.getElementById('preview-backtest-results');
  if (!target) {
    return;
  }
  if (!values) {
    target.innerHTML = '<p class="preview-lab-empty">Run preview backtest to see mock metrics.</p>';
    return;
  }
  target.innerHTML = `
    <article class="stack-item">
      <p><strong>Strategy:</strong> ${escapeHtml(values.strategy)} • <strong>Window:</strong> ${escapeHtml(values.window)} • <strong>Universe:</strong> ${escapeHtml(values.universe)}</p>
      <table class="preview-lab-table">
        <thead>
          <tr>
            <th>Win Rate</th>
            <th>Expectancy</th>
            <th>Max Drawdown</th>
            <th>Trades</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${values.winRate.toFixed(1)}%</td>
            <td>${values.expectancy.toFixed(2)}R</td>
            <td>${values.drawdown.toFixed(1)}%</td>
            <td>${values.trades}</td>
          </tr>
        </tbody>
      </table>
      <p class="small-note">Preview values are simulated for UI testing only.</p>
    </article>
  `;
}

function renderWatchlists(state) {
  const target = document.getElementById('preview-watchlists');
  if (!target) {
    return;
  }
  if (!state.watchlists.length) {
    target.innerHTML = '<p class="preview-lab-empty">No preview watchlists yet. Save one from the form above.</p>';
    return;
  }
  target.innerHTML = state.watchlists
    .slice(-5)
    .reverse()
    .map((watchlist) => `
      <article class="stack-item">
        <p><strong>${escapeHtml(watchlist.name)}</strong> • ${escapeHtml(watchlist.symbolsLabel)}</p>
        <p><strong>Rule:</strong> ${escapeHtml(watchlist.rule)}</p>
      </article>
    `)
    .join('');
}

function buildHeatmapRows() {
  const symbols = ['NVDA', 'AAPL', 'MSFT', 'META', 'TSLA', 'AMZN'];
  return symbols.map((symbol, index) => {
    const baseSeed = symbol.charCodeAt(0) + index * 29;
    const openScore = Math.round(40 + pseudoRandom(baseSeed + 1) * 58);
    const middayScore = Math.round(30 + pseudoRandom(baseSeed + 2) * 52);
    const powerScore = Math.round(35 + pseudoRandom(baseSeed + 3) * 60);
    const strongest = Math.max(openScore, middayScore, powerScore);
    const strongestLabel = strongest === openScore
      ? 'Open'
      : (strongest === middayScore ? 'Midday' : 'Power Hour');
    return {
      symbol,
      openScore,
      middayScore,
      powerScore,
      strongestLabel
    };
  });
}

function renderHeatmap() {
  const target = document.getElementById('preview-heatmap');
  if (!target) {
    return;
  }
  const rows = buildHeatmapRows();
  target.innerHTML = rows
    .map((row) => `
      <article class="preview-lab-card">
        <h3>${escapeHtml(row.symbol)}</h3>
        <div class="preview-lab-inline">
          <span class="preview-lab-chip">Open ${row.openScore}</span>
          <span class="preview-lab-chip">Midday ${row.middayScore}</span>
          <span class="preview-lab-chip">Power ${row.powerScore}</span>
        </div>
        <p class="small-note">Strongest session: <strong>${escapeHtml(row.strongestLabel)}</strong></p>
      </article>
    `)
    .join('');
}

function renderJournal(state) {
  const target = document.getElementById('preview-journal-entries');
  if (!target) {
    return;
  }
  if (!state.journal.length) {
    target.innerHTML = '<p class="preview-lab-empty">No journal entries yet. Add one to preview AI-style feedback.</p>';
    return;
  }
  target.innerHTML = state.journal
    .slice(-6)
    .reverse()
    .map((entry) => {
      const resultClass = entry.resultPct >= 0
        ? 'preview-lab-chip preview-lab-chip--good'
        : 'preview-lab-chip preview-lab-chip--risk';
      const coaching = entry.resultPct >= 0
        ? 'Good execution. Consider scaling winners in planned tiers.'
        : 'Reduce position size on similar setups and tighten invalidation rules.';
      return `
        <article class="stack-item">
          <p><strong>${escapeHtml(entry.symbol)}</strong> • ${escapeHtml(entry.sideLabel)} • <span class="${resultClass}">${entry.resultPct >= 0 ? '+' : ''}${entry.resultPct.toFixed(1)}%</span></p>
          <p class="small-note">${escapeHtml(entry.notes)}</p>
          <p class="small-note"><strong>AI coaching preview:</strong> ${escapeHtml(coaching)}</p>
        </article>
      `;
    })
    .join('');
}

function initAlertsForm(state) {
  const form = document.getElementById('preview-alerts-form');
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const type = String(document.getElementById('preview-alert-type')?.value || 'premium-spike');
    const symbol = normalizeSymbol(document.getElementById('preview-alert-symbol')?.value || 'NVDA') || 'NVDA';
    const channels = String(document.getElementById('preview-alert-channels')?.value || 'all');
    const typeLabelMap = {
      'premium-spike': 'Premium Spike',
      'iv-break': 'IV Break',
      'trend-flip': 'Trend Flip'
    };
    const channelsLabelMap = {
      'email': 'Email',
      'push': 'Push',
      'sms': 'SMS',
      'all': 'Email + Push + SMS'
    };
    state.alerts.push({
      type,
      symbol,
      channels,
      typeLabel: typeLabelMap[type] || 'Alert',
      channelsLabel: channelsLabelMap[channels] || 'Email',
      createdAt: Date.now(),
      createdAtLabel: new Date().toLocaleString()
    });
    state.alerts = state.alerts.slice(-30);
    savePreviewState(state);
    renderAlerts(state);
    setStatus('Preview alert created (open mode).');
  });
}

function initBacktestForm() {
  const form = document.getElementById('preview-backtest-form');
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = buildBacktestPreviewValues(form);
    renderBacktestResult(values);
    setStatus('Preview backtest complete (simulated metrics).');
  });
}

function initWatchlistForm(state) {
  const form = document.getElementById('preview-watchlist-form');
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = String(document.getElementById('preview-watchlist-name')?.value || '').trim() || 'Untitled Watchlist';
    const symbolsRaw = String(document.getElementById('preview-watchlist-symbols')?.value || '');
    const symbols = symbolsRaw
      .split(',')
      .map((part) => normalizeSymbol(part))
      .filter(Boolean)
      .slice(0, 20);
    const rule = String(document.getElementById('preview-watchlist-rule')?.value || '').trim() || 'No rule';
    state.watchlists.push({
      name,
      symbols,
      symbolsLabel: symbols.join(', ') || 'No symbols',
      rule,
      createdAt: Date.now()
    });
    state.watchlists = state.watchlists.slice(-20);
    savePreviewState(state);
    renderWatchlists(state);
    setStatus('Preview watchlist saved (open mode).');
  });
}

function initJournalForm(state) {
  const form = document.getElementById('preview-journal-form');
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const symbol = normalizeSymbol(document.getElementById('preview-journal-symbol')?.value || 'AAPL') || 'AAPL';
    const side = String(document.getElementById('preview-journal-side')?.value || 'long');
    const resultPct = clamp(Number(document.getElementById('preview-journal-result')?.value || 0), -99, 999);
    const notes = String(document.getElementById('preview-journal-notes')?.value || '').trim() || 'No notes';
    state.journal.push({
      symbol,
      side,
      sideLabel: side === 'short' ? 'Short' : 'Long',
      resultPct,
      notes,
      createdAt: Date.now()
    });
    state.journal = state.journal.slice(-40);
    savePreviewState(state);
    renderJournal(state);
    setStatus('Preview journal entry added (open mode).');
  });
}

function numberValue(input, fallback = 0) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function formatUsd(value) {
  return `$${numberValue(value, 0).toFixed(2)}`;
}

function formatPct(value) {
  return `${numberValue(value, 0).toFixed(2)}%`;
}

function getSymbolSeed(symbol, salt = 0) {
  const normalized = normalizeSymbol(symbol) || 'SPY';
  let seed = salt;
  for (let i = 0; i < normalized.length; i += 1) {
    seed += normalized.charCodeAt(i) * (i + 3);
  }
  return seed;
}

function initFlowRadarForm() {
  const form = document.getElementById('preview-flow-radar-form');
  const results = document.getElementById('preview-flow-radar-results');
  if (!(form instanceof HTMLFormElement) || !(results instanceof HTMLElement)) {
    return;
  }
  const renderEmpty = () => {
    results.innerHTML = '<p class="preview-lab-empty">Run Flow Radar to preview pressure, momentum, and risk posture.</p>';
  };
  renderEmpty();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const symbol = normalizeSymbol(document.getElementById('preview-flow-symbol')?.value || 'NVDA') || 'NVDA';
    const timeframe = String(document.getElementById('preview-flow-timeframe')?.value || 'intraday').trim().toLowerCase();
    const sensitivity = String(document.getElementById('preview-flow-sensitivity')?.value || 'balanced').trim().toLowerCase();
    const seed = getSymbolSeed(symbol, timeframe.length * 11 + sensitivity.length * 17);
    const flowPressure = Math.round(clamp(35 + pseudoRandom(seed + 1) * 60, 0, 100));
    const momentumScore = Math.round(clamp(30 + pseudoRandom(seed + 3) * 64, 0, 100));
    const volatilityScore = Math.round(clamp(24 + pseudoRandom(seed + 7) * 70, 0, 100));
    const sensitivityBias = sensitivity === 'aggressive' ? 8 : (sensitivity === 'defensive' ? -8 : 0);
    const combined = flowPressure * 0.45 + momentumScore * 0.35 - volatilityScore * 0.18 + sensitivityBias;
    const direction = combined >= 52 ? 'Bullish pressure' : combined <= 44 ? 'Bearish pressure' : 'Mixed / neutral';
    const confidence = Math.round(clamp(48 + pseudoRandom(seed + 9) * 42 + Math.abs(combined - 50) * 0.45, 35, 96));
    const suggestedStopPct = clamp(0.9 + (volatilityScore / 100) * 2.8, 0.8, 4.5);
    const suggestedTargetPct = suggestedStopPct * clamp(1.5 + pseudoRandom(seed + 13), 1.4, 2.7);
    const posture = sensitivity === 'defensive'
      ? 'Defensive size and tighter invalidation.'
      : sensitivity === 'aggressive'
        ? 'Aggressive size allowed only if setup confirms.'
        : 'Balanced size with normal risk cap.';
    results.innerHTML = `
      <article class="stack-item">
        <p><strong>${escapeHtml(symbol)}</strong> • ${escapeHtml(timeframe)} • ${escapeHtml(sensitivity)} sensitivity</p>
        <div class="preview-lab-inline">
          <span class="preview-lab-chip">Flow ${flowPressure}</span>
          <span class="preview-lab-chip">Momentum ${momentumScore}</span>
          <span class="preview-lab-chip">Volatility ${volatilityScore}</span>
          <span class="preview-lab-chip preview-lab-chip--warn">Confidence ${confidence}%</span>
        </div>
        <p><strong>Bias:</strong> ${escapeHtml(direction)}</p>
        <p class="small-note"><strong>Risk posture:</strong> ${escapeHtml(posture)}</p>
        <p class="small-note"><strong>Suggested stop:</strong> ${formatPct(suggestedStopPct)} • <strong>Suggested target:</strong> ${formatPct(suggestedTargetPct)}</p>
      </article>
    `;
    setStatus('Flow Radar preview generated.');
  });
}

function initEarningsPlannerForm() {
  const form = document.getElementById('preview-earnings-planner-form');
  const results = document.getElementById('preview-earnings-planner-results');
  if (!(form instanceof HTMLFormElement) || !(results instanceof HTMLElement)) {
    return;
  }
  results.innerHTML = '<p class="preview-lab-empty">Build an earnings plan to preview breakout/breakdown levels.</p>';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const symbol = normalizeSymbol(document.getElementById('preview-earnings-symbol')?.value || 'AAPL') || 'AAPL';
    const expectedMovePct = clamp(numberValue(document.getElementById('preview-earnings-move')?.value, 6.5), 1, 40);
    const bias = String(document.getElementById('preview-earnings-bias')?.value || 'neutral').trim().toLowerCase();
    const seed = getSymbolSeed(symbol, Math.round(expectedMovePct * 10));
    const reference = clamp(60 + pseudoRandom(seed + 2) * 250, 20, 800);
    const moveFraction = expectedMovePct / 100;
    const breakout = reference * (1 + moveFraction * 0.5);
    const breakdown = reference * (1 - moveFraction * 0.5);
    const targetUp = breakout * (1 + moveFraction * 0.65);
    const targetDown = breakdown * (1 - moveFraction * 0.65);
    const biasLine = bias === 'bullish'
      ? 'Lean long only if breakout holds and opening volume confirms.'
      : bias === 'bearish'
        ? 'Lean short only if breakdown holds and weak bounce fails.'
        : 'Stay two-sided until post-earnings direction is confirmed.';
    results.innerHTML = `
      <article class="stack-item">
        <p><strong>${escapeHtml(symbol)} earnings plan</strong> • expected move ${formatPct(expectedMovePct)}</p>
        <p class="small-note"><strong>Reference:</strong> ${formatUsd(reference)} • <strong>Breakout:</strong> ${formatUsd(breakout)} • <strong>Breakdown:</strong> ${formatUsd(breakdown)}</p>
        <p class="small-note"><strong>Upside target:</strong> ${formatUsd(targetUp)} • <strong>Downside target:</strong> ${formatUsd(targetDown)}</p>
        <p class="small-note"><strong>Bias plan:</strong> ${escapeHtml(biasLine)}</p>
      </article>
    `;
    setStatus('Earnings Reaction Planner preview built.');
  });
}

function buildSectorRotationRows() {
  const sectors = ['Technology', 'Semiconductors', 'Financials', 'Energy', 'Healthcare', 'Industrials', 'Consumer Discretionary'];
  const daySeed = new Date().toISOString().slice(0, 10);
  return sectors.map((sector, index) => {
    const seed = getSymbolSeed(`${sector}:${daySeed}`, index * 31);
    const flowScore = Math.round(clamp(35 + pseudoRandom(seed + 3) * 64, 1, 100));
    const relativeStrength = clamp(-2 + pseudoRandom(seed + 9) * 5, -3, 3);
    const trend = flowScore >= 66 ? 'Leading' : flowScore <= 42 ? 'Fading' : 'Neutral';
    return {
      sector,
      flowScore,
      relativeStrength,
      trend
    };
  }).sort((a, b) => b.flowScore - a.flowScore);
}

function renderSectorRotationBoard() {
  const results = document.getElementById('preview-sector-rotation-results');
  if (!(results instanceof HTMLElement)) {
    return;
  }
  const rows = buildSectorRotationRows();
  const top = rows[0];
  const lag = rows[rows.length - 1];
  results.innerHTML = `
    <article class="stack-item">
      <p><strong>Top rotation:</strong> ${escapeHtml(top.sector)} (${top.flowScore}) • <strong>Weakest:</strong> ${escapeHtml(lag.sector)} (${lag.flowScore})</p>
      <table class="preview-lab-table">
        <thead>
          <tr>
            <th>Sector</th>
            <th>Flow score</th>
            <th>Relative strength</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.sector)}</td>
              <td>${row.flowScore}</td>
              <td>${row.relativeStrength >= 0 ? '+' : ''}${row.relativeStrength.toFixed(2)}%</td>
              <td>${escapeHtml(row.trend)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="small-note">Preview values are simulated for interface testing.</p>
    </article>
  `;
}

function initSectorRotationModule() {
  const button = document.getElementById('preview-sector-rotation-refresh');
  if (button instanceof HTMLButtonElement) {
    button.addEventListener('click', () => {
      renderSectorRotationBoard();
      setStatus('Sector Rotation board refreshed.');
    });
  }
  renderSectorRotationBoard();
}

function initPositionSizerForm() {
  const form = document.getElementById('preview-position-sizer-form');
  const results = document.getElementById('preview-position-sizer-results');
  if (!(form instanceof HTMLFormElement) || !(results instanceof HTMLElement)) {
    return;
  }
  results.innerHTML = '<p class="preview-lab-empty">Run calculation to preview risk-based position sizing.</p>';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const accountSize = clamp(numberValue(document.getElementById('preview-position-account')?.value, 10000), 100, 100000000);
    const riskPct = clamp(numberValue(document.getElementById('preview-position-risk-pct')?.value, 1), 0.1, 20);
    const entry = clamp(numberValue(document.getElementById('preview-position-entry')?.value, 100), 0.01, 1000000);
    const stop = clamp(numberValue(document.getElementById('preview-position-stop')?.value, 97.5), 0.01, 1000000);
    const riskPerShare = Math.abs(entry - stop);
    if (riskPerShare <= 0.0001) {
      results.innerHTML = '<p class="preview-lab-empty">Entry and stop cannot be the same price.</p>';
      setStatus('Position Sizer needs different entry and stop values.', true);
      return;
    }
    const riskBudget = accountSize * (riskPct / 100);
    const maxShares = Math.max(0, Math.floor(riskBudget / riskPerShare));
    const maxNotional = maxShares * entry;
    const projectedLoss = maxShares * riskPerShare;
    results.innerHTML = `
      <article class="stack-item">
        <p><strong>Risk budget:</strong> ${formatUsd(riskBudget)} (${formatPct(riskPct)} of ${formatUsd(accountSize)})</p>
        <p class="small-note"><strong>Risk/share:</strong> ${formatUsd(riskPerShare)} • <strong>Max shares:</strong> ${maxShares.toLocaleString()}</p>
        <p class="small-note"><strong>Max notional:</strong> ${formatUsd(maxNotional)} • <strong>Projected max loss:</strong> ${formatUsd(projectedLoss)}</p>
      </article>
    `;
    setStatus('Smart Position Sizer preview calculated.');
  });
}

function initSweepTapeForm() {
  const form = document.getElementById('preview-sweep-tape-form');
  const results = document.getElementById('preview-sweep-tape-results');
  if (!(form instanceof HTMLFormElement) || !(results instanceof HTMLElement)) {
    return;
  }
  results.innerHTML = '<p class="preview-lab-empty">Load sweep tape to preview unusual options blocks.</p>';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const symbol = normalizeSymbol(document.getElementById('preview-sweep-symbol')?.value || 'TSLA') || 'TSLA';
    const expiry = String(document.getElementById('preview-sweep-expiry')?.value || 'weekly').trim().toLowerCase();
    const bias = String(document.getElementById('preview-sweep-bias')?.value || 'all').trim().toLowerCase();
    const seed = getSymbolSeed(symbol, expiry.length * 19 + bias.length * 23);
    const center = clamp(50 + pseudoRandom(seed + 1) * 350, 10, 1000);
    const rows = Array.from({ length: 8 }).map((_, index) => {
      const rowSeed = seed + index * 37;
      const type = pseudoRandom(rowSeed + 2) >= 0.5 ? 'CALL' : 'PUT';
      const strikeShiftPct = (pseudoRandom(rowSeed + 3) - 0.5) * 0.24;
      const strike = center * (1 + strikeShiftPct);
      const premium = clamp(0.8 + pseudoRandom(rowSeed + 5) * 12.5, 0.2, 30);
      const contracts = Math.round(clamp(60 + pseudoRandom(rowSeed + 7) * 850, 25, 1200));
      const notional = premium * 100 * contracts;
      const side = pseudoRandom(rowSeed + 11) >= 0.5 ? 'Ask sweep' : 'Bid sweep';
      return { type, strike, premium, contracts, notional, side };
    }).filter((row) => bias === 'all' || row.type.toLowerCase() === bias).slice(0, 6);

    if (!rows.length) {
      results.innerHTML = '<p class="preview-lab-empty">No rows matched this filter in preview; try All bias.</p>';
      return;
    }

    results.innerHTML = `
      <article class="stack-item">
        <p><strong>${escapeHtml(symbol)} sweep tape</strong> • ${escapeHtml(expiry)} expiry bucket • filter ${escapeHtml(bias)}</p>
        <table class="preview-lab-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Strike</th>
              <th>Premium</th>
              <th>Contracts</th>
              <th>Notional</th>
              <th>Side</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${row.type}</td>
                <td>${formatUsd(row.strike)}</td>
                <td>${formatUsd(row.premium)}</td>
                <td>${row.contracts.toLocaleString()}</td>
                <td>${formatUsd(row.notional)}</td>
                <td>${escapeHtml(row.side)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </article>
    `;
    setStatus('Options Sweep Tape preview loaded.');
  });
}

function initVolatilityGuardForm() {
  const form = document.getElementById('preview-volatility-guard-form');
  const results = document.getElementById('preview-volatility-guard-results');
  if (!(form instanceof HTMLFormElement) || !(results instanceof HTMLElement)) {
    return;
  }
  results.innerHTML = '<p class="preview-lab-empty">Check volatility guard to classify regime and risk posture.</p>';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const symbol = normalizeSymbol(document.getElementById('preview-volatility-symbol')?.value || 'QQQ') || 'QQQ';
    const seed = getSymbolSeed(symbol, 91);
    const ivRank = Math.round(clamp(16 + pseudoRandom(seed + 1) * 80, 1, 99));
    const atrPct = clamp(0.9 + pseudoRandom(seed + 5) * 5.6, 0.5, 8);
    const regime = ivRank >= 78 ? 'High-volatility regime'
      : ivRank >= 55 ? 'Elevated volatility'
        : ivRank >= 32 ? 'Normal volatility'
          : 'Compressed volatility';
    const riskCapPct = ivRank >= 78 ? 0.45 : ivRank >= 55 ? 0.75 : ivRank >= 32 ? 1 : 1.25;
    const guidance = ivRank >= 78
      ? 'Favor smaller size, wider invalidation, and faster profit-taking.'
      : ivRank >= 55
        ? 'Use normal size minus one tier and avoid chasing late candles.'
        : ivRank >= 32
          ? 'Standard risk plan applies with normal sizing discipline.'
          : 'Breakouts can fake out; require confirmation before full size.';
    results.innerHTML = `
      <article class="stack-item">
        <p><strong>${escapeHtml(symbol)}</strong> • ${escapeHtml(regime)}</p>
        <div class="preview-lab-inline">
          <span class="preview-lab-chip">IV Rank ${ivRank}</span>
          <span class="preview-lab-chip">ATR ${formatPct(atrPct)}</span>
          <span class="preview-lab-chip preview-lab-chip--warn">Risk cap ${formatPct(riskCapPct)}</span>
        </div>
        <p class="small-note">${escapeHtml(guidance)}</p>
      </article>
    `;
    setStatus('Volatility Regime Guard preview generated.');
  });
}

function initScenarioBuilderForm() {
  const form = document.getElementById('preview-scenario-builder-form');
  const results = document.getElementById('preview-scenario-builder-results');
  if (!(form instanceof HTMLFormElement) || !(results instanceof HTMLElement)) {
    return;
  }
  results.innerHTML = '<p class="preview-lab-empty">Build a scenario to preview base case, invalidation, and target map.</p>';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const symbol = normalizeSymbol(document.getElementById('preview-scenario-symbol')?.value || 'META') || 'META';
    const scenario = String(document.getElementById('preview-scenario-text')?.value || '').trim()
      || 'Catalyst-driven move with mixed market backdrop.';
    const direction = String(document.getElementById('preview-scenario-direction')?.value || 'bullish').trim().toLowerCase();
    const seed = getSymbolSeed(symbol, scenario.length * 13 + direction.length * 17);
    const anchor = clamp(70 + pseudoRandom(seed + 1) * 280, 15, 900);
    const movePct = clamp(2.5 + pseudoRandom(seed + 3) * 7.5, 1.5, 14);
    const upTrigger = anchor * (1 + movePct / 100 * 0.4);
    const downTrigger = anchor * (1 - movePct / 100 * 0.4);
    const upTarget = upTrigger * (1 + movePct / 100 * 0.8);
    const downTarget = downTrigger * (1 - movePct / 100 * 0.8);
    let planLines = [];
    if (direction === 'bullish') {
      planLines = [
        `Bull trigger: reclaim and hold ${formatUsd(upTrigger)}.`,
        `Invalidation: lose ${formatUsd(downTrigger)} on expanding volume.`,
        `Targets: ${formatUsd(upTarget)} (T1), ${formatUsd(upTarget * 1.02)} (T2).`
      ];
    } else if (direction === 'bearish') {
      planLines = [
        `Bear trigger: lose and reject ${formatUsd(downTrigger)}.`,
        `Invalidation: recover ${formatUsd(upTrigger)} with strong breadth.`,
        `Targets: ${formatUsd(downTarget)} (T1), ${formatUsd(downTarget * 0.98)} (T2).`
      ];
    } else {
      planLines = [
        `Bull branch: hold above ${formatUsd(upTrigger)} toward ${formatUsd(upTarget)}.`,
        `Bear branch: fail below ${formatUsd(downTrigger)} toward ${formatUsd(downTarget)}.`,
        `No-trade zone: between ${formatUsd(downTrigger)} and ${formatUsd(upTrigger)} until break confirms.`
      ];
    }
    results.innerHTML = `
      <article class="stack-item">
        <p><strong>${escapeHtml(symbol)} scenario</strong> • ${escapeHtml(direction)} setup</p>
        <p class="small-note">${escapeHtml(scenario)}</p>
        <ul class="preview-lab-list">
          ${planLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
        </ul>
      </article>
    `;
    setStatus('AI Scenario Builder preview created.');
  });
}

function mapTopicInputToApiTopic(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const map = {
    'premium-spike': 'premium-spike',
    'iv-break': 'iv-break',
    'trend-flip': 'trend-flip',
    'watchlist-rule': 'watchlist-rule',
    'journal-coaching': 'journal-coaching',
    'backtest-update': 'backtest-update',
    'session-heatmap': 'session-heatmap'
  };
  return map[normalized] || '';
}

function parseTopicInputList(rawValue) {
  const map = {
    'premium-spike': 'premium-spike',
    'premium-spikes': 'premium-spike',
    'iv-break': 'iv-break',
    'trend-flip': 'trend-flip',
    'trend-trades': 'trend-flip',
    'watchlist-rule': 'watchlist-rule',
    'watchlist-rules': 'watchlist-rule',
    'journal-coaching': 'journal-coaching',
    'backtest-update': 'backtest-update',
    'backtest-updates': 'backtest-update',
    'session-heatmap': 'session-heatmap'
  };
  const tokens = String(rawValue || '')
    .split(',')
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  const normalized = [...new Set(tokens.map((token) => map[token]).filter(Boolean))];
  return normalized;
}

function renderNotificationSettingsSummary(settings) {
  const target = document.getElementById('preview-notify-settings-summary');
  if (!target) {
    return;
  }
  if (!settings) {
    target.innerHTML = '<p class="preview-lab-empty">Save contact settings to enable notification delivery previews.</p>';
    return;
  }
  const topics = Array.isArray(settings.topics) ? settings.topics : [];
  const channels = Array.isArray(settings.channels) ? settings.channels : [];
  target.innerHTML = `
    <article class="stack-item">
      <p><strong>Receiver:</strong> ${escapeHtml(settings.fullName || 'N/A')}</p>
      <p><strong>Email:</strong> ${escapeHtml(settings.email || 'N/A')} ${settings.phone ? `• <strong>Phone:</strong> ${escapeHtml(settings.phone)}` : ''}</p>
      <p><strong>Channels:</strong> ${escapeHtml(channels.join(', ') || 'email')}</p>
      <p><strong>Topics:</strong> ${escapeHtml(topics.join(', ') || 'premium-spike')}</p>
      ${settings.notes ? `<p class="small-note"><strong>Notes:</strong> ${escapeHtml(settings.notes)}</p>` : ''}
    </article>
  `;
}

function renderNotificationMessages(messages) {
  const target = document.getElementById('preview-notify-messages');
  if (!target) {
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    target.innerHTML = '<p class="preview-lab-empty">No bot messages yet. Send one from the form above.</p>';
    return;
  }
  target.innerHTML = messages
    .slice(0, 20)
    .map((message) => {
      const attempts = Array.isArray(message.delivery?.attempts) ? message.delivery.attempts : [];
      const sentCount = Number(message.delivery?.sentCount || 0);
      const deliveryText = attempts.length
        ? attempts.map((attempt) => `${attempt.channel}:${attempt.status}${attempt.detail ? ` (${attempt.detail})` : ''}`).join(' • ')
        : 'No delivery metadata';
      return `
        <article class="stack-item">
          <p><strong>${escapeHtml(message.topicLabel || message.topic || 'Notification')}</strong> • ${escapeHtml(message.generatedAt || '')}</p>
          <p class="small-note">To: ${escapeHtml(message.toEmail || 'N/A')}${message.toPhone ? ` • ${escapeHtml(message.toPhone)}` : ''} • Channels: ${escapeHtml((message.channels || []).join(', '))}</p>
          <p class="small-note"><strong>Delivery:</strong> ${escapeHtml(deliveryText)} • sent=${sentCount}</p>
          <p class="preview-notify-message"><strong>${escapeHtml(message.subject || '')}</strong>\n${escapeHtml(message.body || '')}</p>
        </article>
      `;
    })
    .join('');
}

async function loadNotificationState() {
  try {
    const settingsPayload = await fetchJson('/api/market/copilot/notifications/settings', {
      headers: getAuthHeaders()
    });
    const settings = settingsPayload?.settings || null;
    renderNotificationSettingsSummary(settings);
    if (settings) {
      const fullNameInput = document.getElementById('preview-notify-name');
      const emailInput = document.getElementById('preview-notify-email');
      const phoneInput = document.getElementById('preview-notify-phone');
      const topicInput = document.getElementById('preview-notify-topics');
      const notesInput = document.getElementById('preview-notify-notes');
      const channelInput = document.getElementById('preview-notify-channel');
      if (fullNameInput instanceof HTMLInputElement) {
        fullNameInput.value = settings.fullName || '';
      }
      if (emailInput instanceof HTMLInputElement) {
        emailInput.value = settings.email || '';
      }
      if (phoneInput instanceof HTMLInputElement) {
        phoneInput.value = settings.phone || '';
      }
      if (topicInput instanceof HTMLInputElement) {
        topicInput.value = Array.isArray(settings.topics) ? settings.topics.join(',') : '';
      }
      if (notesInput instanceof HTMLInputElement) {
        notesInput.value = settings.notes || '';
      }
      if (channelInput instanceof HTMLSelectElement) {
        const channels = Array.isArray(settings.channels) ? settings.channels : [];
        if (channels.includes('email') && channels.includes('sms')) {
          channelInput.value = 'both';
        } else if (channels.includes('sms')) {
          channelInput.value = 'sms';
        } else {
          channelInput.value = 'email';
        }
      }
    }
  } catch (_error) {
    renderNotificationSettingsSummary(null);
  }
  try {
    const messagesPayload = await fetchJson('/api/market/copilot/notifications/messages?limit=20', {
      headers: getAuthHeaders()
    });
    renderNotificationMessages(messagesPayload?.messages || []);
  } catch (_error) {
    renderNotificationMessages([]);
  }
}

function initNotificationForms() {
  const settingsForm = document.getElementById('preview-notification-settings-form');
  const sendForm = document.getElementById('preview-notification-send-form');

  if (settingsForm instanceof HTMLFormElement) {
    settingsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fullName = String(document.getElementById('preview-notify-name')?.value || '').trim();
      const email = String(document.getElementById('preview-notify-email')?.value || '').trim().toLowerCase();
      const phone = String(document.getElementById('preview-notify-phone')?.value || '').trim();
      const channel = String(document.getElementById('preview-notify-channel')?.value || 'email').trim().toLowerCase();
      const notes = String(document.getElementById('preview-notify-notes')?.value || '').trim();
      const topicsRaw = String(document.getElementById('preview-notify-topics')?.value || '').trim();
      const topics = parseTopicInputList(topicsRaw);
      const channels = channel === 'both' ? ['email', 'sms'] : [channel];
      try {
        await fetchJson('/api/market/copilot/notifications/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({
            fullName,
            email,
            phone,
            channels,
            topics,
            notes
          })
        });
        setStatus('Contact info saved. Notification receiver is active.');
        await loadNotificationState();
      } catch (error) {
        setStatus(error.message || 'Could not save notification settings.', true);
      }
    });
  }

  if (sendForm instanceof HTMLFormElement) {
    sendForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const topic = mapTopicInputToApiTopic(document.getElementById('preview-notify-send-topic')?.value || '');
      const symbol = String(document.getElementById('preview-notify-send-symbol')?.value || '').trim().toUpperCase();
      const detail = String(document.getElementById('preview-notify-send-note')?.value || '').trim();
      try {
        if (!topic) {
          throw new Error('Pick a valid notification topic before sending.');
        }
        const response = await fetchJson('/api/market/copilot/notifications/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify({
            topic,
            symbol,
            detail
          })
        });
        const attempts = Array.isArray(response?.delivery?.attempts) ? response.delivery.attempts : [];
        const sentChannels = attempts
          .filter((attempt) => String(attempt?.status || '') === 'sent')
          .map((attempt) => String(attempt.channel || ''));
        if (sentChannels.length) {
          setStatus(`Notification sent in real life via: ${sentChannels.join(', ')}.`);
        } else {
          setStatus('Notification was created, but no real channel reported sent.', true);
        }
        await loadNotificationState();
      } catch (error) {
        const attempts = Array.isArray(error?.body?.attempts) ? error.body.attempts : [];
        if (attempts.length) {
          const summary = attempts.map((attempt) => `${attempt.channel}:${attempt.status}`).join(' • ');
          setStatus(`Delivery failed. Attempts: ${summary}`, true);
          return;
        }
        setStatus(error.message || 'Could not send notification bot message.', true);
      }
    });
  }
}

function initPreviewLab() {
  const state = readPreviewState();
  renderAlerts(state);
  renderWatchlists(state);
  renderHeatmap();
  renderJournal(state);
  renderBacktestResult(null);
  initAlertsForm(state);
  initBacktestForm();
  initWatchlistForm(state);
  initJournalForm(state);
  initFlowRadarForm();
  initEarningsPlannerForm();
  initSectorRotationModule();
  initPositionSizerForm();
  initSweepTapeForm();
  initVolatilityGuardForm();
  initScenarioBuilderForm();
  initNotificationForms();
  setStatus('Preview mode active: no Pro lock on this page (12 modules open).');
  loadNotificationState().catch((_error) => {
    // UI gracefully handles missing session or empty state.
  });
  focusRequestedFeature();
}

function focusRequestedFeature() {
  const params = new URLSearchParams(window.location.search);
  const queryFeature = String(params.get('feature') || '').trim().toLowerCase();
  const hashFeature = String(window.location.hash || '').replace(/^#/, '').trim().toLowerCase();
  const feature = queryFeature || hashFeature;
  if (!feature) {
    return;
  }
  const idByFeature = {
    notifications: 'pro-idea-notifications',
    alerts: 'pro-idea-alerts',
    backtest: 'pro-idea-backtest',
    watchlists: 'pro-idea-watchlists',
    heatmap: 'pro-idea-heatmap',
    journal: 'pro-idea-journal',
    flow: 'pro-idea-flow-radar',
    'flow-radar': 'pro-idea-flow-radar',
    earnings: 'pro-idea-earnings-planner',
    'earnings-planner': 'pro-idea-earnings-planner',
    sector: 'pro-idea-sector-rotation',
    'sector-rotation': 'pro-idea-sector-rotation',
    position: 'pro-idea-position-sizer',
    'position-sizer': 'pro-idea-position-sizer',
    sweeps: 'pro-idea-sweep-tape',
    'sweep-tape': 'pro-idea-sweep-tape',
    volatility: 'pro-idea-volatility-guard',
    'volatility-guard': 'pro-idea-volatility-guard',
    scenario: 'pro-idea-scenario-builder',
    'scenario-builder': 'pro-idea-scenario-builder',
    'pro-idea-notifications': 'pro-idea-notifications',
    'pro-idea-alerts': 'pro-idea-alerts',
    'pro-idea-backtest': 'pro-idea-backtest',
    'pro-idea-watchlists': 'pro-idea-watchlists',
    'pro-idea-heatmap': 'pro-idea-heatmap',
    'pro-idea-journal': 'pro-idea-journal',
    'pro-idea-flow-radar': 'pro-idea-flow-radar',
    'pro-idea-earnings-planner': 'pro-idea-earnings-planner',
    'pro-idea-sector-rotation': 'pro-idea-sector-rotation',
    'pro-idea-position-sizer': 'pro-idea-position-sizer',
    'pro-idea-sweep-tape': 'pro-idea-sweep-tape',
    'pro-idea-volatility-guard': 'pro-idea-volatility-guard',
    'pro-idea-scenario-builder': 'pro-idea-scenario-builder',
    receiver: 'pro-idea-notifications',
    intake: 'pro-idea-notifications',
    contact: 'pro-idea-notifications',
    'notification-receiver': 'pro-idea-notifications'
  };
  const targetId = idByFeature[feature];
  if (!targetId) {
    return;
  }
  const target = document.getElementById(targetId);
  if (!(target instanceof HTMLElement)) {
    return;
  }
  window.setTimeout(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.remove('module-highlight');
    void target.offsetWidth;
    target.classList.add('module-highlight');
    window.setTimeout(() => {
      target.classList.remove('module-highlight');
    }, 1500);
  }, 120);
}

window.proPreviewLab = window.proPreviewLab || {};
window.proPreviewLab.refreshAllModules = function refreshAllModules() {
  try {
    renderHeatmap();
    renderBacktestResult(null);
    renderSectorRotationBoard();
    setStatus('Preview modules refreshed. Everything stays open for testing.');
    return true;
  } catch (_error) {
    return false;
  }
};

initPreviewLab();
