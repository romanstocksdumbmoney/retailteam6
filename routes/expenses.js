const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { extractReceiptTextFromImage, extractReceiptTextFromVideo } = require('../services/ocrService');
const { parseReceiptText } = require('../services/receiptParser');
const { categorizeExpense, getSupportedCategories } = require('../services/categorizationService');
const { addExpense, readExpenses } = require('../services/expenseStore');
const { generateMonthlyReport } = require('../services/reportService');
const { buildMonthlyReportWorkbook } = require('../services/excelExportService');
const {
  PLAN_PRICE_USD,
  getSubscriptionTokenFromRequest,
  isSubscriptionActive,
} = require('../services/subscriptionService');

const router = express.Router();

const uploadsPath = path.join(process.cwd(), 'uploads');
fsSync.mkdirSync(uploadsPath, { recursive: true });
const upload = multer({
  dest: uploadsPath,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      callback(null, true);
      return;
    }

    callback(new Error('Only image or video files are supported for receipt scanning.'));
  },
});

function isValidMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const [year, monthNumber] = month.split('-').map((value) => Number.parseInt(value, 10));
  return year >= 2000 && monthNumber >= 1 && monthNumber <= 12;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function buildExpenseRecord({ vendor, total, expenseDate, category, matchedKeyword, ocrConfidence, rawText }) {
  return {
    id: uuidv4(),
    vendor,
    total,
    expenseDate: expenseDate || new Date().toISOString().slice(0, 10),
    category,
    matchedKeyword: matchedKeyword || null,
    currency: 'USD',
    ocrConfidence: Number((ocrConfidence || 0).toFixed(2)),
    rawText: rawText || '',
    createdAt: new Date().toISOString(),
  };
}

async function requireActiveSubscription(req, res, next) {
  try {
    // Test mode: if Stripe env is not configured, keep app usable for validation.
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
      next();
      return;
    }

    const token = getSubscriptionTokenFromRequest(req);
    const active = await isSubscriptionActive(token);
    if (active) {
      next();
      return;
    }

    res.status(402).json({
      error: 'An active $10/month Stripe subscription is required for this action.',
      monthlyPriceUsd: PLAN_PRICE_USD,
      instruction: 'Complete checkout via POST /api/subscription/checkout and confirm with POST /api/subscription/confirm.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate subscription.', details: error.message });
  }
}

router.post('/scan-receipt', requireActiveSubscription, upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'A receipt image or video file is required in field "receipt".' });
    return;
  }

  try {
    const shouldPersist = parseBoolean(req.query.persist, false);
    const isVideo = req.file.mimetype.startsWith('video/');
    const ocr = isVideo
      ? await extractReceiptTextFromVideo(req.file.path, uploadsPath)
      : await extractReceiptTextFromImage(req.file.path);
    const parsedReceipt = parseReceiptText(ocr.text);
    const categorization = categorizeExpense(parsedReceipt);
    const draft = buildExpenseRecord({
      vendor: parsedReceipt.vendor,
      total: parsedReceipt.total,
      expenseDate: parsedReceipt.expenseDate,
      category: categorization.category,
      matchedKeyword: categorization.matchedKeyword,
      ocrConfidence: ocr.confidence,
      rawText: parsedReceipt.rawText,
    });

    if (shouldPersist) {
      if (draft.total === null) {
        res.status(422).json({
          error: 'Receipt scanned, but total amount could not be determined. Review and correct before saving.',
          sourceType: isVideo ? 'video' : 'image',
          draft,
        });
        return;
      }

      await addExpense(draft);
      res.status(201).json({
        persisted: true,
        sourceType: isVideo ? 'video' : 'image',
        expense: draft,
      });
      return;
    }

    res.status(200).json({
      persisted: false,
      sourceType: isVideo ? 'video' : 'image',
      draft,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process the receipt media.', details: error.message });
  } finally {
    try {
      await fs.unlink(req.file.path);
    } catch (_error) {
      // Receipt files are temporary; ignore unlink failures.
    }
  }
});

router.get('/categories', (_req, res) => {
  res.json({ categories: getSupportedCategories() });
});

router.post('/', requireActiveSubscription, async (req, res) => {
  try {
    const payload = req.body || {};
    const vendor = String(payload.vendor || '').trim();
    const total = Number(payload.total);
    const expenseDate = String(payload.expenseDate || '').trim() || new Date().toISOString().slice(0, 10);
    const categoryInput = String(payload.category || '').trim();
    const categorization = categorizeExpense({ vendor, rawText: String(payload.rawText || '') });
    const category = categoryInput || categorization.category;

    if (!vendor) {
      res.status(400).json({ error: 'vendor is required.' });
      return;
    }
    if (!Number.isFinite(total) || total < 0) {
      res.status(400).json({ error: 'total must be a non-negative number.' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      res.status(400).json({ error: 'expenseDate must use YYYY-MM-DD format.' });
      return;
    }

    const expense = buildExpenseRecord({
      vendor,
      total: Number(total.toFixed(2)),
      expenseDate,
      category,
      matchedKeyword: categorization.matchedKeyword,
      ocrConfidence: Number(payload.ocrConfidence) || 0,
      rawText: String(payload.rawText || ''),
    });

    await addExpense(expense);
    res.status(201).json({ expense });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save expense.', details: error.message });
  }
});

router.get('/', requireActiveSubscription, async (req, res) => {
  try {
    const expenses = await readExpenses();
    const { month } = req.query;

    if (month) {
      if (!isValidMonth(month)) {
        res.status(400).json({ error: 'month must use YYYY-MM format.' });
        return;
      }

      res.json({
        month,
        expenses: expenses.filter((expense) => (expense.expenseDate || expense.createdAt || '').startsWith(month)),
      });
      return;
    }

    res.json({ expenses });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load expenses.', details: error.message });
  }
});

router.get('/monthly-report', requireActiveSubscription, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    if (!isValidMonth(month)) {
      res.status(400).json({ error: 'month must use YYYY-MM format.' });
      return;
    }

    const expenses = await readExpenses();
    const report = generateMonthlyReport(expenses, month);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to build monthly report.', details: error.message });
  }
});

router.get('/monthly-report.xlsx', requireActiveSubscription, async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    if (!isValidMonth(month)) {
      res.status(400).json({ error: 'month must use YYYY-MM format.' });
      return;
    }

    const expenses = await readExpenses();
    const report = generateMonthlyReport(expenses, month);
    const workbook = await buildMonthlyReportWorkbook(report);
    const fileBuffer = await workbook.xlsx.writeBuffer();
    const safeMonth = month.replace(/[^0-9-]/g, '');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="dumb-dollars-report-${safeMonth}.xlsx"`);
    res.status(200).send(Buffer.from(fileBuffer));
  } catch (error) {
    res.status(500).json({ error: 'Failed to build Excel report.', details: error.message });
  }
});

router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error) {
    res.status(400).json({ error: error.message || 'File upload failed.' });
    return;
  }
  next();
});

module.exports = router;
