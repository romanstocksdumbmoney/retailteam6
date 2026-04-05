# Expense Reporting App

Dumb Dollars is an expense reporting app that lets users upload receipt images or videos, scan key fields (vendor, total, date), auto-categorize entries, review/edit before saving, generate monthly summaries, and export reports to Excel.

## Features

- Receipt media upload (`jpg`, `png`, `webp`, `mp4`, etc.)
- OCR extraction from:
  - uploaded images
  - an extracted video frame for uploaded videos
- Parsed fields:
  - vendor
  - total amount
  - expense date
- Auto-categorization (Meals, Travel, Transportation, Fuel, Office, Software, Utilities, Healthcare, Entertainment, Other)
- Review-before-save workflow for better accuracy
- Monthly JSON report with totals and breakdowns
- Excel export (`.xlsx`) with summary/category/vendor/items tabs
- Styled dashboard UI
- Stripe Checkout subscription paywall ($10/month)

## Prerequisites

- Node.js 18+ (recommended)
- Stripe account configured with a recurring monthly price

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` or set environment variables in your deployment:

```bash
APP_BASE_URL=https://dumbdollars.org
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Notes:
- `APP_BASE_URL` should match your public app URL.
- `STRIPE_PRICE_ID` must be a Stripe **recurring monthly** price for $10.
- Stripe webhook endpoint should point to:
  - `POST /api/webhooks/stripe`

## Run

```bash
npm start
```

Default local URL: `http://localhost:5000`.

## Stripe Subscription Flow

1. Frontend calls `POST /api/subscription/checkout` with user email.
2. API returns Stripe Checkout URL.
3. User completes payment in Stripe-hosted checkout.
4. Frontend confirms checkout via `POST /api/subscription/confirm`.
5. API returns an access token used in:
   - `x-subscription-token` request header

Protected features require an active token.

## API Endpoints

### Subscription

- `GET /api/subscription/plan`
- `POST /api/subscription/checkout`
- `POST /api/subscription/confirm`
- `GET /api/subscription/status` (requires token)

### Stripe Webhook

- `POST /api/webhooks/stripe`

### Expenses

- `GET /api/expenses/categories`
- `POST /api/expenses/scan-receipt` (requires token, multipart media upload)
- `POST /api/expenses` (requires token, save reviewed expense)
- `GET /api/expenses` (requires token, optional `?month=YYYY-MM`)
- `GET /api/expenses/monthly-report` (requires token, optional `?month=YYYY-MM`)
- `GET /api/expenses/monthly-report.xlsx` (requires token, optional `?month=YYYY-MM`)

## Testing

```bash
npm test
```

## Domain Setup (`dumbdollars.org`)

For production:
1. Deploy this Node app to a host (Render, Railway, Fly.io, etc.).
2. Point DNS (`A` or `CNAME`) for `dumbdollars.org` to the host.
3. Set `APP_BASE_URL=https://dumbdollars.org`.
4. Configure Stripe webhook endpoint to:
   - `https://dumbdollars.org/api/webhooks/stripe`