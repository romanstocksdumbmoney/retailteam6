const {
  normalizeSymbol,
  buildStockOutlook,
  getTrendTrades,
  getHighIvTracker
} = require('./marketEngine');

const SECTOR_UNIVERSE = {
  Technology: ['AAPL', 'MSFT', 'ORCL', 'CRM', 'ADBE', 'NOW'],
  Semiconductors: ['NVDA', 'AMD', 'AVGO', 'QCOM', 'MU', 'INTC'],
  Financials: ['JPM', 'BAC', 'MS', 'GS', 'BLK', 'SCHW'],
  Energy: ['XOM', 'CVX', 'SLB', 'COP', 'EOG', 'OXY'],
  Healthcare: ['UNH', 'PFE', 'JNJ', 'LLY', 'MRK', 'ABBV'],
  'Consumer Discretionary': ['AMZN', 'TSLA', 'NKE', 'HD', 'MCD', 'SBUX'],
  Industrials: ['CAT', 'GE', 'BA', 'DE', 'LMT', 'UPS'],
  'Communication Services': ['META', 'GOOGL', 'NFLX', 'TMUS', 'VZ', 'DIS'],
  Utilities: ['NEE', 'DUK', 'SO', 'AEP', 'XEL', 'EXC'],
  Materials: ['LIN', 'FCX', 'NEM', 'ECL', 'APD', 'SHW'],
  'Real Estate': ['PLD', 'AMT', 'SPG', 'EQIX', 'O', 'DLR']
};

const ALLOWED_TIMEFRAMES = new Set(['intraday', 'swing', 'position']);
const ALLOWED_TRADING_MODES = new Set(['paper', 'live']);
const ALLOWED_BROKERS = new Set(['manual', 'robinhood', 'webull', 'interactive-brokers', 'tradestation']);
const ALLOWED_EXECUTION_MODES = new Set(['manual_confirmed', 'broker_linked']);

const traderStore = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pseudoRandom(seed) {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
}

function nowIso() {
  return new Date().toISOString();
}

function roundUsd(value) {
  return Number(Number(value || 0).toFixed(2));
}

function daySeed() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
}

function minuteSeed() {
  const now = new Date();
  return `${daySeed()}:${now.getUTCHours()}:${Math.floor(now.getUTCMinutes() / 10)}`;
}

function defaultConfig() {
  return {
    prompt: 'Momentum setups with disciplined risk.',
    chasePct: 0.8,
    riskPerTradePct: 1.5,
    targetReturnPct: 12,
    allocationPerTradePct: 20,
    maxSectorExposurePct: 35,
    maxGrossExposurePct: 100,
    maxPositions: 4,
    stopLossPct: 2.5,
    takeProfitPct: 5.5,
    timeframe: 'intraday',
    sectors: ['Technology', 'Semiconductors', 'Healthcare']
  };
}

function defaultState() {
  return {
    configured: false,
    isActive: false,
    tradingMode: 'paper',
    cashUsd: 0,
    totalDepositedUsd: 0,
    liveFunding: {
      isFunded: false,
      fundedUsd: 0,
      lastFundingUsd: 0,
      accountHolder: '',
      broker: 'manual',
      paymentRail: 'bank_transfer',
      executionMode: 'manual_confirmed',
      riskAcknowledged: false,
      fundedAt: null,
      status: 'not_funded'
    },
    paperTrading: {
      provider: 'tradingview',
      isConnected: false,
      tradingviewEmail: '',
      tradingviewUsername: '',
      aiAccessEnabled: false,
      connectedAt: null,
      status: 'not_connected'
    },
    liveExecution: {
      brokerConnection: {
        isConnected: false,
        broker: 'manual',
        accountId: '',
        connectionStatus: 'not_connected',
        bridgeMode: 'manual_confirmed',
        connectedAt: null
      },
      queuedAiTrades: [],
      lastWebsiteSignalSnapshot: null,
      lastPlan: null
    },
    config: defaultConfig(),
    openPositions: [],
    fundingTransactions: [],
    cycleHistory: [],
    lastCycle: null,
    updatedAt: nowIso()
  };
}

function ensureLiveExecutionState(state) {
  if (!state.liveExecution || typeof state.liveExecution !== 'object') {
    state.liveExecution = defaultState().liveExecution;
  }
  if (!state.liveExecution.brokerConnection || typeof state.liveExecution.brokerConnection !== 'object') {
    state.liveExecution.brokerConnection = defaultState().liveExecution.brokerConnection;
  }
  if (!Array.isArray(state.liveExecution.queuedAiTrades)) {
    state.liveExecution.queuedAiTrades = [];
  }
  return state.liveExecution;
}

