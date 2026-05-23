# Local Test Run Guide

This guide gives you a repeatable way to verify the app works end-to-end.

## 1) One-time setup

From repo root:

```bash
npm install
cd frontend && npm install && cd ..
cp .env.example .env
```

## 2) Run a full smoke test (recommended)

```bash
bash scripts/test-run.sh
```

What this does:
- Builds frontend assets
- Starts backend server
- Checks health and API endpoints
- Verifies free/pro gating behavior
- Stops server automatically

## 3) Manual run (interactive)

Build frontend:

```bash
cd frontend
npm run build
cd ..
```

Start backend:

```bash
npm start
```

Open:
- http://localhost:5000

### Optional: test Pro behavior with curl

```bash
curl -s "http://localhost:5000/api/market/options?ticker=TSLA&spot=220&strike=230&daysToExpiry=21&iv=0.42"
```

Expected on free: `403`.
