# Expense Reporting App

This app lets you upload receipt photos, extract receipt fields (vendor, total, date), auto-categorize expenses, and generate a monthly report.

## Features

- Receipt image upload (`jpg`, `png`, etc.)
- OCR-based text extraction from the receipt image
- Automatic parsing:
  - vendor
  - total amount
  - expense date
- Automatic category tagging (Meals, Travel, Office, Software, etc.)
- Expense persistence to local JSON data file
- Monthly report with totals by category and vendor
- Basic browser UI for upload + report generation

## Prerequisites

- Node.js 18+ (recommended)

## Installation

```bash
npm install
```

## Run

```bash
npm start
```

The app starts on `http://localhost:5000` by default.

## API Endpoints

### Scan a receipt image

`POST /api/expenses/scan-receipt`

Multipart form-data:
- `receipt`: image file

Response (201):

```json
{
  "expense": {
    "id": "uuid",
    "vendor": "ACME CAFE",
    "total": 42.5,
    "expenseDate": "2026-04-05",
    "category": "Meals"
  }
}
```

### List expenses

`GET /api/expenses`

Optional query params:
- `month=YYYY-MM`

### Generate monthly report

`GET /api/expenses/monthly-report?month=YYYY-MM`

Response includes:
- total amount
- average expense
- totals by category
- totals by vendor
- matching expense items

## Testing

```bash
npm test
```