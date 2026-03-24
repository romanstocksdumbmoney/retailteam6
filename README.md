# A app

Market intelligence MVP with:
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
- "Earnings Gambling" board with green/red directional cards

## Plan gating
Default plan is `free`. To simulate Pro access for API calls, send one of:
- `x-user-plan: pro`
- `x-plan: pro`
- `x-access-tier: pro`

## API Endpoints
### Public endpoints
- `GET /api/news`
- `GET /api/earnings`
- `GET /api/market/stock-outlook?ticker=AAPL`
- `GET /api/market/stock-search?q=TSLA`
- `GET /api/market/scan-x?ticker=TSLA&method=llm-sentiment` (free method)
- `GET /api/market/earnings-gambling?limit=5`
- `GET /health`

### Pro endpoints
- `GET /api/market/options?ticker=TSLA&spot=220&strike=230&daysToExpiry=21&iv=0.42&type=call`
- `GET /api/market/unusual-moves`
- `GET /api/market/scan-x?ticker=TSLA&method=multi` (and other non-free methods)

If plan is not Pro, locked endpoints return `403` with an upgrade message.

## Frontend scripts
From the `frontend` directory:
- `npm run build` - writes `frontend/build/index.html`, `app.js`, and `styles.css`
- `npm start` - simple static dev server on `http://localhost:3000`

## Notes
- Current data is simulated for MVP behavior and UI wiring.
- Next step is integrating real market/news/options providers and billing/authentication.