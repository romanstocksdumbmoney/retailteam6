const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COMPLAINT_STORE_FILE = String(process.env.COMPLAINT_STORE_FILE || path.join(process.cwd(), 'data', 'complaints.json')).trim();
const MAX_STORED_COMPLAINTS = 5000;
const REVIEW_STATUSES = new Set(['open', 'investigating', 'fixed', 'closed']);
const CATEGORIES = new Set(['bug', 'billing', 'login', 'navigation', 'ai-copilot', 'trading', 'other']);

const complaintsById = new Map();

function nowIso() {
  return new Date().toISOString();
}

function safeTrim(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeCategory(value) {
  const normalized = safeTrim(value, 40).toLowerCase();
  if (CATEGORIES.has(normalized)) {
    return normalized;
  }
  return 'other';
}

function normalizeReviewStatus(value) {
  const normalized = safeTrim(value, 32).toLowerCase();
  if (!REVIEW_STATUSES.has(normalized)) {
    throw new Error('invalid_complaint_status');
  }
  return normalized;
}

function ensureStoreDirExists() {
  const dir = path.dirname(COMPLAINT_STORE_FILE);
  fs.mkdirSync(dir, { recursive: true });
}

function parseIsoTimestamp(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

function normalizePagePath(value) {
  const raw = safeTrim(value, 240);
  if (!raw) {
    return '/';
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function normalizeComplaintRecord(record) {
  const ticketId = safeTrim(record?.ticketId, 120);
  const message = safeTrim(record?.message, 1400);
  if (!ticketId || message.length < 8) {
    return null;
  }
  return {
    ticketId,
    status: REVIEW_STATUSES.has(String(record?.status || '').toLowerCase()) ? String(record.status).toLowerCase() : 'open',
    category: normalizeCategory(record?.category),
    message,
    pagePath: normalizePagePath(record?.pagePath),
    createdAt: String(record?.createdAt || nowIso()),
    updatedAt: String(record?.updatedAt || nowIso()),
    reporter: {
      userId: safeTrim(record?.reporter?.userId, 120) || null,
      userEmail: safeTrim(record?.reporter?.userEmail, 254).toLowerCase() || null,
      contactEmail: safeTrim(record?.reporter?.contactEmail, 254).toLowerCase() || null,
      userAgent: safeTrim(record?.reporter?.userAgent, 280) || null
    },
    details: {
      pageTitle: safeTrim(record?.details?.pageTitle, 120) || null,
      note: safeTrim(record?.details?.note, 500) || null
    },
    resolutionNote: safeTrim(record?.resolutionNote, 600) || null
  };
}

function loadComplaintsFromDisk() {
  try {
    if (!fs.existsSync(COMPLAINT_STORE_FILE)) {
      return;
    }
    const raw = fs.readFileSync(COMPLAINT_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed?.complaints) ? parsed.complaints : [];
    records.forEach((record) => {
      const normalized = normalizeComplaintRecord(record);
      if (!normalized || complaintsById.has(normalized.ticketId)) {
        return;
      }
      complaintsById.set(normalized.ticketId, normalized);
    });
  } catch (_error) {
    // Fail open: complaint system still works in memory.
  }
}

function persistComplaintsToDisk() {
  try {
    ensureStoreDirExists();
    const records = [...complaintsById.values()];
    const payload = JSON.stringify({ complaints: records }, null, 2);
    const tmpPath = `${COMPLAINT_STORE_FILE}.tmp`;
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, COMPLAINT_STORE_FILE);
  } catch (_error) {
    // Fail open: runtime should continue.
  }
}

function trimOldComplaints() {
  if (complaintsById.size <= MAX_STORED_COMPLAINTS) {
    return;
  }
  const ordered = [...complaintsById.values()]
    .sort((a, b) => parseIsoTimestamp(a.createdAt) - parseIsoTimestamp(b.createdAt));
  const removeCount = complaintsById.size - MAX_STORED_COMPLAINTS;
  for (let index = 0; index < removeCount; index += 1) {
    const ticketId = ordered[index]?.ticketId;
    if (ticketId && complaintsById.has(ticketId)) {
      complaintsById.delete(ticketId);
    }
  }
}

function createTicketId() {
  return `cmp-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function sanitizePublic(record) {
  return {
    ticketId: record.ticketId,
    status: record.status,
    category: record.category,
    message: record.message,
    pagePath: record.pagePath,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    resolutionNote: record.resolutionNote || null
  };
}

function sanitizeReview(record) {
  return {
    ...sanitizePublic(record),
    reporter: {
      userId: record.reporter?.userId || null,
      userEmail: record.reporter?.userEmail || null,
      contactEmail: record.reporter?.contactEmail || null
    },
    details: {
      pageTitle: record.details?.pageTitle || null,
      note: record.details?.note || null,
      userAgent: record.reporter?.userAgent || null
    }
  };
}

function createComplaintTicket(input = {}, context = {}) {
  const message = safeTrim(input.message, 1400);
  if (message.length < 8) {
    throw new Error('invalid_complaint_message');
  }
  const createdAt = nowIso();
  const ticket = {
    ticketId: createTicketId(),
    status: 'open',
    category: normalizeCategory(input.category),
    message,
    pagePath: normalizePagePath(input.pagePath || context.pagePath),
    createdAt,
    updatedAt: createdAt,
    reporter: {
      userId: safeTrim(context?.user?.id, 120) || null,
      userEmail: safeTrim(context?.user?.email, 254).toLowerCase() || null,
      contactEmail: safeTrim(input.contactEmail || input.email, 254).toLowerCase() || null,
      userAgent: safeTrim(input.userAgent || context.userAgent, 280) || null
    },
    details: {
      pageTitle: safeTrim(input.pageTitle, 120) || null,
      note: safeTrim(input.note, 500) || null
    },
    resolutionNote: null
  };
  complaintsById.set(ticket.ticketId, ticket);
  trimOldComplaints();
  persistComplaintsToDisk();
  return sanitizePublic(ticket);
}

function getComplaintTicket(ticketId) {
  const key = safeTrim(ticketId, 120);
  if (!key || !complaintsById.has(key)) {
    return null;
  }
  return sanitizePublic(complaintsById.get(key));
}

function listComplaintTicketsForReview(input = {}) {
  const requestedLimit = Number(input.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, Math.trunc(requestedLimit))) : 50;
  const statusFilter = String(input.status || '').trim().toLowerCase();
  const records = [...complaintsById.values()]
    .filter((record) => (statusFilter ? record.status === statusFilter : true))
    .sort((a, b) => parseIsoTimestamp(b.createdAt) - parseIsoTimestamp(a.createdAt))
    .slice(0, limit)
    .map((record) => sanitizeReview(record));
  return {
    total: records.length,
    complaints: records
  };
}

function updateComplaintTicketStatus(ticketId, input = {}) {
  const key = safeTrim(ticketId, 120);
  if (!key || !complaintsById.has(key)) {
    throw new Error('complaint_not_found');
  }
  const status = normalizeReviewStatus(input.status);
  const record = complaintsById.get(key);
  record.status = status;
  record.updatedAt = nowIso();
  record.resolutionNote = safeTrim(input.resolutionNote, 600) || null;
  complaintsById.set(record.ticketId, record);
  persistComplaintsToDisk();
  return sanitizeReview(record);
}

loadComplaintsFromDisk();

module.exports = {
  createComplaintTicket,
  getComplaintTicket,
  listComplaintTicketsForReview,
  updateComplaintTicketStatus
};