function isValidEmail(email) {
  const value = String(email || '').trim();
  if (!value) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getState(userId) {
  if (!traderStore.has(userId)) {
    traderStore.set(userId, defaultState());
  }
  return traderStore.get(userId);
}

function sanitizeSectors(inputSectors) {
  const raw = Array.isArray(inputSectors) ? inputSectors : [];
  const valid = raw.filter((sector) => Object.prototype.hasOwnProperty.call(SECTOR_UNIVERSE, sector));
  if (valid.length > 0) {
    return [...new Set(valid)].slice(0, 6);
  }
  return ['Technology', 'Semiconductors', 'Healthcare'];
}

function sanitizeConfig(input = {}) {
  const timeframeRaw = String(input.timeframe || 'intraday').trim().toLowerCase();
  const timeframe = ALLOWED_TIMEFRAMES.has(timeframeRaw) ? timeframeRaw : 'intraday';
  const targetReturnRaw = Number(
    Object.prototype.hasOwnProperty.call(input, 'targetReturnPct')
      ? input.targetReturnPct
      : input.desiredReturnPct
  );
  return {
    prompt: String(input.prompt || '').trim().slice(0, 500) || defaultConfig().prompt,
    chasePct: roundUsd(clamp(Number(input.chasePct || 0.8), 0, 10)),
    riskPerTradePct: roundUsd(clamp(Number(input.riskPerTradePct || 1.5), 0.1, 10)),
    targetReturnPct: roundUsd(clamp(Number.isFinite(targetReturnRaw) ? targetReturnRaw : 12, 1, 200)),
    allocationPerTradePct: roundUsd(clamp(Number(input.allocationPerTradePct || 20), 2, 80)),
    maxSectorExposurePct: roundUsd(clamp(Number(input.maxSectorExposurePct || 35), 10, 100)),
    maxGrossExposurePct: roundUsd(clamp(Number(input.maxGrossExposurePct || 100), 10, 200)),
    maxPositions: Math.trunc(clamp(Number(input.maxPositions || 4), 1, 12)),
    stopLossPct: roundUsd(clamp(Number(input.stopLossPct || 2.5), 0.3, 20)),
    takeProfitPct: roundUsd(clamp(Number(input.takeProfitPct || 5.5), 0.5, 50)),
    timeframe,
    sectors: sanitizeSectors(input.sectors)
  };
}

function sanitizeTradingMode(rawMode) {
  const mode = String(rawMode || 'paper').trim().toLowerCase();
  if (ALLOWED_TRADING_MODES.has(mode)) {
    return mode;
  }
  return 'paper';
}

function sanitizeBroker(rawBroker) {
  const broker = String(rawBroker || 'manual').trim().toLowerCase();
  if (ALLOWED_BROKERS.has(broker)) {
    return broker;
  }
  return 'manual';
}

function parseBrokerOrThrow(rawBroker) {
  const broker = String(rawBroker || 'manual').trim().toLowerCase();
  if (!ALLOWED_BROKERS.has(broker)) {
    throw new Error('invalid_broker');
  }
  return broker;
}

function parseExecutionMode(rawExecutionMode) {
  const mode = String(rawExecutionMode || 'manual_confirmed').trim().toLowerCase();
  if (ALLOWED_EXECUTION_MODES.has(mode)) {
    return mode;
  }
  return 'manual_confirmed';
}

function getDirectionFromPrompt(prompt, seed) {
  const text = String(prompt || '').toLowerCase();
  if (text.includes('short') || text.includes('bear') || text.includes('downtrend')) {
    return 'short';
  }
  if (text.includes('long') || text.includes('bull') || text.includes('uptrend')) {
    return 'long';
  }
  return pseudoRandom(seed + 97) > 0.42 ? 'long' : 'short';
}

function estimateEntryPrice(symbol, seed) {
  const base = 35 + (hashString(symbol) % 290);
  const drift = pseudoRandom(seed + 11) * 35;
  return roundUsd(base + drift);
}

function buildExecutionLinks(ticker) {
  const normalized = normalizeSymbol(ticker);
  const lower = normalized.toLowerCase();
  return [
    {
      label: 'TradingView',
      url: `https://www.tradingview.com/symbols/${normalized}/`
    },
    {
      label: 'Yahoo Finance',
      url: `https://finance.yahoo.com/quote/${normalized}`
    },
    {
      label: 'Robinhood',
      url: `https://robinhood.com/us/en/stocks/${lower}/`
    },
    {
      label: 'Webull',
      url: `https://www.webull.com/quote/nasdaq-${lower}`
    }
  ];
}

function closeRandomPositions(state, seed) {
  if (!Array.isArray(state.openPositions) || state.openPositions.length === 0) {
    return [];
  }
  const closed = [];
  const stillOpen = [];
  state.openPositions.forEach((position, index) => {
    const shouldClose = pseudoRandom(seed + index * 17) > 0.72;
    if (!shouldClose) {
      stillOpen.push(position);
      return;
    }
    const isWin = pseudoRandom(seed + index * 19 + 5) > 0.45;
    const movePct = isWin
      ? position.takeProfitPct
      : -position.stopLossPct;
    const grossPnl = roundUsd(position.notionalUsd * (movePct / 100));
    const releasedCash = roundUsd(position.notionalUsd + grossPnl);
    state.cashUsd = roundUsd(state.cashUsd + releasedCash);
    closed.push({
      id: position.id,
      ticker: position.ticker,
      direction: position.direction,
      closedAt: nowIso(),
      pnlUsd: grossPnl,
      result: isWin ? 'take_profit' : 'stop_loss'
    });
  });
  state.openPositions = stillOpen;
  return closed;
}

function sectorExposurePct(openPositions, sector, portfolioValue) {
  if (!portfolioValue || portfolioValue <= 0) {
    return 0;
  }
  const sectorValue = openPositions
    .filter((position) => position.sector === sector)
    .reduce((sum, position) => sum + Number(position.notionalUsd || 0), 0);
  return (sectorValue / portfolioValue) * 100;
}

function estimatePositionMarkPrice(userId, position) {
  const baseSeed = hashString(`${userId}:${position.id}:${minuteSeed()}`);
  const driftPct = (pseudoRandom(baseSeed) - 0.5) * 0.06; // +/- 3% mark drift
  const entry = Number(position.entry || 0);
  return roundUsd(entry * (1 + driftPct));
}

function buildMarkedPositions(userId, positions = []) {
  return positions.map((position) => {
    const markPrice = estimatePositionMarkPrice(userId, position);
    const shares = Number(position.shares || 0);
    const direction = String(position.direction || 'long').toLowerCase() === 'short' ? 'short' : 'long';
    const rawPnl = direction === 'long'
      ? (markPrice - Number(position.entry || 0)) * shares
      : (Number(position.entry || 0) - markPrice) * shares;
    const marketValueUsd = roundUsd(markPrice * shares);
    return {
      ...position,
      markPrice,
      marketValueUsd,
      unrealizedPnlUsd: roundUsd(rawPnl)
    };
  });
}

function buildSyntheticAccountReference(userId, broker, accountHolder) {
  const base = hashString(`${userId}:${broker}:${accountHolder}`).toString(16).slice(-8).toUpperCase();
  return `AI-${base || '00000000'}`;
}

function buildWebsiteSignalSnapshot(state, userId) {
  const liveExecution = ensureLiveExecutionState(state);
  const trendPayload = getTrendTrades(12, 'all');
  const highIvPayload = getHighIvTracker(12);
  const trendItems = Array.isArray(trendPayload?.items) ? trendPayload.items : [];
  const highIvItems = Array.isArray(highIvPayload?.items) ? highIvPayload.items : [];
  const queuedAiTrades = (liveExecution.queuedAiTrades || [])
    .filter((row) => row.status === 'pending')
    .slice(0, 20);

  const trendSymbols = trendItems.map((row) => normalizeSymbol(row.symbol)).filter(Boolean);
  const highIvSymbols = highIvItems.map((row) => normalizeSymbol(row.symbol)).filter(Boolean);
  const aiQueueSymbols = queuedAiTrades.map((row) => normalizeSymbol(row.symbol)).filter(Boolean);
  const rankedSymbols = [...new Set([...aiQueueSymbols, ...trendSymbols, ...highIvSymbols])].slice(0, 25);

  const trendBySymbol = {};
  trendItems.forEach((row) => {
    const symbol = normalizeSymbol(row.symbol);
    if (!symbol) {
      return;
    }
    trendBySymbol[symbol] = {
      momentum: row.momentum,
      trendScore: Number(row.trendScore || 0),
      source: row.source || 'social'
    };
  });
  const aiQueueBySymbol = {};
  queuedAiTrades.forEach((row) => {
    const symbol = normalizeSymbol(row.symbol);
    if (!symbol) {
      return;
    }
    aiQueueBySymbol[symbol] = row;
  });

  const snapshot = {
    generatedAt: nowIso(),
    userRef: `usr-${hashString(String(userId || 'u'))}`,
    sources: {
      aiTradeQueue: queuedAiTrades.length,
      trendTrades: trendItems.length,
      highIvTracker: highIvItems.length
    },
    rankedSymbols,
    trendBySymbol,
    aiQueueBySymbol,
    notes: [
      'Symbols are ranked from AI Trade queue + Trend Trades + High IV Tracker.',
      'AI queue signals are prioritized when available.',
      'Direction is refined with stock outlook probabilities and trend momentum.'
    ]
  };
  liveExecution.lastWebsiteSignalSnapshot = snapshot;
  return snapshot;
}

function buildExecutionTicket(state, trade) {
  const liveFunding = state.liveFunding || defaultState().liveFunding;
  const broker = String(liveFunding.broker || 'manual').trim().toLowerCase();
  const executionMode = String(liveFunding.executionMode || 'manual_confirmed').trim().toLowerCase();
  const liveExecution = ensureLiveExecutionState(state);
  const brokerLinked = executionMode === 'broker_linked'
    && broker !== 'manual'
    && Boolean(liveExecution.brokerConnection?.isConnected);
  const side = String(trade.direction || 'long').toLowerCase() === 'short' ? 'SELL_SHORT' : 'BUY';
  return {
    ticketId: `x-${hashString(`${trade.id}:${trade.ticker}:${trade.createdAt}`)}`,
    broker,
    executionMode,
    readyForBrokerApi: brokerLinked,
    reasonNotReady: brokerLinked ? null : 'Broker API bridge is not connected yet; manual confirmation required.',
    orderPayload: {
      symbol: trade.ticker,
      side,
      quantity: trade.shares,
      orderType: 'limit',
      limitPrice: trade.chasePrice,
      stopLossPrice: trade.stopLoss,
      takeProfitPrice: trade.takeProfit,
      tif: 'day'
    }
  };
}

function runAutoTraderCycle(user) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  if (!state.configured) {
    throw new Error('bot_not_configured');
  }
  if (!state.isActive) {
    throw new Error('bot_paused');
  }
  if (state.tradingMode === 'live' && !state.liveFunding?.isFunded) {
    throw new Error('live_funding_required');
  }
  if (state.cashUsd <= 0) {
    throw new Error('insufficient_cash');
  }

  const seed = hashString(`${userId}:${minuteSeed()}:${state.config.prompt}`);
  const websiteSignals = buildWebsiteSignalSnapshot(state, userId);
  const pendingQueue = (ensureLiveExecutionState(state).queuedAiTrades || [])
    .filter((row) => row.status === 'pending')
    .slice(0, 30);
  const closedPositions = closeRandomPositions(state, seed);
  const maxNewTrades = Math.max(1, Math.min(4, state.config.maxPositions - state.openPositions.length));
  const candidateTrades = [];
  const startingCash = state.cashUsd;
  const startingPortfolio = roundUsd(
    state.cashUsd + state.openPositions.reduce((sum, position) => sum + Number(position.notionalUsd || 0), 0)
  );

  for (let i = 0; i < maxNewTrades; i += 1) {
    if (state.cashUsd < 100) {
      break;
    }
    const sector = state.config.sectors[i % state.config.sectors.length];
    const sectorNames = Object.keys(SECTOR_UNIVERSE);
    const pickedSector = sector || sectorNames[Math.floor(pseudoRandom(seed + i * 3) * sectorNames.length)];
    const sectorTickers = SECTOR_UNIVERSE[pickedSector] || SECTOR_UNIVERSE.Technology;
    const preferredBySector = websiteSignals.rankedSymbols.filter((symbol) => sectorTickers.includes(symbol));
    const fallbackPreferred = websiteSignals.rankedSymbols.filter((symbol) => !candidateTrades.some((trade) => trade.ticker === symbol));
    const pickedPreferred = preferredBySector[0] || fallbackPreferred[0];
    const ticker = normalizeSymbol(pickedPreferred || sectorTickers[Math.floor(pseudoRandom(seed + i * 5 + 1) * sectorTickers.length)]);
    const queuedSignal = pendingQueue.find((signal) => normalizeSymbol(signal.symbol) === ticker);
    const trendSignal = websiteSignals.trendBySymbol?.[ticker];
    const outlook = buildStockOutlook(ticker);
    const outlookUp = Number(outlook?.probabilities?.day?.up || 0);
    const outlookDown = Number(outlook?.probabilities?.day?.down || 0);
    const outlookDirection = outlookUp >= outlookDown ? 'long' : 'short';
    const queueDirection = queuedSignal
      ? (String(queuedSignal.trend || '').toLowerCase() === 'bearish' ? 'short' : 'long')
      : null;
    const trendDirection = trendSignal
      ? (String(trendSignal.momentum || '').toLowerCase() === 'down' ? 'short' : 'long')
      : null;
    const direction = queueDirection || trendDirection || outlookDirection || getDirectionFromPrompt(state.config.prompt, seed + i * 13);
    const entry = Number.isFinite(Number(queuedSignal?.entryPrice))
      ? roundUsd(Number(queuedSignal.entryPrice))
      : estimateEntryPrice(ticker, seed + i * 29);
    const chasePrice = direction === 'long'
      ? roundUsd(entry * (1 + state.config.chasePct / 100))
      : roundUsd(entry * (1 - state.config.chasePct / 100));
    const stopLoss = direction === 'long'
      ? roundUsd(entry * (1 - state.config.stopLossPct / 100))
      : roundUsd(entry * (1 + state.config.stopLossPct / 100));
    const takeProfit = direction === 'long'
      ? roundUsd(entry * (1 + state.config.takeProfitPct / 100))
      : roundUsd(entry * (1 - state.config.takeProfitPct / 100));

    const perTradeBudget = Math.min(
      state.cashUsd,
      roundUsd(startingPortfolio * (state.config.allocationPerTradePct / 100))
    );
    const unitRisk = Math.max(0.01, Math.abs(entry - stopLoss));
    const maxRiskBudget = roundUsd(startingPortfolio * (state.config.riskPerTradePct / 100));
    let shares = Math.floor(perTradeBudget / Math.max(entry, 0.01));
    shares = Math.min(shares, Math.floor(maxRiskBudget / unitRisk));
    if (shares < 1) {
      continue;
    }

    const notionalUsd = roundUsd(shares * entry);
    const projectedSectorExposure = sectorExposurePct(
      state.openPositions.concat(candidateTrades.map((trade) => ({ ...trade, notionalUsd: trade.notionalUsd }))),
      pickedSector,
      Math.max(1, startingPortfolio)
    ) + ((notionalUsd / Math.max(1, startingPortfolio)) * 100);

    if (projectedSectorExposure > state.config.maxSectorExposurePct + 0.01) {
      continue;
    }

    const grossExposurePct = (
      state.openPositions.reduce((sum, position) => sum + Number(position.notionalUsd || 0), 0)
      + candidateTrades.reduce((sum, trade) => sum + Number(trade.notionalUsd || 0), 0)
      + notionalUsd
    ) / Math.max(1, startingPortfolio) * 100;
    if (grossExposurePct > state.config.maxGrossExposurePct + 0.01) {
      continue;
    }
    if (notionalUsd > state.cashUsd) {
      continue;
    }

    const orderId = `ord-${hashString(`${ticker}:${seed}:${i}`)}`;
    const riskUsd = roundUsd(unitRisk * shares);
    const potentialRewardUsd = roundUsd(Math.abs(takeProfit - entry) * shares);
    const trade = {
      id: orderId,
      ticker,
      sector: pickedSector,
      direction,
      shares,
      entry,
      chasePrice,
      stopLoss,
      stopLossPct: state.config.stopLossPct,
      takeProfit,
      takeProfitPct: state.config.takeProfitPct,
      notionalUsd,
      riskUsd,
      potentialRewardUsd,
      signalSources: [
        queueDirection ? 'ai_trade_queue' : null,
        trendDirection ? 'trend_trades' : null,
        'stock_outlook'
      ].filter(Boolean),
      websiteSignalScore: Math.round(
        (queueDirection ? 45 : 0)
        + (trendSignal ? Math.max(10, Math.min(30, Number(trendSignal.trendScore || 0) / 3)) : 0)
        + Math.max(10, Math.min(25, Math.abs(outlookUp - outlookDown)))
      ),
      links: buildExecutionLinks(ticker),
      createdAt: nowIso()
    };
    trade.executionTicket = buildExecutionTicket(state, trade);
    candidateTrades.push(trade);
    state.cashUsd = roundUsd(state.cashUsd - notionalUsd);
    if (queuedSignal) {
      queuedSignal.status = 'consumed';
      queuedSignal.consumedAt = trade.createdAt;
      queuedSignal.consumedByOrderId = trade.id;
    }
  }

  const placedPositions = candidateTrades.map((trade) => ({
    id: trade.id,
    ticker: trade.ticker,
    sector: trade.sector,
    direction: trade.direction,
    shares: trade.shares,
    entry: trade.entry,
    stopLoss: trade.stopLoss,
    stopLossPct: trade.stopLossPct,
    takeProfit: trade.takeProfit,
    takeProfitPct: trade.takeProfitPct,
    notionalUsd: trade.notionalUsd,
    openedAt: trade.createdAt
  }));
  state.openPositions = state.openPositions.concat(placedPositions).slice(-30);
  const cycle = {
    executedAt: nowIso(),
    prompt: state.config.prompt,
    startedCashUsd: startingCash,
    endingCashUsd: state.cashUsd,
    closedPositions,
    plannedTrades: candidateTrades,
    websiteSignals: {
      generatedAt: websiteSignals.generatedAt,
      sourceCounts: websiteSignals.sources,
      rankedSymbols: websiteSignals.rankedSymbols.slice(0, 12),
      notes: websiteSignals.notes
    },
    note: state.tradingMode === 'live'
      ? 'Live mode uses funded capital sizing and website signal routing. Broker-linked tickets are execution-ready only when API bridge is connected.'
      : 'Paper-trading simulation uses website signals; no real brokerage orders are sent.'
  };
  const cycleSummary = {
    cycleId: `cyc-${hashString(`${userId}:${cycle.executedAt}`)}`,
    executedAt: cycle.executedAt,
    mode: state.tradingMode,
    startedCashUsd: cycle.startedCashUsd,
    endingCashUsd: cycle.endingCashUsd,
    openedPositionsCount: candidateTrades.length,
    closedPositionsCount: closedPositions.length,
    closedPnlUsd: roundUsd(closedPositions.reduce((sum, row) => sum + Number(row.pnlUsd || 0), 0)),
    note: cycle.note
  };
  state.cycleHistory = [cycleSummary, ...(state.cycleHistory || [])].slice(0, 60);
  state.lastCycle = cycle;
  ensureLiveExecutionState(state).lastPlan = {
    generatedAt: cycle.executedAt,
    tradingMode: state.tradingMode,
    executionMode: state.liveFunding?.executionMode || 'manual_confirmed',
    broker: state.liveFunding?.broker || 'manual',
    orderTickets: candidateTrades.map((trade) => trade.executionTicket),
    manualActionRequired: candidateTrades.some((trade) => !Boolean(trade.executionTicket?.readyForBrokerApi))
  };
  state.updatedAt = nowIso();
  return cycle;
}

