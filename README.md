# Retail Team 6 API

Small Express API that serves mock market news and earnings data.

## Prerequisites

- Node.js 18+
- npm

## Installation

```bash
npm install
```

## Run the API

```bash
npm start
```

Server default URL: `http://localhost:5000`

## Test

```bash
npm test
```

## Endpoints

### Health

- `GET /api/health`

Example response:

```json
{
  "status": "ok",
  "service": "retailteam6-api",
  "timestamp": "2026-04-05T10:30:00.000Z"
}
```

### News

- `GET /api/news`
- `GET /api/news?symbol=AAPL`
- `GET /api/news?sentiment=positive`
- `GET /api/news?limit=2`

### Earnings

- `GET /api/earnings`
- `GET /api/earnings?upcoming=true`
- `GET /api/earnings/AAPL`