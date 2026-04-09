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
const ALLOWED_CONNECTION_METHODS = new Set(['api_keys', 'existing_account']);
const ALLOWED_TWO_FACTOR_MODES = new Set(['none', 'sms', 'totp']);
const ALLOWED_PROMPT_MODES = new Set(['strict', 'balanced', 'exploratory']);
const PROMPT_TICKER_STOPWORDS = new Set([
  'AI',
  'USD',
  'TOTP',
  'SMS',
  'ETF',
  'OTC',
  'LONG',
  'SHORT',
  'BULL',
  'BEAR',
  'SWING',
  'DAY',
  'RISK'
]);
const BROKER_SETUP_DOCS = Object.freeze({
  robinhood: 'https://robinhood.com/signup',
  webull: 'https://www.webull.com/help',
  'interactive-brokers': 'https://www.interactivebrokers.com/en/accounts/open-account-country-list.php',
  tradestation: 'https://www.tradestation.com/why-tradestation/',
  manual: 'https://dumbdollars.org/ai-implementation-steps.html'
});

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
        connectedAt: null,
        permissions: {
          canRead: false,
          canTrade: false,
          canViewAccount: false
        },
        auth: {
          connectionMethod: 'api_keys',
          apiKeyLast4: '',
          secretSaved: false,
          passphraseSaved: false,
          credentialFingerprint: '',
          loginUsernameMasked: '',
          loginSaved: false,
          twoFactorMode: 'none',
          otpProvided: false
        },
        lastTestedAt: null,
        lastTestResult: null
      },
      queuedAiTrades: [],
      brokerOrderHistory: [],
      promptActivity: [],
      lastBrokerExecution: null,
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
  if (!state.liveExecution.brokerConnection.permissions || typeof state.liveExecution.brokerConnection.permissions !== 'object') {
    state.liveExecution.brokerConnection.permissions = defaultState().liveExecution.brokerConnection.permissions;
  }
  if (!state.liveExecution.brokerConnection.auth || typeof state.liveExecution.brokerConnection.auth !== 'object') {
    state.liveExecution.brokerConnection.auth = defaultState().liveExecution.brokerConnection.auth;
  } else {
    state.liveExecution.brokerConnection.auth = {
      ...defaultState().liveExecution.brokerConnection.auth,
      ...state.liveExecution.brokerConnection.auth
    };
  }
  if (!Array.isArray(state.liveExecution.queuedAiTrades)) {
    state.liveExecution.queuedAiTrades = [];
  }
  if (!Array.isArray(state.liveExecution.brokerOrderHistory)) {
    state.liveExecution.brokerOrderHistory = [];
  }
  if (!Array.isArray(state.liveExecution.promptActivity)) {
    state.liveExecution.promptActivity = [];
  }
  if (!state.liveExecution.lastBrokerExecution || typeof state.liveExecution.lastBrokerExecution !== 'object') {
    state.liveExecution.lastBrokerExecution = null;
  }
  return state.liveExecution;
}

function maskLast4(value) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!clean) {
    return '';
  }
  return clean.slice(-4).toUpperCase();
}

function hashCredentialFingerprint(parts = []) {
  return hashString(parts.map((part) => String(part || '').trim()).join('|')).toString(16).toUpperCase();
}