function configureAutoTrader(user, inputConfig = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const capitalUsd = Number(inputConfig.capitalUsd);
  if (!Number.isFinite(capitalUsd) || capitalUsd < 100 || capitalUsd > 10_000_000) {
    throw new Error('invalid_capital');
  }
  const state = getState(userId);
  const tradingMode = sanitizeTradingMode(inputConfig.tradingMode);
  state.config = sanitizeConfig(inputConfig);
  state.configured = true;
  state.isActive = true;
  state.tradingMode = tradingMode;

  if (tradingMode === 'live') {
    // Live mode funding is handled in a separate, explicit funding step.
    if (!state.liveFunding?.isFunded) {
      state.cashUsd = 0;
      state.totalDepositedUsd = 0;
    }
  } else {
    state.cashUsd = roundUsd(capitalUsd);
    state.totalDepositedUsd = roundUsd(capitalUsd);
  }
  state.updatedAt = nowIso();
  return state;
}

function setAutoTraderFundingMode(user, mode) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const rawMode = String(mode || '').trim().toLowerCase();
  if (!ALLOWED_TRADING_MODES.has(rawMode)) {
    throw new Error('invalid_funding_mode');
  }
  const state = getState(userId);
  state.tradingMode = rawMode;
  if (rawMode === 'live' && !state.liveFunding?.isFunded) {
    state.cashUsd = 0;
    state.totalDepositedUsd = 0;
  }
  if (rawMode === 'paper' && state.cashUsd <= 0) {
    const fallbackCash = roundUsd(
      Number(state.totalDepositedUsd || 0) > 0
        ? Number(state.totalDepositedUsd)
        : 10_000
    );
    state.cashUsd = fallbackCash;
    if (state.totalDepositedUsd <= 0) {
      state.totalDepositedUsd = fallbackCash;
    }
  }
  state.updatedAt = nowIso();
  return state;
}

