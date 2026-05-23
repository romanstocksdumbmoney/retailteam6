const crypto = require('crypto');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const SETTINGS_BY_USER_ID = new Map();
const MESSAGES_BY_USER_ID = new Map();
const MAX_MESSAGES_PER_USER = 120;
const VALID_CHANNELS = new Set(['email', 'sms', 'push']);
const TOPIC_LABELS = Object.freeze({
  'premium-spike': 'Premium Spike',
  'iv-break': 'IV Break',
  'trend-flip': 'Trend Flip',
  'watchlist-rule': 'Watchlist Rule Trigger',
  'journal-coaching': 'Journal Coaching',
  'backtest-update': 'Backtest Update',
  'session-heatmap': 'Session Heatmap Shift'
});
const VALID_TOPICS = new Set(Object.keys(TOPIC_LABELS));
const TOPIC_ALIASES = Object.freeze({
  'premium-spikes': 'premium-spike',
  'watchlist-rules': 'watchlist-rule',
  'trend-trades': 'trend-flip',
  'backtest-updates': 'backtest-update',
  'session-heatmap': 'session-heatmap',
  'journal-coaching': 'journal-coaching'
});
const TOPICS_REQUIRING_SYMBOL = new Set([
  'premium-spike',
  'iv-break',
  'trend-flip',
  'watchlist-rule',
  'journal-coaching',
  'session-heatmap'
]);

const REQUIRE_REAL_DELIVERY = String(
  process.env.NOTIFICATION_REQUIRE_REAL_DELIVERY || '1'
).trim() === '1';
const EMAIL_HOST = String(process.env.NOTIFY_SMTP_HOST || process.env.SMTP_HOST || '').trim();
const EMAIL_PORT = Number.parseInt(
  String(process.env.NOTIFY_SMTP_PORT || process.env.SMTP_PORT || '587'),
  10
) || 587;
const EMAIL_SECURE = String(process.env.NOTIFY_SMTP_SECURE || process.env.SMTP_SECURE || '0').trim() === '1';
const EMAIL_USER = String(process.env.NOTIFY_SMTP_USER || process.env.SMTP_USER || '').trim();
const EMAIL_PASS = String(process.env.NOTIFY_SMTP_PASS || process.env.SMTP_PASS || '').trim();
const EMAIL_FROM = String(
  process.env.NOTIFY_SMTP_FROM || process.env.SMTP_FROM || 'DumbDollars Notifications <no-reply@dumbdollars.local>'
).trim();
const TWILIO_ACCOUNT_SID = String(process.env.TWILIO_ACCOUNT_SID || process.env.NOTIFY_TWILIO_ACCOUNT_SID || '').trim();
const TWILIO_AUTH_TOKEN = String(process.env.TWILIO_AUTH_TOKEN || process.env.NOTIFY_TWILIO_AUTH_TOKEN || '').trim();
const TWILIO_FROM_NUMBER = String(process.env.TWILIO_FROM_NUMBER || process.env.NOTIFY_TWILIO_FROM_NUMBER || '').trim();

let smtpTransport = null;
let twilioClient = null;

function safeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}

function normalizeEmail(value) {
  return safeText(value, 254).toLowerCase();
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return raw.replace(/[^\d+]/g, '').slice(0, 20);
}

function normalizeName(value) {
  return safeText(value, 120);
}

function normalizeSymbol(value) {
  return safeText(value, 10).toUpperCase().replace(/[^A-Z.]/g, '');
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || '').trim());
}

function isLikelyPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function formatPhoneForDelivery(value) {
  const normalized = normalizePhone(value);
  if (!normalized) {
    return '';
  }
  if (normalized.startsWith('+')) {
    return normalized;
  }
  const digits = normalized.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function normalizeTopic(value) {
  const raw = safeText(value, 64).toLowerCase();
  if (!raw) {
    return '';
  }
  if (VALID_TOPICS.has(raw)) {
    return raw;
  }
  if (Object.prototype.hasOwnProperty.call(TOPIC_ALIASES, raw)) {
    return TOPIC_ALIASES[raw];
  }
  return '';
}

function normalizeTopicList(values) {
  const raw = Array.isArray(values)
    ? values
    : String(values || '').split(',');
  const deduped = [...new Set(raw.map((entry) => normalizeTopic(entry)).filter(Boolean))];
  return deduped;
}

function normalizeChannels(values) {
  const rawValues = Array.isArray(values)
    ? values
    : [String(values || '').trim()];
  const expanded = rawValues.flatMap((entry) => {
    const value = String(entry || '').trim().toLowerCase();
    if (!value) {
      return [];
    }
    if (value === 'both') {
      return ['email', 'sms'];
    }
    return [value];
  });
  const normalized = [...new Set(expanded.filter((entry) => VALID_CHANNELS.has(entry)))];
  return normalized.length ? normalized : ['email'];
}

function formatTopicLabel(topic) {
  return TOPIC_LABELS[topic] || safeText(topic, 60);
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

function getTwilioClient() {
  if (twilioClient) {
    return twilioClient;
  }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return null;
  }
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return twilioClient;
}

function sanitizeSettings(record) {
  return {
    id: record.id,
    fullName: record.fullName,
    email: record.email,
    phone: record.phone || null,
    channels: [...record.channels],
    topics: [...record.topics],
    notes: record.notes || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function sanitizeDeliveryAttempt(attempt) {
  return {
    channel: attempt.channel,
    status: attempt.status,
    provider: attempt.provider || null,
    detail: attempt.detail || null,
    providerMessageId: attempt.providerMessageId || null
  };
}

function sanitizeMessage(message) {
  return {
    id: message.id,
    topic: message.topic,
    topicLabel: message.topicLabel,
    channels: [...message.channels],
    toEmail: message.toEmail,
    toPhone: message.toPhone || null,
    subject: message.subject,
    body: message.body,
    generatedAt: message.generatedAt,
    source: {
      symbol: message.source?.symbol || null,
      detail: message.source?.detail || null
    },
    delivery: {
      sentCount: Number(message.delivery?.sentCount || 0),
      attempts: Array.isArray(message.delivery?.attempts)
        ? message.delivery.attempts.map((attempt) => sanitizeDeliveryAttempt(attempt))
        : []
    }
  };
}

function getSettingsRecord(user) {
  if (!user?.id) {
    return null;
  }
  return SETTINGS_BY_USER_ID.get(user.id) || null;
}

function getNotificationSettings(user) {
  const settings = getSettingsRecord(user);
  return {
    settings: settings ? sanitizeSettings(settings) : null
  };
}

function saveNotificationSettings(user, input = {}) {
  if (!user?.id) {
    throw new Error('unauthorized');
  }
  const email = normalizeEmail(input.email || user.email || '');
  const phone = normalizePhone(input.phone || '');
  const fullName = normalizeName(input.fullName || '');
  const channels = normalizeChannels(input.channels);
  const topics = normalizeTopicList(input.topics);
  const notes = safeText(input.notes, 280) || null;
  if (!isLikelyEmail(email)) {
    throw new Error('invalid_notification_email');
  }
  if (!fullName) {
    throw new Error('invalid_contact_name');
  }
  if (phone && !isLikelyPhone(phone)) {
    throw new Error('invalid_phone_number');
  }
  if (channels.includes('sms') && !phone) {
    throw new Error('invalid_phone_number');
  }
  if (!topics.length) {
    throw new Error('invalid_notification_topics');
  }
  const existing = getSettingsRecord(user);
  const now = new Date().toISOString();
  const next = {
    id: existing?.id || `ntf-${crypto.randomBytes(4).toString('hex')}`,
    fullName,
    email,
    phone,
    channels,
    topics,
    notes,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  SETTINGS_BY_USER_ID.set(user.id, next);
  if (!MESSAGES_BY_USER_ID.has(user.id)) {
    MESSAGES_BY_USER_ID.set(user.id, []);
  }
  return {
    settings: sanitizeSettings(next)
  };
}

function buildStructuredMessage(topic, context = {}) {
  const symbol = normalizeSymbol(context.symbol || '');
  const detail = safeText(context.detail, 220);
  const symbolLabel = symbol || 'your tracked symbols';
  switch (topic) {
    case 'premium-spike':
      return {
        subject: `Premium Spike Alert: ${symbolLabel}`,
        body: `Signal: Premium spike detected for ${symbolLabel}.\nWhy this was sent: You subscribed to Premium Spike notifications.\nContext: ${detail || 'Options premium flow moved beyond your watch threshold.'}\nAction: Review premium spike panel for volume, side, and timing details.`
      };
    case 'iv-break':
      return {
        subject: `IV Break Alert: ${symbolLabel}`,
        body: `Signal: Implied volatility break on ${symbolLabel}.\nWhy this was sent: You subscribed to IV Break notifications.\nContext: ${detail || 'IV crossed your configured trigger band.'}\nAction: Open High IV Tracker to confirm rank/percentile and catalyst risk.`
      };
    case 'trend-flip':
      return {
        subject: `Trend Flip Alert: ${symbolLabel}`,
        body: `Signal: Trend direction changed for ${symbolLabel}.\nWhy this was sent: You subscribed to Trend Flip notifications.\nContext: ${detail || 'Momentum score changed across monitored sources.'}\nAction: Validate with Trend Trades and confirm liquidity before acting.`
      };
    case 'watchlist-rule':
      return {
        subject: `Watchlist Rule Triggered: ${symbolLabel}`,
        body: `Signal: A watchlist rule matched for ${symbolLabel}.\nWhy this was sent: You enabled Watchlist Rule notifications.\nContext: ${detail || 'Your saved if/then condition was matched.'}\nAction: Review the exact rule conditions and recent flow data before execution.`
      };
    case 'journal-coaching':
      return {
        subject: `Journal Coaching Update: ${symbolLabel}`,
        body: `Signal: New coaching insight available for ${symbolLabel}.\nWhy this was sent: You subscribed to Journal Coaching notifications.\nContext: ${detail || 'A new post-trade pattern was detected in your journal.'}\nAction: Open Trade Journal Sync and apply the suggested discipline adjustment.`
      };
    case 'backtest-update':
      return {
        subject: 'Backtest Update Ready',
        body: `Signal: New backtest summary generated.\nWhy this was sent: You subscribed to Backtest Update notifications.\nContext: ${detail || 'A configured strategy replay completed.'}\nAction: Review win rate, expectancy, and drawdown before changing live risk.`
      };
    case 'session-heatmap':
      return {
        subject: `Session Heatmap Shift: ${symbolLabel}`,
        body: `Signal: Session strength changed for ${symbolLabel}.\nWhy this was sent: You subscribed to Session Heatmap notifications.\nContext: ${detail || 'A different market session became dominant.'}\nAction: Confirm whether your entry timing still aligns with strongest session behavior.`
      };
    default:
      return {
        subject: `${formatTopicLabel(topic)} Update`,
        body: `Signal: ${formatTopicLabel(topic)} event.\nContext: ${detail || 'A monitored topic changed state.'}`
      };
  }
}

async function deliverEmail(settings, message) {
  if (!settings.email) {
    return {
      channel: 'email',
      status: 'failed',
      provider: 'smtp',
      detail: 'contact_email_missing',
      providerMessageId: null
    };
  }
  const transport = getSmtpTransport();
  if (!transport) {
    return {
      channel: 'email',
      status: 'failed',
      provider: 'smtp',
      detail: 'smtp_not_configured',
      providerMessageId: null
    };
  }
  try {
    const result = await transport.sendMail({
      from: EMAIL_FROM,
      to: settings.email,
      subject: message.subject,
      text: message.body
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

async function deliverSms(settings, message) {
  const destination = formatPhoneForDelivery(settings.phone);
  if (!destination) {
    return {
      channel: 'sms',
      status: 'failed',
      provider: 'twilio',
      detail: 'phone_missing_or_invalid',
      providerMessageId: null
    };
  }
  const client = getTwilioClient();
  if (!client) {
    return {
      channel: 'sms',
      status: 'failed',
      provider: 'twilio',
      detail: 'twilio_not_configured',
      providerMessageId: null
    };
  }
  const compactBody = `${message.subject}\n${message.body}`.slice(0, 1200);
  try {
    const result = await client.messages.create({
      body: compactBody,
      from: TWILIO_FROM_NUMBER,
      to: destination
    });
    return {
      channel: 'sms',
      status: 'sent',
      provider: 'twilio',
      detail: null,
      providerMessageId: String(result?.sid || '')
    };
  } catch (error) {
    return {
      channel: 'sms',
      status: 'failed',
      provider: 'twilio',
      detail: safeText(error?.message || 'twilio_send_failed', 180),
      providerMessageId: null
    };
  }
}

async function deliverPush(message) {
  return {
    channel: 'push',
    status: 'failed',
    provider: 'push',
    detail: 'push_provider_not_configured',
    providerMessageId: null
  };
}

function listNotificationMessages(user, options = {}) {
  if (!user?.id) {
    return { total: 0, messages: [] };
  }
  const requestedLimit = Number(options.limit || 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
    : 20;
  const items = Array.isArray(MESSAGES_BY_USER_ID.get(user.id))
    ? MESSAGES_BY_USER_ID.get(user.id)
    : [];
  return {
    total: items.length,
    messages: items
      .slice(-limit)
      .reverse()
      .map((item) => sanitizeMessage(item))
  };
}

async function buildAndSendNotificationMessage(user, input = {}) {
  if (!user?.id) {
    throw new Error('unauthorized');
  }
  const settings = getSettingsRecord(user);
  if (!settings) {
    throw new Error('notification_settings_required');
  }
  const topic = normalizeTopic(input.topic);
  if (!topic) {
    throw new Error('invalid_notification_topic');
  }
  if (!settings.topics.includes(topic)) {
    throw new Error('topic_not_enabled_for_contact');
  }
  const symbol = normalizeSymbol(input.symbol || '');
  if (TOPICS_REQUIRING_SYMBOL.has(topic) && !symbol) {
    throw new Error('invalid_notification_symbol');
  }
  const detail = safeText(input.detail, 220) || null;
  const structured = buildStructuredMessage(topic, { symbol, detail });
  const now = new Date().toISOString();
  const message = {
    id: `msg-${crypto.randomBytes(4).toString('hex')}`,
    topic,
    topicLabel: formatTopicLabel(topic),
    channels: [...settings.channels],
    toEmail: settings.email,
    toPhone: settings.phone || null,
    subject: structured.subject,
    body: structured.body,
    generatedAt: now,
    source: {
      symbol: symbol || null,
      detail
    },
    delivery: {
      sentCount: 0,
      attempts: []
    }
  };
  const attempts = [];
  for (const channel of settings.channels) {
    // eslint-disable-next-line no-await-in-loop
    const attempt = channel === 'email'
      ? await deliverEmail(settings, message)
      : (channel === 'sms'
        ? await deliverSms(settings, message)
        : await deliverPush(message));
    attempts.push(attempt);
  }
  const sentCount = attempts.filter((attempt) => attempt.status === 'sent').length;
  message.delivery = {
    sentCount,
    attempts
  };

  if (sentCount === 0 && REQUIRE_REAL_DELIVERY) {
    const error = new Error('notification_delivery_failed');
    error.deliveryAttempts = attempts.map((attempt) => sanitizeDeliveryAttempt(attempt));
    throw error;
  }

  const queue = Array.isArray(MESSAGES_BY_USER_ID.get(user.id))
    ? MESSAGES_BY_USER_ID.get(user.id)
    : [];
  queue.push(message);
  while (queue.length > MAX_MESSAGES_PER_USER) {
    queue.shift();
  }
  MESSAGES_BY_USER_ID.set(user.id, queue);
  return {
    settings: sanitizeSettings(settings),
    message: sanitizeMessage(message),
    delivery: {
      sentCount,
      attempts: attempts.map((attempt) => sanitizeDeliveryAttempt(attempt))
    }
  };
}

module.exports = {
  getNotificationSettings,
  saveNotificationSettings,
  listNotificationMessages,
  buildAndSendNotificationMessage
};
