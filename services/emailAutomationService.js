const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SETTINGS_BY_USER_ID = new Map();
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_AUTOMATION_STORE_FILE = String(
  process.env.EMAIL_AUTOMATION_STORE_FILE || path.join(__dirname, '..', 'data', 'email-automation.json')
).trim();
const REQUIRE_REAL_DELIVERY = String(process.env.EMAIL_AUTOMATION_REQUIRE_REAL_DELIVERY || '0').trim() === '1';

const EMAIL_HOST = String(process.env.NOTIFY_SMTP_HOST || process.env.SMTP_HOST || '').trim();
const EMAIL_PORT = Number.parseInt(String(process.env.NOTIFY_SMTP_PORT || process.env.SMTP_PORT || '587'), 10) || 587;
const EMAIL_SECURE = String(process.env.NOTIFY_SMTP_SECURE || process.env.SMTP_SECURE || '0').trim() === '1';
const EMAIL_USER = String(process.env.NOTIFY_SMTP_USER || process.env.SMTP_USER || '').trim();
const EMAIL_PASS = String(process.env.NOTIFY_SMTP_PASS || process.env.SMTP_PASS || '').trim();
const EMAIL_FROM = String(
  process.env.NOTIFY_SMTP_FROM || process.env.SMTP_FROM || 'DumbDollars Updates <no-reply@dumbdollars.local>'
).trim();

const PRO_MODULE_BULLETS = [
  'Notification Receiver + Contact Intake',
  'Pro Alerts Center',
  'Pro Backtest Lab',
  'Pro Watchlists + Auto Rules',
  'Pro Session Heatmap',
  'Pro Trade Journal Sync',
  'AI Flow Radar',
  'Earnings Reaction Planner',
  'Sector Rotation Leaderboard',
  'Smart Position Sizer',
  'Options Sweep Tape',
  'Volatility Regime Guard',
  'AI Scenario Builder'
];

let smtpTransport = null;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function safeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}

function nowIso() {
  return new Date().toISOString();
}

function ensureStoreDirExists() {
  const dir = path.dirname(EMAIL_AUTOMATION_STORE_FILE);
  fs.mkdirSync(dir, { recursive: true });
}

function parseDateMs(isoValue) {
  const parsed = Date.parse(String(isoValue || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return Boolean(fallback);
}

function normalizeCadenceDays(value, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(1, Math.min(30, Math.trunc(fallback) || 3));
  }
  return Math.max(1, Math.min(30, Math.trunc(parsed)));
}

function defaultSettingsForUser(user) {
  const userEmail = normalizeEmail(user?.email || '');
  return {
    id: `ema-${Math.random().toString(36).slice(2, 10)}`,
    userId: String(user?.id || '').trim(),
    email: userEmail,
    enabled: true,
    freePromoEnabled: true,
    proUpdateEnabled: true,
    cadenceDays: user?.plan === 'pro' ? 1 : 3,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastFreePromoSentAt: null,
    lastProUpdateSentAt: null,
    lastSentReason: null
  };
}

function sanitizeSettings(settings) {
  return {
    id: settings.id,
    userId: settings.userId,
    email: settings.email,
    enabled: Boolean(settings.enabled),
    freePromoEnabled: Boolean(settings.freePromoEnabled),
    proUpdateEnabled: Boolean(settings.proUpdateEnabled),
    cadenceDays: normalizeCadenceDays(settings.cadenceDays, 3),
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
    lastFreePromoSentAt: settings.lastFreePromoSentAt || null,
    lastProUpdateSentAt: settings.lastProUpdateSentAt || null,
    lastSentReason: settings.lastSentReason || null
  };
}

function persistSettingsToDisk() {
  try {
    ensureStoreDirExists();
    const records = [...SETTINGS_BY_USER_ID.values()].map((settings) => sanitizeSettings(settings));
    const payload = JSON.stringify({ settings: records }, null, 2);
    const tmpPath = `${EMAIL_AUTOMATION_STORE_FILE}.tmp`;
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, EMAIL_AUTOMATION_STORE_FILE);
  } catch (_error) {
    // Non-fatal. In-memory mode continues.
  }
}

