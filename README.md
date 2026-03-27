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
- `STRIPE_PRICE_ID`
- `APP_BASE_URL`

Production hardening env vars:
- `ALLOWED_ORIGINS` (comma-separated trusted origins; required in production)
- `NODE_ENV=production`

## API Endpoints
### Public endpoints
- `GET /api/news`
- `GET /api/earnings`
- `GET /api/market/stock-outlook?ticker=AAPL`
- `GET /api/market/stock-search?q=TSLA`
- `GET /api/market/scan-x?ticker=TSLA&method=llm-sentiment` (free method)
- `GET /api/market/earnings-gambling?limit=5`
- `GET /health`

### Pro endpoints (requires authenticated user with active Stripe Pro subscription)
- `GET /api/market/options?ticker=TSLA&spot=220&strike=230&daysToExpiry=21&iv=0.42&type=call`
- `GET /api/market/unusual-moves`
- `GET /api/market/high-iv?limit=8`
- `GET /api/market/scan-x?ticker=TSLA&method=multi` (and other non-free methods)

If account is not Pro, locked endpoints return `403` with an upgrade message.

## Frontend scripts
From the `frontend` directory:
- `npm run build` - writes `frontend/build/index.html`, `app.js`, and `styles.css`
- `npm start` - simple static dev server on `http://localhost:3000`

## Notes
- Current data is simulated for MVP behavior and UI wiring.
- Next step is integrating live market/news/options provider APIs.