function toTitle(value) {
  return String(value || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseConnectionMethod(rawMethod) {
  const method = String(rawMethod || 'api_keys').trim().toLowerCase();
  if (!ALLOWED_CONNECTION_METHODS.has(method)) {
    throw new Error('invalid_connection_method');
  }
  return method;
}

function parseTwoFactorMode(rawMode) {
  const mode = String(rawMode || 'none').trim().toLowerCase();
  if (!ALLOWED_TWO_FACTOR_MODES.has(mode)) {
    throw new Error('invalid_two_factor_mode');
  }
  return mode;
}

function maskLoginIdentifier(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }
  if (value.includes('@')) {
    const [localPart, domainPart] = value.split('@');
    const safeLocal = localPart.length > 2
      ? `${localPart.slice(0, 2)}***`
      : `${localPart.slice(0, 1)}***`;
    return `${safeLocal}@${domainPart || 'hidden'}`;
  }
  if (value.length <= 2) {
    return `${value.charAt(0)}***`;
  }
  return `${value.slice(0, 2)}***${value.slice(-1)}`;
}

function getBrokerSetupSteps(state, broker) {
  const liveExecution = ensureLiveExecutionState(state);
  const connection = liveExecution.brokerConnection || {};
  const permissions = connection.permissions || {};
  const auth = connection.auth || {};
  const liveFunding = state.liveFunding || defaultState().liveFunding;
  const executionMode = String(liveFunding.executionMode || 'manual_confirmed').toLowerCase();
  const liveMode = String(state.tradingMode || 'paper').toLowerCase() === 'live';

  const hasAccount = Boolean(String(connection.accountId || '').trim());
  const permissionsReady = Boolean(permissions.canRead && permissions.canTrade && permissions.canViewAccount);
  const authMethod = parseConnectionMethod(auth.connectionMethod || 'api_keys');
  const credentialsReady = authMethod === 'existing_account'
    ? Boolean(auth.loginSaved && auth.loginUsernameMasked)
    : Boolean(auth.apiKeyLast4 && auth.secretSaved);
  const bridgeReady = executionMode === 'broker_linked';
  const testedReady = Boolean(connection.lastTestResult?.readyForTrading);
  const fundedReady = Boolean(liveFunding.isFunded);

  return [
    {
      key: 'open-account',
      title: `Open and verify your ${toTitle(broker)} brokerage account`,
      description: 'Complete KYC, enable 2FA, and make sure trading permissions are active on your broker account.',
      completed: hasAccount
    },
    {
      key: 'api-access',
      title: 'Enable API permissions in broker settings',
      description: 'Grant read/account/trade permissions and keep withdrawal permissions disabled for safety.',
      completed: permissionsReady
    },
    {
      key: 'add-credentials',
      title: 'Connect broker credentials to DumbDollars',
      description: 'Use API keys or existing broker sign-in credentials to create the AI execution bridge profile.',
      completed: credentialsReady
    },
    {
      key: 'bridge-mode',
      title: 'Switch Live Funding execution mode to Broker Linked',
      description: 'Set execution mode to broker_linked so execution tickets can be sent through the broker bridge.',
      completed: bridgeReady
    },
    {
      key: 'test-connection',
      title: 'Run broker bridge connection test',
      description: 'Validate credential format, permissions, funding mode, and execution readiness before auto cycles.',
      completed: testedReady
    },
    {
      key: 'activate-ai',
      title: 'Activate live AI execution cycle',
      description: 'Keep bot active in live mode, with funded capital and broker bridge connected.',
      completed: Boolean(liveMode && fundedReady && testedReady && bridgeReady)
    }
  ];
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

function parsePromptControl(prompt) {
  const rawPrompt = String(prompt || '').trim();
  const text = rawPrompt.toLowerCase();
  const isLong = /\b(long|bull|bullish|uptrend|only long|buy dips)\b/.test(text);
  const isShort = /\b(short|bear|bearish|downtrend|only short)\b/.test(text);
  const directionPreference = isLong && !isShort
    ? 'long'
    : isShort && !isLong
      ? 'short'
      : 'neutral';
  const uppercaseHints = (rawPrompt.match(/\b[A-Z]{2,5}\b/g) || [])
    .map((entry) => normalizeSymbol(entry))
    .filter((entry) => entry && !PROMPT_TICKER_STOPWORDS.has(entry));
  const prefixedHints = [...rawPrompt.matchAll(/\$([A-Za-z]{1,5})\b/g)]
    .map((entry) => normalizeSymbol(entry[1]))
    .filter(Boolean);
  const preferredTickers = [...new Set([...prefixedHints, ...uppercaseHints])].slice(0, 12);
  const avoidTickers = [...text.matchAll(/\b(?:avoid|skip|exclude)\s+\$?([a-z]{1,5})\b/g)]
    .map((entry) => normalizeSymbol(entry[1]))
    .filter(Boolean)
    .slice(0, 12);
  const preferredSectors = Object.keys(SECTOR_UNIVERSE)
    .filter((sector) => text.includes(sector.toLowerCase()))
    .slice(0, 6);
  const guidance = [];
  if (directionPreference !== 'neutral') {
    guidance.push(`Direction preference: ${directionPreference.toUpperCase()}`);
  }
  if (preferredTickers.length > 0) {
    guidance.push(`Preferred symbols: ${preferredTickers.join(', ')}`);
  }
  if (avoidTickers.length > 0) {
    guidance.push(`Avoid symbols: ${avoidTickers.join(', ')}`);
  }
  if (preferredSectors.length > 0) {
    guidance.push(`Preferred sectors: ${preferredSectors.join(', ')}`);
  }
  if (guidance.length === 0) {
    guidance.push('No strict prompt constraints detected. Using market signals + risk controls.');
  }
  return {
    rawPrompt,
    directionPreference,
    preferredTickers,
    avoidTickers,
    preferredSectors,
    guidance
  };
}

function summarizePromptAdherence(trades, promptControl) {
  const rows = Array.isArray(trades) ? trades : [];
  if (rows.length === 0) {
    return {
      score: 0,
      matchedTrades: 0,
      totalTrades: 0,
      note: 'No trades placed in this cycle.'
    };
  }
  const matchedTrades = rows.filter((trade) => Number(trade?.promptAlignment?.score || 0) >= 60).length;
  const avgScore = Math.round(rows.reduce((sum, trade) => sum + Number(trade?.promptAlignment?.score || 0), 0) / rows.length);
  const strictness = promptControl.preferredTickers.length + promptControl.avoidTickers.length + (promptControl.directionPreference !== 'neutral' ? 1 : 0);
  return {
    score: avgScore,
    matchedTrades,
    totalTrades: rows.length,
    strictness,
    note: `${matchedTrades}/${rows.length} trade(s) met prompt alignment threshold.`
  };
}

function buildControlCenterPayload(state, liveExecution) {
  const promptControl = parsePromptControl(state.config?.prompt || '');
  const promptActivity = (liveExecution.promptActivity || []).slice(0, 20);
  return {
    directControlLink: '/ai-bot-trader.html',
    currentPrompt: state.config?.prompt || '',
    promptControl,
    promptActivity,
    promptTips: [
      'Be explicit: include long/short bias, sectors, and max position ideas.',
      'Use ticker symbols (for example: NVDA, AAPL) to prioritize names.',
      'If you want exclusions, write "avoid TSLA" or "skip GME".'
    ]
  };
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
    sourceOrderId: trade.id,
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

function executeAutoTraderBrokerOrders(user, input = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  if (!state.configured) {
    throw new Error('bot_not_configured');
  }
  if (String(state.tradingMode || 'paper').toLowerCase() !== 'live') {
    throw new Error('live_mode_required');
  }
  if (!state.liveFunding?.isFunded) {
    throw new Error('live_funding_required');
  }
  const liveExecution = ensureLiveExecutionState(state);
  const brokerConnection = liveExecution.brokerConnection || {};
  const broker = parseBrokerOrThrow(
    brokerConnection.broker || state.liveFunding?.broker || 'manual'
  );
  if (broker === 'manual' || !brokerConnection.isConnected) {
    throw new Error('broker_not_connected');
  }
  if (!brokerConnection.permissions?.canTrade) {
    throw new Error('trade_permission_missing');
  }

  const lastPlan = liveExecution.lastPlan || {};
  const planTickets = Array.isArray(lastPlan.orderTickets) ? lastPlan.orderTickets : [];
  if (!planTickets.length) {
    throw new Error('no_order_tickets');
  }

  const requestedTicketIds = Array.isArray(input.ticketIds)
    ? input.ticketIds.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 20)
    : [];
  const selectedTickets = requestedTicketIds.length
    ? planTickets.filter((ticket) => requestedTicketIds.includes(String(ticket.ticketId || '').trim()))
    : planTickets;

  if (requestedTicketIds.length && selectedTickets.length === 0) {
    throw new Error('ticket_not_found');
  }

  const readyTickets = selectedTickets.filter((ticket) => Boolean(ticket.readyForBrokerApi));
  if (!readyTickets.length) {
    throw new Error('no_ready_tickets');
  }

  const submittedAt = nowIso();
  const brokerOrders = readyTickets.map((ticket, index) => {
    const seed = hashString(`${userId}:${ticket.ticketId}:${submittedAt}:${index}`);
    const accepted = pseudoRandom(seed) >= 0.08;
    const brokerOrderId = accepted ? `brk-${hashString(`${ticket.ticketId}:${submittedAt}`)}` : null;
    return {
      brokerOrderId,
      ticketId: ticket.ticketId,
      sourceOrderId: ticket.sourceOrderId || null,
      broker,
      status: accepted ? 'submitted' : 'rejected',
      submittedAt,
      reason: accepted
        ? null
        : 'Broker adapter rejected this order payload. Review order fields and retry.',
      orderPayload: ticket.orderPayload
    };
  });

  const orderByTicket = {};
  brokerOrders.forEach((order) => {
    orderByTicket[order.ticketId] = order;
  });

  liveExecution.lastPlan = {
    ...lastPlan,
    generatedAt: lastPlan.generatedAt || submittedAt,
    orderTickets: planTickets.map((ticket) => {
      const submitted = orderByTicket[ticket.ticketId];
      if (!submitted) {
        return ticket;
      }
      return {
        ...ticket,
        brokerSubmission: {
          status: submitted.status,
          submittedAt: submitted.submittedAt,
          brokerOrderId: submitted.brokerOrderId,
          reason: submitted.reason
        }
      };
    }),
    manualActionRequired: planTickets.some((ticket) => {
      const submitted = orderByTicket[ticket.ticketId];
      if (!submitted) {
        return !Boolean(ticket.readyForBrokerApi);
      }
      return submitted.status !== 'submitted';
    })
  };

  // Mark queue entries that generated a now-submitted broker order.
  const submittedOrderIds = new Set(
    brokerOrders
      .filter((row) => row.status === 'submitted')
      .map((row) => row.sourceOrderId)
      .filter(Boolean)
  );
  liveExecution.queuedAiTrades = (liveExecution.queuedAiTrades || []).map((row) => {
    if (!submittedOrderIds.has(row.consumedByOrderId)) {
      return row;
    }
    return {
      ...row,
      status: 'submitted_to_broker',
      brokerSubmittedAt: submittedAt
    };
  });

  liveExecution.brokerOrderHistory = [
    ...brokerOrders,
    ...(liveExecution.brokerOrderHistory || [])
  ].slice(0, 120);
  liveExecution.lastBrokerExecution = {
    submittedAt,
    broker,
    selectedTickets: selectedTickets.length,
    submittedCount: brokerOrders.filter((row) => row.status === 'submitted').length,
    rejectedCount: brokerOrders.filter((row) => row.status === 'rejected').length,
    requestedTicketIds: requestedTicketIds.length ? requestedTicketIds : null
  };
  state.updatedAt = nowIso();

  return {
    submittedAt,
    broker,
    selectedTickets: selectedTickets.length,
    submittedCount: liveExecution.lastBrokerExecution.submittedCount,
    rejectedCount: liveExecution.lastBrokerExecution.rejectedCount,
    manualActionRequired: liveExecution.lastPlan.manualActionRequired,
    orders: brokerOrders
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
  const promptControl = parsePromptControl(state.config.prompt);
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
    const promptSectors = promptControl.preferredSectors
      .filter((sectorName) => state.config.sectors.includes(sectorName));
    const sector = promptSectors.length > 0
      ? promptSectors[i % promptSectors.length]
      : state.config.sectors[i % state.config.sectors.length];
    const sectorNames = Object.keys(SECTOR_UNIVERSE);
    const pickedSector = sector || sectorNames[Math.floor(pseudoRandom(seed + i * 3) * sectorNames.length)];
    const sectorTickers = SECTOR_UNIVERSE[pickedSector] || SECTOR_UNIVERSE.Technology;
    const preferredBySector = websiteSignals.rankedSymbols.filter((symbol) => sectorTickers.includes(symbol));
    const fallbackPreferred = websiteSignals.rankedSymbols.filter((symbol) => !candidateTrades.some((trade) => trade.ticker === symbol));
    const promptPreferredTicker = promptControl.preferredTickers
      .find((symbol) => !candidateTrades.some((trade) => trade.ticker === symbol));
    const pickedPreferred = promptPreferredTicker || preferredBySector[0] || fallbackPreferred[0];
    const ticker = normalizeSymbol(pickedPreferred || sectorTickers[Math.floor(pseudoRandom(seed + i * 5 + 1) * sectorTickers.length)]);
    if (promptControl.avoidTickers.includes(ticker)) {
      continue;
    }
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
    const promptDirection = promptControl.directionPreference !== 'neutral'
      ? promptControl.directionPreference
      : null;
    const direction = queueDirection
      || trendDirection
      || promptDirection
      || outlookDirection
      || getDirectionFromPrompt(state.config.prompt, seed + i * 13);
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
    const promptReasons = [
      promptControl.preferredTickers.includes(ticker) ? 'prompt_ticker' : null,
      promptDirection && direction === promptDirection ? 'prompt_direction' : null,
      promptControl.preferredSectors.includes(pickedSector) ? 'prompt_sector' : null,
      queueDirection ? 'ai_trade_queue' : null,
      trendDirection ? 'trend_signal' : null
    ].filter(Boolean);
    trade.promptAlignment = {
      score: Math.max(0, Math.min(100, 45 + promptReasons.length * 12)),
      reasons: promptReasons,
      explanation: promptReasons.length
        ? `Aligned via: ${promptReasons.join(', ')}`
        : 'No direct prompt alignment factors matched; market signals used.'
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
  const promptAdherence = summarizePromptAdherence(candidateTrades, promptControl);
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
    promptControl,
    promptAdherence,
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
  const liveExecution = ensureLiveExecutionState(state);
  liveExecution.lastPlan = {
    generatedAt: cycle.executedAt,
    tradingMode: state.tradingMode,
    executionMode: state.liveFunding?.executionMode || 'manual_confirmed',
    broker: state.liveFunding?.broker || 'manual',
    promptControl,
    promptAdherence,
    orderTickets: candidateTrades.map((trade) => trade.executionTicket),
    manualActionRequired: candidateTrades.some((trade) => !Boolean(trade.executionTicket?.readyForBrokerApi))
  };
  liveExecution.promptActivity = [
    {
      at: cycle.executedAt,
      action: 'cycle_run',
      prompt: String(state.config.prompt || '').slice(0, 220),
      openedTrades: candidateTrades.length,
      promptAdherenceScore: promptAdherence.score
    },
    ...(liveExecution.promptActivity || [])
  ].slice(0, 80);
  state.updatedAt = nowIso();
  return cycle;
}

function setAutoTraderPrompt(user, input = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  if (!state.configured) {
    throw new Error('bot_not_configured');
  }
  const prompt = String(input.prompt || '').trim().slice(0, 500);
  if (!prompt) {
    throw new Error('invalid_prompt');
  }
  state.config = {
    ...(state.config || defaultConfig()),
    prompt
  };
  state.updatedAt = nowIso();
  const promptControl = parsePromptControl(prompt);
  const liveExecution = ensureLiveExecutionState(state);
  liveExecution.promptActivity = [
    {
      at: state.updatedAt,
      action: 'prompt_update',
      prompt: prompt.slice(0, 220),
      promptGuidance: promptControl.guidance.slice(0, 4)
    },
    ...(liveExecution.promptActivity || [])
  ].slice(0, 80);
  let cycle = null;
  if (Boolean(input.runNow)) {
    if (!state.isActive) {
      state.isActive = true;
    }
    cycle = runAutoTraderCycle(user);
  }
  return {
    prompt: state.config.prompt,
    promptControl,
    cycle,
    bot: getAutoTraderStatus(user)
  };
}

function updateAutoTraderPromptControl(user, input = {}) {
  const promptMode = String(input.promptMode || 'balanced').trim().toLowerCase();
  if (!ALLOWED_PROMPT_MODES.has(promptMode)) {
    throw new Error('invalid_prompt_mode');
  }
  const source = String(input.source || 'control_center').trim().slice(0, 60) || 'control_center';
  const note = String(input.note || '').trim().slice(0, 200);
  const result = setAutoTraderPrompt(user, {
    prompt: input.prompt,
    runNow: Boolean(input.runNow)
  });
  const state = getState(user?.id);
  const liveExecution = ensureLiveExecutionState(state);
  if (liveExecution.promptActivity.length > 0) {
    liveExecution.promptActivity[0] = {
      ...liveExecution.promptActivity[0],
      promptMode,
      source,
      note: note || null
    };
  }
  return {
    promptMode,
    source,
    note: note || null,
    promptControl: result.promptControl,
    cycle: result.cycle,
    bot: result.bot
  };
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
  const existingConnection = liveExecution.brokerConnection || defaultState().liveExecution.brokerConnection;
  const brokerChanged = String(existingConnection.broker || 'manual') !== broker;
  const preserveConnection = !brokerChanged && Boolean(existingConnection.isConnected);
  liveExecution.brokerConnection = {
    isConnected: preserveConnection,
    broker,
    accountId: accountLabel,
    connectionStatus: preserveConnection
      ? 'connected'
      : executionMode === 'broker_linked'
        ? 'awaiting_api_connection'
        : 'manual_confirm_required',
    bridgeMode: executionMode,
    connectedAt: preserveConnection ? existingConnection.connectedAt || nowIso() : null,
    permissions: preserveConnection
      ? existingConnection.permissions
      : {
        canRead: false,
        canTrade: false,
        canViewAccount: false
      },
    auth: preserveConnection
      ? {
        ...defaultState().liveExecution.brokerConnection.auth,
        ...(existingConnection.auth || {})
      }
      : { ...defaultState().liveExecution.brokerConnection.auth },
    lastTestedAt: preserveConnection ? existingConnection.lastTestedAt || null : null,
    lastTestResult: preserveConnection ? existingConnection.lastTestResult || null : null
  };
  state.updatedAt = nowIso();
  return state;
}

function getAutoTraderBrokerConnectionGuide(user, options = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  const liveExecution = ensureLiveExecutionState(state);
  const requestedBroker = String(options.broker || '').trim().toLowerCase();
  const broker = requestedBroker
    ? parseBrokerOrThrow(requestedBroker)
    : parseBrokerOrThrow(state.liveFunding?.broker || liveExecution.brokerConnection?.broker || 'manual');
  const connection = liveExecution.brokerConnection || defaultState().liveExecution.brokerConnection;
  const steps = getBrokerSetupSteps(state, broker);
  return {
    broker,
    brokerLabel: toTitle(broker),
    docsUrl: BROKER_SETUP_DOCS[broker] || BROKER_SETUP_DOCS.manual,
    current: {
      ...(connection || {}),
      bridgeMode: String(state.liveFunding?.executionMode || connection.bridgeMode || 'manual_confirmed'),
      accountId: connection.accountId || state.liveFunding?.accountHolder || ''
    },
    funding: {
      tradingMode: state.tradingMode || 'paper',
      isFunded: Boolean(state.liveFunding?.isFunded),
      fundedUsd: Number(state.liveFunding?.fundedUsd || 0),
      status: state.liveFunding?.status || 'not_funded'
    },
    steps
  };
}

function connectAutoTraderBrokerBridge(user, details = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  const broker = parseBrokerOrThrow(details.broker);
  if (broker === 'manual') {
    throw new Error('invalid_broker_connection');
  }
  const accountId = String(details.accountId || details.accountLabel || details.accountHolder || '').trim();
  if (!accountId || accountId.length > 80) {
    throw new Error('invalid_account_id');
  }
  const connectionMethod = parseConnectionMethod(details.connectionMethod || details.authMethod || 'api_keys');
  const apiKey = String(details.apiKey || '').trim();
  const apiSecret = String(details.apiSecret || '').trim();
  const passphrase = String(details.passphrase || '').trim();
  const loginUsername = String(details.loginUsername || details.email || '').trim();
  const loginPassword = String(details.loginPassword || '').trim();
  const twoFactorMode = parseTwoFactorMode(details.twoFactorMode || details.twoFactor || 'none');
  const otpCode = String(details.otpCode || '').trim();
  if (connectionMethod === 'api_keys' && (apiKey.length < 8 || apiSecret.length < 8)) {
    throw new Error('invalid_api_credentials');
  }
  if (connectionMethod === 'existing_account') {
    if (!loginUsername || loginUsername.length > 120 || loginPassword.length < 8 || loginPassword.length > 160) {
      throw new Error('invalid_existing_login');
    }
    if (otpCode && (otpCode.length < 4 || otpCode.length > 12)) {
      throw new Error('invalid_otp_code');
    }
  }
  const permissions = {
    canRead: Boolean(details.canRead ?? details.permissionRead),
    canTrade: Boolean(details.canTrade ?? details.permissionTrade),
    canViewAccount: Boolean(details.canViewAccount ?? details.permissionAccount)
  };
  if (!(permissions.canRead && permissions.canTrade && permissions.canViewAccount)) {
    throw new Error('invalid_broker_permissions');
  }
  const riskAcknowledged = Boolean(details.riskAcknowledged || details.riskAcknowledgement);
  if (!riskAcknowledged) {
    throw new Error('invalid_risk_acknowledgement');
  }

  const bridgeMode = parseExecutionMode(details.bridgeMode || details.executionMode || 'broker_linked');
  const paymentRail = String(details.paymentRail || state.liveFunding?.paymentRail || 'bank_transfer').trim().toLowerCase() || 'bank_transfer';
  state.liveFunding = {
    ...(state.liveFunding || defaultState().liveFunding),
    broker,
    accountHolder: accountId,
    executionMode: bridgeMode,
    paymentRail,
    riskAcknowledged,
    status: state.liveFunding?.isFunded ? 'funded' : 'profile_saved'
  };

  const credentialFingerprint = connectionMethod === 'existing_account'
    ? hashCredentialFingerprint([broker, accountId, loginUsername, loginPassword, twoFactorMode, otpCode])
    : hashCredentialFingerprint([broker, accountId, apiKey, apiSecret, passphrase]);
  const liveExecution = ensureLiveExecutionState(state);
  liveExecution.brokerConnection = {
    isConnected: bridgeMode === 'broker_linked',
    broker,
    accountId,
    connectionStatus: bridgeMode === 'broker_linked' ? 'connected' : 'manual_confirm_required',
    bridgeMode,
    connectedAt: bridgeMode === 'broker_linked' ? nowIso() : null,
    permissions,
    auth: {
      connectionMethod,
      apiKeyLast4: connectionMethod === 'api_keys' ? maskLast4(apiKey) : '',
      secretSaved: connectionMethod === 'api_keys',
      passphraseSaved: connectionMethod === 'api_keys' && Boolean(passphrase),
      credentialFingerprint,
      loginUsernameMasked: connectionMethod === 'existing_account' ? maskLoginIdentifier(loginUsername) : '',
      loginSaved: connectionMethod === 'existing_account',
      twoFactorMode,
      otpProvided: connectionMethod === 'existing_account' && Boolean(otpCode)
    },
    lastTestedAt: null,
    lastTestResult: null
  };
  state.updatedAt = nowIso();
  return getAutoTraderBrokerConnectionGuide(user, { broker });
}

function testAutoTraderBrokerBridge(user, options = {}) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  const liveExecution = ensureLiveExecutionState(state);
  const connection = liveExecution.brokerConnection || defaultState().liveExecution.brokerConnection;
  const broker = parseBrokerOrThrow(options.broker || connection.broker || state.liveFunding?.broker || 'manual');
  if (broker === 'manual') {
    throw new Error('invalid_broker_connection');
  }
  const permissions = connection.permissions || {};
  const auth = connection.auth || {};
  const connectionMethod = parseConnectionMethod(auth.connectionMethod || 'api_keys');
  const bridgeMode = String(state.liveFunding?.executionMode || connection.bridgeMode || 'manual_confirmed').toLowerCase();
  const liveMode = String(state.tradingMode || 'paper').toLowerCase() === 'live';
  const twoFactorMode = parseTwoFactorMode(auth.twoFactorMode || 'none');

  const credentialsOk = connectionMethod === 'existing_account'
    ? Boolean(auth.loginSaved && auth.loginUsernameMasked)
    : Boolean(auth.apiKeyLast4 && auth.secretSaved);
  const credentialDetail = connectionMethod === 'existing_account'
    ? (auth.loginUsernameMasked
      ? `Existing broker login saved for ${auth.loginUsernameMasked}`
      : 'Missing broker login credentials in connection profile.')
    : (auth.apiKeyLast4
      ? `API key ending in ${auth.apiKeyLast4} saved`
      : 'Missing API key/secret in broker connection profile.');

  const checks = [
    {
      key: 'credentials',
      label: 'Credentials saved',
      ok: credentialsOk,
      detail: credentialDetail
    },
    {
      key: 'auth_method',
      label: 'Authentication method selected',
      ok: Boolean(connectionMethod),
      detail: connectionMethod === 'existing_account'
        ? `Using existing account sign-in (${twoFactorMode.toUpperCase()} 2FA mode)`
        : 'Using API key/secret credentials'
    },
    {
      key: 'two_factor',
      label: '2FA handoff readiness',
      ok: connectionMethod === 'existing_account' && twoFactorMode !== 'none'
        ? Boolean(auth.otpProvided)
        : true,
      detail: connectionMethod === 'existing_account' && twoFactorMode !== 'none'
        ? `2FA mode ${twoFactorMode.toUpperCase()} requires a fresh code before running live orders.`
        : 'No active one-time-code requirement.'
    },
    {
      key: 'permissions',
      label: 'Broker API permissions',
      ok: Boolean(permissions.canRead && permissions.canTrade && permissions.canViewAccount),
      detail: `Read=${Boolean(permissions.canRead)}, Trade=${Boolean(permissions.canTrade)}, Account=${Boolean(permissions.canViewAccount)}`
    },
    {
      key: 'bridge_mode',
      label: 'Execution mode is broker_linked',
      ok: bridgeMode === 'broker_linked',
      detail: `Current execution mode: ${bridgeMode}`
    },
    {
      key: 'funding',
      label: 'Live account funded',
      ok: Boolean(state.liveFunding?.isFunded),
      detail: `Funded capital: $${Number(state.liveFunding?.fundedUsd || 0).toLocaleString()}`
    },
    {
      key: 'live_mode',
      label: 'Trading mode is live',
      ok: liveMode,
      detail: `Current trading mode: ${state.tradingMode || 'paper'}`
    }
  ];

  const bridgeCheckKeys = new Set(['credentials', 'auth_method', 'two_factor', 'permissions', 'bridge_mode']);
  const bridgeReady = checks
    .filter((check) => bridgeCheckKeys.has(check.key))
    .every((check) => check.ok);
  const readyForTrading = bridgeReady && checks
    .filter((check) => check.key === 'funding' || check.key === 'live_mode')
    .every((check) => check.ok);
  const testedAt = nowIso();
  liveExecution.brokerConnection = {
    ...connection,
    broker,
    bridgeMode,
    isConnected: bridgeReady,
    connectionStatus: bridgeReady
      ? (readyForTrading ? 'connected' : 'connected_pending_live_requirements')
      : 'connection_incomplete',
    connectedAt: bridgeReady ? (connection.connectedAt || testedAt) : null,
    lastTestedAt: testedAt,
    lastTestResult: {
      bridgeReady,
      readyForTrading,
      checks
    }
  };
  state.updatedAt = nowIso();

  const failedBridgeChecks = checks.filter((check) => bridgeCheckKeys.has(check.key) && !check.ok);
  const missingLiveChecks = checks.filter((check) => (check.key === 'funding' || check.key === 'live_mode') && !check.ok);
  return {
    broker,
    testedAt,
    bridgeReady,
    readyForTrading,
    checks,
    nextActions: failedBridgeChecks.length > 0
      ? failedBridgeChecks.map((check) => `Fix: ${check.label}`)
      : missingLiveChecks.map((check) => `For live execution, complete: ${check.label}`),
    guide: getAutoTraderBrokerConnectionGuide(user, { broker })
  };
}

function disconnectAutoTraderBrokerBridge(user) {
  const userId = user?.id;
  if (!userId) {
    throw new Error('missing_user');
  }
  const state = getState(userId);
  const liveExecution = ensureLiveExecutionState(state);
  const previousBroker = String(liveExecution.brokerConnection?.broker || state.liveFunding?.broker || 'manual');
  liveExecution.brokerConnection = defaultState().liveExecution.brokerConnection;
  state.liveFunding = {
    ...(state.liveFunding || defaultState().liveFunding),
    broker: 'manual',
    executionMode: 'manual_confirmed'
  };
  state.updatedAt = nowIso();
  return {
    disconnected: true,
    previousBroker,
    guide: getAutoTraderBrokerConnectionGuide(user, { broker: 'manual' })
  };
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
  const setupBroker = parseBrokerOrThrow(liveFunding.broker || liveExecution.brokerConnection?.broker || 'manual');

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
      recentBrokerOrders: (liveExecution.brokerOrderHistory || []).slice(0, 20),
      lastBrokerExecution: liveExecution.lastBrokerExecution || null,
      lastPlan: liveExecution.lastPlan || null,
      lastWebsiteSignalSnapshot: liveExecution.lastWebsiteSignalSnapshot || null,
      promptControl: parsePromptControl(state.config?.prompt || ''),
      promptActivity: (liveExecution.promptActivity || []).slice(0, 20),
      controlCenter: buildControlCenterPayload(state, liveExecution),
      setup: {
        docsUrl: BROKER_SETUP_DOCS[setupBroker] || BROKER_SETUP_DOCS.manual,
        steps: getBrokerSetupSteps(state, setupBroker)
      }
    },
    config: state.config,
    paperTrading: state.paperTrading || defaultState().paperTrading,
    safety: {
      mode: state.tradingMode === 'live' ? 'live_funding_mode' : 'paper_trading',
      liveBrokerConnected: Boolean(liveExecution?.brokerConnection?.isConnected),
      paperTradingConnected: Boolean(state.paperTrading?.isConnected),
      disclaimer: state.tradingMode === 'live'
        ? 'Live funding is enabled. Use the broker bridge to submit execution tickets and verify fills in your broker account.'
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
      recentBrokerOrders: (liveExecution.brokerOrderHistory || []).slice(0, 20),
      lastBrokerExecution: liveExecution.lastBrokerExecution || null,
      lastPlan: liveExecution.lastPlan || null,
      lastWebsiteSignalSnapshot: liveExecution.lastWebsiteSignalSnapshot || null,
      promptControl: parsePromptControl(state.config?.prompt || ''),
      promptActivity: (liveExecution.promptActivity || []).slice(0, 20),
      controlCenter: buildControlCenterPayload(state, liveExecution),
      setup: {
        docsUrl: BROKER_SETUP_DOCS[parseBrokerOrThrow(state.liveFunding?.broker || liveExecution.brokerConnection?.broker || 'manual')] || BROKER_SETUP_DOCS.manual,
        steps: getBrokerSetupSteps(state, parseBrokerOrThrow(state.liveFunding?.broker || liveExecution.brokerConnection?.broker || 'manual'))
      }
    },
    updatedAt: state.updatedAt,
    sectorUniverse: Object.keys(SECTOR_UNIVERSE).map((sector) => ({
      sector,
      tickers: SECTOR_UNIVERSE[sector]
    })),
    safety: {
      mode: state.tradingMode === 'live' ? 'live_funding_mode' : 'paper_trading',
      liveBrokerConnected: Boolean(liveExecution?.brokerConnection?.isConnected),
      paperTradingConnected: Boolean(state.paperTrading?.isConnected),
      disclaimer: state.tradingMode === 'live'
        ? 'Live funding is enabled. Broker bridge tickets can be submitted when the connection test passes.'
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
  getAutoTraderBrokerConnectionGuide,
  connectAutoTraderBrokerBridge,
  testAutoTraderBrokerBridge,
  disconnectAutoTraderBrokerBridge,
  queueAiTradeForExecution,
  updateAutoTraderPromptControl,
  setAutoTraderPrompt,
  executeAutoTraderBrokerOrders,
  getAutoTraderAccountView,
  runAutoTraderCycle,
  getAutoTraderStatus,
  listAutoTraderSectors
};