function setBotActive(user, active) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  if (!state.configured) {
    throw new Error('bot_not_configured');
  }
  state.isActive = Boolean(active);
  state.updatedAt = nowIso();
  return state;
}

function fundAutoTrader(user, amountUsd, details = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const amount = roundUsd(Number(amountUsd));
  if (!Number.isFinite(amount) || amount < 10 || amount > 1_000_000) {
    throw new Error('invalid_funding_amount');
  }
  const state = getState(userId);
  if (!state.configured) {
    throw new Error('bot_not_configured');
  }
  const accountHolder = String(details.accountHolder || '').trim().slice(0, 80);
  const broker = sanitizeBroker(details.broker);
  const paymentRail = String(details.paymentRail || 'bank_transfer').trim().toLowerCase() || 'bank_transfer';
  const executionMode = parseExecutionMode(details.executionMode);
  const riskAcknowledged = Boolean(details.riskAcknowledged);
  const targetReturnRaw = Number(details.targetReturnPct);
  const riskPerTradeRaw = Number(details.riskPerTradePct);
  const targetReturnPct = roundUsd(clamp(Number.isFinite(targetReturnRaw) ? targetReturnRaw : state.config.targetReturnPct, 1, 200));
  const riskPerTradePct = roundUsd(clamp(Number.isFinite(riskPerTradeRaw) ? riskPerTradeRaw : state.config.riskPerTradePct, 0.1, 25));

  state.tradingMode = 'live';
  state.cashUsd = roundUsd(state.cashUsd + amount);
  state.totalDepositedUsd = roundUsd(state.totalDepositedUsd + amount);
  state.config.targetReturnPct = targetReturnPct;
  state.config.riskPerTradePct = riskPerTradePct;
  state.liveFunding = {
    isFunded: true,
    fundedUsd: roundUsd((state.liveFunding?.fundedUsd || 0) + amount),
    lastFundingUsd: amount,
    accountHolder,
    broker,
    paymentRail,
    executionMode,
    riskAcknowledged,
    targetReturnPct,
    riskPerTradePct,
    fundedAt: nowIso(),
    status: 'funded'
  };
  const transaction = {
    transactionId: `fund-${hashString(`${userId}:${state.liveFunding.fundedAt}:${amount}`)}`,
    amountUsd: amount,
    broker,
    accountHolder,
    paymentRail,
    status: 'completed',
    fundedAt: state.liveFunding.fundedAt
  };
  state.fundingTransactions = [transaction, ...(state.fundingTransactions || [])].slice(0, 120);
  state.updatedAt = nowIso();
  return state;
}

