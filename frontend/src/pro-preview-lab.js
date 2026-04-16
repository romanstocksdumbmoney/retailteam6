const PREVIEW_LAB_STORAGE_KEY = 'dumbdollars_pro_preview_lab_v2';

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
  setStatus('Preview mode active: no Pro lock on this page.');
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
    alerts: 'pro-idea-alerts',
    backtest: 'pro-idea-backtest',
    watchlists: 'pro-idea-watchlists',
    heatmap: 'pro-idea-heatmap',
    journal: 'pro-idea-journal',
    'pro-idea-alerts': 'pro-idea-alerts',
    'pro-idea-backtest': 'pro-idea-backtest',
    'pro-idea-watchlists': 'pro-idea-watchlists',
    'pro-idea-heatmap': 'pro-idea-heatmap',
    'pro-idea-journal': 'pro-idea-journal'
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

initPreviewLab();