function loadSettingsFromDisk() {
  try {
    if (!fs.existsSync(EMAIL_AUTOMATION_STORE_FILE)) {
      return;
    }
    const raw = fs.readFileSync(EMAIL_AUTOMATION_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed?.settings) ? parsed.settings : [];
    rows.forEach((row) => {
      const userId = String(row?.userId || '').trim();
      const email = normalizeEmail(row?.email || '');
      if (!userId || !email) {
        return;
      }
      SETTINGS_BY_USER_ID.set(userId, {
        id: String(row?.id || `ema-${Math.random().toString(36).slice(2, 10)}`),
        userId,
        email,
        enabled: toBoolean(row?.enabled, true),
        freePromoEnabled: toBoolean(row?.freePromoEnabled, true),
        proUpdateEnabled: toBoolean(row?.proUpdateEnabled, true),
        cadenceDays: normalizeCadenceDays(row?.cadenceDays, 3),
        createdAt: String(row?.createdAt || nowIso()),
        updatedAt: String(row?.updatedAt || nowIso()),
        lastFreePromoSentAt: row?.lastFreePromoSentAt ? String(row.lastFreePromoSentAt) : null,
        lastProUpdateSentAt: row?.lastProUpdateSentAt ? String(row.lastProUpdateSentAt) : null,
        lastSentReason: row?.lastSentReason ? safeText(row.lastSentReason, 80) : null
      });
    });
  } catch (_error) {
    // Ignore malformed persistence and continue with defaults.
  }
}

function getSmtpTransport() {
  if (smtpTransport) {
    return smtpTransport;
  }
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    return null;
  }
  smtpTransport = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_SECURE,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
  return smtpTransport;
}

function getOrCreateSettings(user) {
  if (!user?.id || !user?.email) {
    throw new Error('unauthorized');
  }
  const userId = String(user.id).trim();
  const userEmail = normalizeEmail(user.email);
  const existing = SETTINGS_BY_USER_ID.get(userId);
  if (existing) {
    existing.email = userEmail;
    existing.updatedAt = nowIso();
    SETTINGS_BY_USER_ID.set(userId, existing);
    return existing;
  }
  const created = defaultSettingsForUser(user);
  SETTINGS_BY_USER_ID.set(userId, created);
  persistSettingsToDisk();
  return created;
}

function getEmailAutomationSettings(user) {
  const settings = getOrCreateSettings(user);
  return {
    settings: sanitizeSettings(settings),
    accountEmail: normalizeEmail(user?.email || ''),
    transportReady: Boolean(getSmtpTransport())
  };
}

function saveEmailAutomationSettings(user, input = {}) {
  const settings = getOrCreateSettings(user);
  const accountEmail = normalizeEmail(user?.email || '');
  const confirmEmail = normalizeEmail(input.confirmEmail || input.email || '');
  if (!confirmEmail) {
    throw new Error('confirm_email_required');
  }
  if (confirmEmail !== accountEmail) {
    throw new Error('email_mismatch_account');
  }
  settings.email = accountEmail;
  settings.enabled = toBoolean(input.enabled, settings.enabled);
  settings.freePromoEnabled = toBoolean(input.freePromoEnabled, settings.freePromoEnabled);
  settings.proUpdateEnabled = toBoolean(input.proUpdateEnabled, settings.proUpdateEnabled);
  settings.cadenceDays = normalizeCadenceDays(input.cadenceDays, settings.cadenceDays);
  settings.updatedAt = nowIso();
  SETTINGS_BY_USER_ID.set(settings.userId, settings);
  persistSettingsToDisk();
  return {
    settings: sanitizeSettings(settings),
    accountEmail,
    transportReady: Boolean(getSmtpTransport())
  };
}

function resolveEmailType(user, requestedType = 'auto') {
  const normalized = String(requestedType || 'auto').trim().toLowerCase();
  if (normalized === 'auto' || !normalized) {
    return String(user?.plan || '').trim().toLowerCase() === 'pro' ? 'pro_update' : 'free_promo';
  }
  if (normalized === 'free_promo' || normalized === 'pro_update') {
    return normalized;
  }
  throw new Error('invalid_email_automation_type');
}

function buildFreePromoEmail(user, reason) {
  const greeting = safeText(user?.email || 'trader', 120);
  const intro = reason === 'signup'
    ? 'Welcome to DumbDollars. You are all set on the free plan.'
    : 'Here is a quick free-plan update from DumbDollars.';
  const body = [
    intro,
    '',
    'Upgrade to Pro when you are ready to unlock:',
    '- Trend Trades and premium social momentum tracking',
    '- High IV Tracker + premium spikes intelligence',
    '- Full Pro Preview Lab strategy tooling',
    '',
    `Signed in email: ${greeting}`,
    'Open dashboard: https://dumbdollars.app/'
  ].join('\n');
  return {
    subject: 'DumbDollars Free Plan — unlock Pro modules',
    body
  };
}

