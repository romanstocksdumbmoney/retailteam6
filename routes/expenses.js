const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { extractReceiptText } = require('../services/ocrService');
const { parseReceiptText } = require('../services/receiptParser');
const { categorizeExpense } = require('../services/categorizationService');
const { addExpense, readExpenses } = require('../services/expenseStore');
const { generateMonthlyReport } = require('../services/reportService');

const router = express.Router();

const uploadsPath = path.join(process.cwd(), 'uploads');
fsSync.mkdirSync(uploadsPath, { recursive: true });
const upload = multer({
  dest: uploadsPath,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype.startsWith('image/')) {
      callback(null, true);
      return;
    }

    callback(new Error('Only image files are supported for receipt scanning.'));
  },
});

function isValidMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const [year, monthNumber] = month.split('-').map((value) => Number.parseInt(value, 10));
  return year >= 2000 && monthNumber >= 1 && monthNumber <= 12;
}

router.post('/scan-receipt', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'A receipt image file is required in field "receipt".' });
    return;
  }

  try {
    const ocr = await extractReceiptText(req.file.path);
    const parsedReceipt = parseReceiptText(ocr.text);
    const categorization = categorizeExpense(parsedReceipt);

    if (parsedReceipt.total === null) {
      res.status(422).json({
        error: 'Receipt was scanned, but total amount could not be determined.',
        parsed: parsedReceipt,
      });
      return;
    }

    const expense = {
      id: uuidv4(),
      vendor: parsedReceipt.vendor,
      total: parsedReceipt.total,
      expenseDate: parsedReceipt.expenseDate || new Date().toISOString().slice(0, 10),
      category: categorization.category,
      matchedKeyword: categorization.matchedKeyword,
      currency: 'USD',
      ocrConfidence: Number((ocr.confidence || 0).toFixed(2)),
      rawText: parsedReceipt.rawText,
      createdAt: new Date().toISOString(),
    };

    await addExpense(expense);
    res.status(201).json({ expense });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process the receipt image.', details: error.message });
  } finally {
    try {
      await fs.unlink(req.file.path);
    } catch (_error) {
      // Receipt files are temporary; ignore unlink failures.
    }
  }
});

router.get('/', async (req, res) => {
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

router.get('/monthly-report', async (req, res) => {
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

module.exports = router;
