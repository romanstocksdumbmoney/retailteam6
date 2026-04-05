const test = require('node:test');
const assert = require('node:assert/strict');

const { parseReceiptText } = require('../services/receiptParser');
const { categorizeExpense } = require('../services/categorizationService');
const { generateMonthlyReport } = require('../services/reportService');

test('parseReceiptText extracts vendor, total, and date', () => {
  const sampleText = `
    ACME CAFE
    123 Main St
    Date: 04/03/2026
    Latte 5.00
    Sandwich 10.00
    Total 15.00
  `;

  const parsed = parseReceiptText(sampleText);
  assert.equal(parsed.vendor, 'ACME CAFE');
  assert.equal(parsed.total, 15);
  assert.equal(parsed.expenseDate, '2026-04-03');
});

test('categorizeExpense maps known vendors to categories', () => {
  const categorization = categorizeExpense({
    vendor: 'Uber Trip',
    rawText: 'Thank you for riding with Uber',
  });

  assert.equal(categorization.category, 'Transportation');
  assert.equal(categorization.matchedKeyword, 'uber');
});

test('generateMonthlyReport aggregates totals correctly', () => {
  const expenses = [
    { vendor: 'ACME CAFE', total: 15, category: 'Meals', expenseDate: '2026-04-03' },
    { vendor: 'Uber', total: 20, category: 'Transportation', expenseDate: '2026-04-10' },
    { vendor: 'ACME CAFE', total: 10, category: 'Meals', expenseDate: '2026-04-17' },
    { vendor: 'Other', total: 99, category: 'Other', expenseDate: '2026-03-17' },
  ];

  const report = generateMonthlyReport(expenses, '2026-04');

  assert.equal(report.expenseCount, 3);
  assert.equal(report.totalAmount, 45);
  assert.equal(report.averageExpense, 15);
  assert.deepEqual(report.byCategory, [
    { category: 'Meals', total: 25 },
    { category: 'Transportation', total: 20 },
  ]);
  assert.equal(report.byVendor[0].vendor, 'ACME CAFE');
  assert.equal(report.byVendor[0].total, 25);
});