function saveAutoTraderLiveTradingProfile(user, details = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  const broker = parseBrokerOrThrow(details.broker);
  const accountLabel = String(details.accountLabel || details.accountHolder || '').trim();
  if (!accountLabel || accountLabel.length > 80) {
    throw new Error('invalid_account_label');
  }
  const riskAcknowledged = Boolean(details.riskAcknowledgement || details.riskAcknowledged);
  if (!riskAcknowledged) {
    throw new Error('invalid_risk_acknowledgement');
  }
  const paymentRail = String(details.paymentRail || 'bank_transfer').trim().toLowerCase() || 'bank_transfer';
  const executionMode = parseExecutionMode(details.executionMode);
  const targetReturnRaw = Number(details.targetReturnPct);
  const riskPerTradeRaw = Number(details.riskPerTradePct);
  const targetReturnPct = roundUsd(clamp(Number.isFinite(targetReturnRaw) ? targetReturnRaw : state.config.targetReturnPct, 1, 200));
  const riskPerTradePct = roundUsd(clamp(Number.isFinite(riskPerTradeRaw) ? riskPerTradeRaw : state.config.riskPerTradePct, 0.1, 25));

  state.config.targetReturnPct = targetReturnPct;
  state.config.riskPerTradePct = riskPerTradePct;
  state.liveFunding = {
    ...(state.liveFunding || defaultState().liveFunding),
    accountHolder: accountLabel,
    broker,
    paymentRail,
    executionMode,
    riskAcknowledged,
    targetReturnPct,
    riskPerTradePct,
    status: state.liveFunding?.isFunded ? 'funded' : 'profile_saved'
  };
  const liveExecution = ensureLiveExecutionState(state);
  const brokerConnected = executionMode === 'broker_linked' && broker !== 'manual';
  liveExecution.brokerConnection = {
    isConnected: brokerConnected,
    broker,
    accountId: accountLabel,
    connectionStatus: brokerConnected ? 'connected' : 'manual_confirm_required',
    bridgeMode: executionMode,
    connectedAt: brokerConnected ? nowIso() : liveExecution.brokerConnection?.connectedAt || null
  };
  state.updatedAt = nowIso();
  return state;
}