function buildProUpdateEmail(user, reason) {
  const intro = reason === 'pro_activated'
    ? 'Your Pro access is active. Here is what you can use right now.'
    : 'Pro update digest: modules and features currently available to your account.';
  const moduleLines = PRO_MODULE_BULLETS.map((line) => `- ${line}`).join('\n');
  const body = [
    intro,
    '',
    'Current Pro module stack:',
    moduleLines,
    '',
    'Tip: Open the Pro Preview Lab to test new modules before they are fully productionized.',
    'Open Pro Modules page: https://dumbdollars.app/pro-modules.html'
  ].join('\n');
  return {
    subject: 'DumbDollars Pro Update Digest',
    body
  };
}

function cadenceSatisfied(settings, type, reason, force = false) {
  if (force) {
    return true;
  }
  if (reason === 'signup' || reason === 'pro_activated' || reason === 'manual_test') {
    return true;
  }
  const lastSentAt = type === 'pro_update'
    ? settings.lastProUpdateSentAt
    : settings.lastFreePromoSentAt;
  if (!lastSentAt) {
    return true;
  }
  const lastMs = parseDateMs(lastSentAt);
  if (!lastMs) {
    return true;
  }
  const nextAllowedMs = lastMs + normalizeCadenceDays(settings.cadenceDays, 3) * DAY_MS;
  return Date.now() >= nextAllowedMs;
}

async function deliverEmail(email, content) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      channel: 'email',
      status: 'failed',
      provider: 'smtp',
      detail: 'missing_email',
      providerMessageId: null
    };
  }
  const transport = getSmtpTransport();
  if (!transport) {
    return {
      channel: 'email',
      status: 'preview',
      provider: 'smtp',
      detail: 'smtp_not_configured',
      providerMessageId: null
    };
  }
  try {
    const result = await transport.sendMail({
      from: EMAIL_FROM,
      to: normalizedEmail,
      subject: content.subject,
      text: content.body
    });
    return {
      channel: 'email',
      status: 'sent',
      provider: 'smtp',
      detail: null,
      providerMessageId: String(result?.messageId || '')
    };
  } catch (error) {
    return {
      channel: 'email',
      status: 'failed',
      provider: 'smtp',
      detail: safeText(error?.message || 'smtp_send_failed', 180),
      providerMessageId: null
    };
  }
}

async function sendEmailAutomationEvent(user, options = {}) {
  if (!user?.id || !user?.email) {
    throw new Error('unauthorized');
  }
  const reason = safeText(options.reason || 'manual', 80) || 'manual';
  const type = resolveEmailType(user, options.type || 'auto');
  const force = Boolean(options.force);
  const settings = getOrCreateSettings(user);

  if (!settings.enabled) {
    return {
      ok: false,
      skipped: true,
      reason: 'automation_disabled',
      type,
      settings: sanitizeSettings(settings)
    };
  }
  if (type === 'free_promo' && !settings.freePromoEnabled) {
    return {
      ok: false,
      skipped: true,
      reason: 'free_promo_disabled',
      type,
      settings: sanitizeSettings(settings)
    };
  }
  if (type === 'pro_update' && !settings.proUpdateEnabled) {
    return {
      ok: false,
      skipped: true,
      reason: 'pro_update_disabled',
      type,
      settings: sanitizeSettings(settings)
    };
  }
  if (!cadenceSatisfied(settings, type, reason, force)) {
    return {
      ok: false,
      skipped: true,
      reason: 'cadence_not_reached',
      type,
      settings: sanitizeSettings(settings)
    };
  }

  const content = type === 'pro_update'
    ? buildProUpdateEmail(user, reason)
    : buildFreePromoEmail(user, reason);
  const delivery = await deliverEmail(settings.email, content);
  if (delivery.status === 'failed' && REQUIRE_REAL_DELIVERY) {
    const error = new Error('email_delivery_failed');
    error.delivery = delivery;
    throw error;
  }

  if (delivery.status !== 'failed') {
    const now = nowIso();
    if (type === 'pro_update') {
      settings.lastProUpdateSentAt = now;
    } else {
      settings.lastFreePromoSentAt = now;
    }
    settings.lastSentReason = reason;
    settings.updatedAt = now;
    SETTINGS_BY_USER_ID.set(settings.userId, settings);
    persistSettingsToDisk();
  }

  return {
    ok: delivery.status === 'sent' || delivery.status === 'preview',
    skipped: false,
    type,
    reason,
    delivery,
    settings: sanitizeSettings(settings),
    subject: content.subject,
    previewBody: delivery.status === 'preview' ? content.body : null
  };
}

loadSettingsFromDisk();

module.exports = {
  getEmailAutomationSettings,
  saveEmailAutomationSettings,
  sendEmailAutomationEvent
};
