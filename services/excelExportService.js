const ExcelJS = require('exceljs');

function formatCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function buildMonthlyReportWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dumb Dollars Expense Reporter';
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Value', key: 'value', width: 22 },
  ];
  summarySheet.addRows([
    { metric: 'Month', value: report.month },
    { metric: 'Expense Count', value: report.expenseCount },
    { metric: 'Total Amount (USD)', value: formatCurrency(report.totalAmount) },
    { metric: 'Average Expense (USD)', value: formatCurrency(report.averageExpense) },
  ]);

  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getColumn('value').numFmt = '#,##0.00';
  summarySheet.getCell('B2').numFmt = 'General';
  summarySheet.getCell('B3').numFmt = 'General';

  const categorySheet = workbook.addWorksheet('By Category');
  categorySheet.columns = [
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Total (USD)', key: 'total', width: 22 },
  ];
  for (const item of report.byCategory || []) {
    categorySheet.addRow({
      category: item.category,
      total: formatCurrency(item.total),
    });
  }
  categorySheet.getRow(1).font = { bold: true };
  categorySheet.getColumn('total').numFmt = '#,##0.00';

  const vendorSheet = workbook.addWorksheet('By Vendor');
  vendorSheet.columns = [
    { header: 'Vendor', key: 'vendor', width: 32 },
    { header: 'Total (USD)', key: 'total', width: 22 },
  ];
  for (const item of report.byVendor || []) {
    vendorSheet.addRow({
      vendor: item.vendor,
      total: formatCurrency(item.total),
    });
  }
  vendorSheet.getRow(1).font = { bold: true };
  vendorSheet.getColumn('total').numFmt = '#,##0.00';

  const itemsSheet = workbook.addWorksheet('Items');
  itemsSheet.columns = [
    { header: 'ID', key: 'id', width: 40 },
    { header: 'Date', key: 'expenseDate', width: 16 },
    { header: 'Vendor', key: 'vendor', width: 28 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Total (USD)', key: 'total', width: 16 },
    { header: 'OCR Confidence', key: 'ocrConfidence', width: 16 },
    { header: 'Created At', key: 'createdAt', width: 28 },
  ];
  for (const item of report.items || []) {
    itemsSheet.addRow({
      id: item.id || '',
      expenseDate: item.expenseDate || '',
      vendor: item.vendor || '',
      category: item.category || 'Other',
      total: formatCurrency(item.total),
      ocrConfidence: Number(item.ocrConfidence || 0),
      createdAt: item.createdAt || '',
    });
  }
  itemsSheet.getRow(1).font = { bold: true };
  itemsSheet.getColumn('total').numFmt = '#,##0.00';
  itemsSheet.getColumn('ocrConfidence').numFmt = '0.00';

  return workbook;
}

module.exports = {
  buildMonthlyReportWorkbook,
};