function queueAiTradeForExecution(user, input = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  const symbol = normalizeSymbol(input.symbol || input.ticker || '');
  if (!symbol) {
    throw new Error('invalid_symbol');
  }
  const trendRaw = String(input.trend || input.direction || '').trim().toLowerCase();
  const trend = trendRaw === 'bearish' || trendRaw === 'short' ? 'bearish' : 'bullish';
  const confidencePct = roundUsd(clamp(Number(input.confidencePct || input.confidence || 0), 1, 100));
  const entryPrice = roundUsd(clamp(Number(input.entryPrice || input.entry || 0), 0.01, 1_000_000));
  const stopLoss = roundUsd(clamp(Number(input.stopLoss || 0), 0.01, 1_000_000));
  const takeProfit = roundUsd(clamp(Number(input.takeProfit || 0), 0.01, 1_000_000));
  const timeframe = String(input.timeframe || 'intraday').trim().toLowerCase().slice(0, 24) || 'intraday';
  const rationale = Array.isArray(input.rationale) ? input.rationale.slice(0, 5).map((line) => String(line).slice(0, 180)) : [];

  const queueItem = {
    queueId: `q-${hashString(`${userId}:${symbol}:${Date.now()}`)}`,
    symbol,
    trend,
    confidencePct,
    entryPrice,
    stopLoss,
    takeProfit,
    timeframe,
    rationale,
    source: 'ai_trade_module',
    status: 'pending',
    queuedAt: nowIso()
  };
  const liveExecution = ensureLiveExecutionState(state);
  liveExecution.queuedAiTrades = [queueItem, ...liveExecution.queuedAiTrades].slice(0, 60);
  state.updatedAt = nowIso();
  return {
    queued: queueItem,
    queueDepth: liveExecution.queuedAiTrades.filter((row) => row.status === 'pending').length
  };
}

