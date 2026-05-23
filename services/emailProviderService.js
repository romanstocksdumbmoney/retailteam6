const nodemailer = require('nodemailer');

let sendgridMail = null;
try {
  // Optional dependency. Gracefully degrades to SMTP when unavailable.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  sendgridMail = require('@sendgrid/mail');
} catch (_error) {
  sendgridMail = null;
}

const SENDGRID_API_KEY = String(process.env.SENDGRID_API_KEY || '').trim();
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number.parseInt(String(process.env.SMTP_PORT || '587'), 10) || 587;
const SMTP_SECURE = String(process.env.SMTP_SECURE || '0').trim() === '1';
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASSWORD = String(process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim();
const SENDER_EMAIL = String(
  process.env.SENDER_EMAIL
  || process.env.SMTP_FROM
  || 'reports@dumbdollars.org'
).trim();
const SENDER_NAME = String(process.env.SENDER_NAME || 'DumbDollars').trim();

let smtpTransport = null;
let sendgridConfigured = false;

function htmlToText(html) {
  const value = String(html || '');
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFromAddress() {
  if (SENDER_EMAIL.includes('<')) {
    return SENDER_EMAIL;
  }
  return `${SENDER_NAME} <${SENDER_EMAIL}>`;
}

function getSmtpTransport() {
  if (smtpTransport) {
    return smtpTransport;
  }
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    return null;
  }
  smtpTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD
    }
  });
  return smtpTransport;
}

function setupSendGridIfNeeded() {
  if (!sendgridMail || !SENDGRID_API_KEY) {
    return false;
  }
  if (!sendgridConfigured) {
    sendgridMail.setApiKey(SENDGRID_API_KEY);
    sendgridConfigured = true;
  }
  return true;
}

async function sendWithSendGrid({ to, subject, html, text }) {
  setupSendGridIfNeeded();
  if (!sendgridConfigured) {
    throw new Error('sendgrid_not_configured');
  }
  const payload = {
    to,
    from: getFromAddress(),
    subject,
    text: text || htmlToText(html || ''),
    html: html || undefined
  };
  const [response] = await sendgridMail.send(payload);
  return {
    provider: 'sendgrid',
    status: Number(response?.statusCode || 202) >= 200 && Number(response?.statusCode || 202) < 300
      ? 'sent'
      : 'failed',
    messageId: String(response?.headers?.['x-message-id'] || ''),
    detail: null
  };
}

async function sendWithSmtp({ to, subject, html, text }) {
  const transport = getSmtpTransport();
  if (!transport) {
    throw new Error('smtp_not_configured');
  }
  const result = await transport.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text: text || htmlToText(html || ''),
    html: html || undefined
  });
  return {
    provider: 'smtp',
    status: 'sent',
    messageId: String(result?.messageId || ''),
    detail: null
  };
}

function providerReadiness() {
  return {
    sendgrid: Boolean(sendgridMail && SENDGRID_API_KEY),
    smtp: Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD),
    selected: Boolean(sendgridMail && SENDGRID_API_KEY) ? 'sendgrid' : 'smtp'
  };
}

async function sendEmail(input = {}) {
  const to = String(input.to || '').trim();
  const subject = String(input.subject || '').trim();
  const html = String(input.html || '').trim();
  const text = String(input.text || '').trim();
  if (!to || !subject) {
    throw new Error('invalid_email_payload');
  }
  if (setupSendGridIfNeeded()) {
    try {
      return await sendWithSendGrid({ to, subject, html, text });
    } catch (error) {
      if (!getSmtpTransport()) {
        throw error;
      }
    }
  }
  return sendWithSmtp({ to, subject, html, text });
}

module.exports = {
  providerReadiness,
  sendEmail,
  htmlToText
};
