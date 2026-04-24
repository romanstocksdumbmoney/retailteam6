# DumbDollars

DumbDollars is a market intelligence platform for active traders and options-focused investors. It combines stock outlook probabilities, flow-aware scanning, options analytics, and an earnings momentum board into one dashboard so users can quickly assess directional risk and opportunity.

Core focus areas:
- Express backend API (`server.js`)
- Frontend dashboard (`frontend/src`) for stock outlook, scanner, options, and earnings board
- Static build output to `frontend/build` (compatible with existing GitHub Pages workflow)

## Prerequisites
- Node.js 18 or newer
- npm

## Installation
1. Install backend dependencies:
   ```bash
   npm install
   ```
2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

## Run the app locally
1. Build frontend assets:
   ```bash
   cd frontend
   npm run build
   cd ..
   ```
2. Start backend (serves API and frontend build):
   ```bash
   npm start
   ```
3. Open:
   - `http://localhost:5000/` for the app UI
   - `http://localhost:5000/health` for backend health

## Feature overview
- Stock outlook probabilities for day/week/month/year (up/down percentages)
- x.com scanner with multiple scan methods (free + pro-gated methods)
- Options calculator + gamma exposure (Pro)
- Unusual moves feed (Pro)
- High IV tracker for elevated implied volatility names (Pro)
- "Earnings Gambling" board with green/red directional cards

## Authentication + billing (Stripe)

DumbDollars supports account auth and Stripe-backed Pro subscriptions.

### Local auth endpoints
- `POST /api/auth/signup` with `{ "email", "password" }`
- `POST /api/auth/login` with `{ "email", "password" }`
- `POST /api/auth/oauth/signin` with `{ "provider", "email" }`
- `GET /api/auth/me` (requires bearer token)
- `GET /api/auth/oauth/providers`

### Stripe Pro billing endpoints
- Pro is **$15/month**
- Start checkout (authenticated only):
  - `POST /api/auth/stripe/create-checkout-session`
- Confirm successful checkout session (authenticated only):
  - `POST /api/auth/stripe/confirm-checkout-session`
- Open billing portal (authenticated only):
  - `POST /api/auth/stripe/create-customer-portal`
- Stripe webhook endpoint:
  - `POST /api/auth/stripe/webhook`

Checkout is Stripe-only and Pro activation is granted only after Stripe session verification/webhook sync.

Required env vars:
- `JWT_SECRET` (strong random secret; required in production)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `APP_BASE_URL`
- `OWNER_EMAIL` or `OWNER_EMAILS` (recommended for owner dashboard access visibility)

Stripe pricing config:
- Preferred: set `STRIPE_PRICE_ID` to a recurring monthly Stripe price.
- Fallback (still Stripe-hosted): if `STRIPE_PRICE_ID` is not set, checkout uses inline Stripe recurring price data from `STRIPE_PRO_MONTHLY_PRICE_CENTS` (defaults to `1500` = $15.00).

Production hardening env vars:
- `ALLOWED_ORIGINS` (comma-separated trusted origins; required in production)
- `NODE_ENV=production`
- `COMPLAINT_REVIEW_TOKEN` (optional but recommended; required to access complaint review/update endpoints safely)
- `OWNER_PREVIEW_IN_DEV=0` (recommended default; avoid implicit owner elevation in dev unless intentionally testing)

### Account access code recovery (email + Pro restore)
- Request access code:
  - `POST /api/auth/access-code/request` with `{ "email": "user@example.com", "purpose": "pro_recovery" }`
- Verify access code:
  - `POST /api/auth/access-code/verify` with `{ "email": "user@example.com", "code": "ABCDEFGH", "purpose": "pro_recovery", "remember": true }`
- Eligibility:
  - By default, this recovery flow is for existing Pro/owner-eligible accounts.
  - Free accounts cannot self-upgrade through this code flow unless explicitly enabled.

Email delivery env vars for access codes:
- `SMTP_HOST`
- `SMTP_PORT` (default `587`)
- `SMTP_SECURE` (`1` for SMTPS, else `0`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (from address)

Preview fallback behavior:
- If SMTP is not configured, access codes can still be generated in preview mode only when `ACCESS_CODE_PREVIEW_FALLBACK=1` (defaults to `1` in non-production, `0` in production).
- `ACCESS_CODE_ALLOW_FREE_UPGRADE=0` should stay disabled for normal operation (set to `1` only for intentional temporary testing).

## API Endpoints
### Public endpoints
- `GET /api/news`
- `GET /api/earnings`
- `GET /api/market/stock-outlook?ticker=AAPL`
- `GET /api/market/stock-search?q=TSLA`
- `GET /api/market/scan-x?ticker=TSLA&method=llm-sentiment` (free method)
- `GET /api/market/earnings-gambling?limit=5`
- `POST /api/market/copilot/complaints` (submit user complaint ticket)
- `GET /api/market/copilot/complaints/:ticketId` (track one complaint ticket status)
- `GET /health`

### Pro endpoints (requires authenticated user with active Stripe Pro subscription)
- `GET /api/market/options?ticker=TSLA&spot=220&strike=230&daysToExpiry=21&iv=0.42&type=call`
- `GET /api/market/unusual-moves`
- `GET /api/market/high-iv?limit=8`
- `GET /api/market/scan-x?ticker=TSLA&method=multi` (and other non-free methods)

If account is not Pro, locked endpoints return `403` with an upgrade message.

### Complaint review endpoints (operator access)
- `GET /api/market/copilot/complaints-review?status=open&limit=50`
- `PATCH /api/market/copilot/complaints/:ticketId/status` with `{ "status": "investigating|fixed|closed", "resolutionNote": "..." }`

Access control:
- If `COMPLAINT_REVIEW_TOKEN` is set, send it in `x-complaint-review-token` header.
- If `COMPLAINT_REVIEW_TOKEN` is not set, Pro signed-in users can access review endpoints (dev fallback).

### Notification receiver + bot delivery endpoints
- `GET /api/market/copilot/notifications/settings` (auth required)
- `POST /api/market/copilot/notifications/settings` (auth required)
- `GET /api/market/copilot/notifications/messages?limit=20` (auth required)
- `POST /api/market/copilot/notifications/send` (auth required)
- `POST /api/market/ai-trade/order-setup` (auth required) — upload order screenshot + entry/loss/gain percentages and get exact limit/stop/take-profit numbers with step-by-step setup guidance

Real delivery env vars:
- `NOTIFICATION_REQUIRE_REAL_DELIVERY=1` (default) -> send call fails unless at least one channel actually sends
- Email channel via SMTP:
  - `NOTIFY_SMTP_HOST` (or fallback `SMTP_HOST`)
  - `NOTIFY_SMTP_PORT` (or fallback `SMTP_PORT`)
  - `NOTIFY_SMTP_SECURE` (or fallback `SMTP_SECURE`)
  - `NOTIFY_SMTP_USER` (or fallback `SMTP_USER`)
  - `NOTIFY_SMTP_PASS` (or fallback `SMTP_PASS`)
  - `NOTIFY_SMTP_FROM` (or fallback `SMTP_FROM`)
- SMS channel via Twilio:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM_NUMBER`

## Frontend scripts
From the `frontend` directory:
- `npm run build` - writes `frontend/build/index.html`, `app.js`, and `styles.css`
- `npm start` - simple static dev server on `http://localhost:3000`

## Notes
- Current data is simulated for MVP behavior and UI wiring.
- Next step is integrating live market/news/options provider APIs.