function saveAutoTraderPaperTradingProfile(user, details = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const provider = String(details.provider || 'tradingview').trim().toLowerCase();
  if (provider !== 'tradingview') {
    throw new Error('invalid_paper_provider');
  }
  const tradingviewEmail = String(details.tradingviewEmail || details.email || '').trim().toLowerCase();
  if (!isValidEmail(tradingviewEmail)) {
    throw new Error('invalid_paper_email');
  }
  const startingCapitalUsd = roundUsd(Number(details.startingCapitalUsd));
  if (!Number.isFinite(startingCapitalUsd) || startingCapitalUsd < 100 || startingCapitalUsd > 10_000_000) {
    throw new Error('invalid_paper_capital');
  }
  const targetReturnRaw = Number(details.targetReturnPct);
  const riskPerTradeRaw = Number(details.riskPerTradePct);
  const targetReturnPct = roundUsd(clamp(Number.isFinite(targetReturnRaw) ? targetReturnRaw : 12, 1, 200));
  const riskPerTradePct = roundUsd(clamp(Number.isFinite(riskPerTradeRaw) ? riskPerTradeRaw : 1.5, 0.1, 25));
  const aiAccessEnabled = Boolean(details.aiAccessEnabled);
  if (!aiAccessEnabled) {
    throw new Error('invalid_paper_ai_access');
  }

  const state = getState(userId);
  state.tradingMode = 'paper';
  state.configured = true;
  state.isActive = true;
  state.cashUsd = startingCapitalUsd;
  state.totalDepositedUsd = startingCapitalUsd;
  state.config.targetReturnPct = targetReturnPct;
  state.config.riskPerTradePct = riskPerTradePct;
  state.paperTrading = {
    provider,
    isConnected: true,
    tradingviewEmail,
    tradingviewUsername: String(details.tradingviewUsername || '').trim().slice(0, 60),
    aiAccessEnabled: true,
    connectedAt: nowIso(),
    status: 'connected'
  };
  state.updatedAt = nowIso();
  return state;
}

function getAutoTraderPaperTradingProfile(user) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  return {
    configured: state.configured,
    tradingMode: state.tradingMode,
    cashUsd: state.cashUsd,
    totalDepositedUsd: state.totalDepositedUsd,
    config: state.config,
    paperTrading: state.paperTrading || defaultState().paperTrading,
    updatedAt: state.updatedAt
  };
}

function getLiveFundingProfile(user) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  return {
    configured: state.configured,
    tradingMode: state.tradingMode,
    fundingAccessPurchased: user?.plan === 'pro',
    cashUsd: state.cashUsd,
    totalDepositedUsd: state.totalDepositedUsd,
    config: state.config,
    liveFunding: state.liveFunding || defaultState().liveFunding,
    paperTrading: state.paperTrading || defaultState().paperTrading,
    fundingTransactions: (state.fundingTransactions || []).slice(0, 12),
    cycleHistory: (state.cycleHistory || []).slice(0, 12),
    updatedAt: state.updatedAt
  };
}

function getAutoTraderAccountView(user) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  const markedPositions = buildMarkedPositions(userId, state.openPositions || []);
  const openExposureUsd = roundUsd(markedPositions.reduce((sum, row) => sum + Number(row.marketValueUsd || 0), 0));
  const unrealizedPnlUsd = roundUsd(markedPositions.reduce((sum, row) => sum + Number(row.unrealizedPnlUsd || 0), 0));
  const realizedPnlUsd = roundUsd((state.cycleHistory || []).reduce((sum, row) => sum + Number(row.closedPnlUsd || 0), 0));
  const equityUsd = roundUsd(Number(state.cashUsd || 0) + openExposureUsd);
  const liveFunding = state.liveFunding || defaultState().liveFunding;
  const liveExecution = ensureLiveExecutionState(state);
  const broker = liveFunding.broker || 'manual';
  const accountHolder = liveFunding.accountHolder || 'live-account';

  return {
    account: {
      broker,
      accountLabel: accountHolder,
      accountReference: buildSyntheticAccountReference(userId, broker, accountHolder),
      executionMode: liveFunding.executionMode || 'manual_confirmed',
      riskAcknowledged: Boolean(liveFunding.riskAcknowledged),
      status: liveFunding.status || 'not_funded',
      fundedUsd: Number(liveFunding.fundedUsd || 0),
      fundedAt: liveFunding.fundedAt || null
    },
    bot: {
      configured: state.configured,
      isActive: state.isActive,
      tradingMode: state.tradingMode || 'paper',
      updatedAt: state.updatedAt
    },
    portfolio: {
      cashUsd: Number(state.cashUsd || 0),
      totalDepositedUsd: Number(state.totalDepositedUsd || 0),
      openExposureUsd,
      openPositionsCount: markedPositions.length,
      realizedPnlUsd,
      unrealizedPnlUsd,
      equityUsd
    },
    openPositions: markedPositions,
    activity: {
      recentFunding: (state.fundingTransactions || []).slice(0, 20),
      recentCycles: (state.cycleHistory || []).slice(0, 20)
    },
    execution: {
      brokerConnection: liveExecution.brokerConnection,
      queuedAiTrades: (liveExecution.queuedAiTrades || []).slice(0, 20),
      lastPlan: liveExecution.lastPlan || null,
      lastWebsiteSignalSnapshot: liveExecution.lastWebsiteSignalSnapshot || null
    },
    config: state.config,
    paperTrading: state.paperTrading || defaultState().paperTrading,
    safety: {
      mode: state.tradingMode === 'live' ? 'live_funding_mode' : 'paper_trading',
      paperTradingConnected: Boolean(state.paperTrading?.isConnected),
      disclaimer: state.tradingMode === 'live'
        ? 'Live funding is enabled. Direct broker order placement still requires broker API integration.'
        : 'Paper mode only. No real brokerage orders are sent.'
    }
  };
}

function getAutoTraderStatus(user) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  const liveExecution = ensureLiveExecutionState(state);
  return {
    configured: state.configured,
    isActive: state.isActive,
    tradingMode: state.tradingMode || 'paper',
    cashUsd: state.cashUsd,
    totalDepositedUsd: state.totalDepositedUsd,
    liveFunding: state.liveFunding || defaultState().liveFunding,
    paperTrading: state.paperTrading || defaultState().paperTrading,
    config: state.config,
    openPositions: state.openPositions,
    fundingTransactions: (state.fundingTransactions || []).slice(0, 10),
    cycleHistory: (state.cycleHistory || []).slice(0, 10),
    lastCycle: state.lastCycle,
    execution: {
      brokerConnection: liveExecution.brokerConnection,
      queuedAiTrades: (liveExecution.queuedAiTrades || []).slice(0, 20),
      lastPlan: liveExecution.lastPlan || null,
      lastWebsiteSignalSnapshot: liveExecution.lastWebsiteSignalSnapshot || null
    },
    updatedAt: state.updatedAt,
    sectorUniverse: Object.keys(SECTOR_UNIVERSE).map((sector) => ({
      sector,
      tickers: SECTOR_UNIVERSE[sector]
    })),
    safety: {
      mode: state.tradingMode === 'live' ? 'live_funding_mode' : 'paper_trading',
      liveBrokerConnected: false,
      paperTradingConnected: Boolean(state.paperTrading?.isConnected),
      disclaimer: state.tradingMode === 'live'
        ? 'Live funding is enabled, but direct broker placement still requires broker API integration.'
        : 'This bot is simulation-only and does not place real brokerage orders.'
    }
  };
}

function listAutoTraderSectors() {
  return Object.keys(SECTOR_UNIVERSE);
}

module.exports = {
  configureAutoTrader,
  setBotActive,
  setAutoTraderFundingMode,
  fundAutoTrader,
  getLiveFundingProfile,
  getAutoTraderPaperTradingProfile,
  saveAutoTraderPaperTradingProfile,
  saveAutoTraderLiveTradingProfile,
  queueAiTradeForExecution,
  getAutoTraderAccountView,
  runAutoTraderCycle,
  getAutoTraderStatus,
  listAutoTraderSectors
};
