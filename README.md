# A app

Simple starter application with:
- Express backend API (`server.js`)
- Static frontend build in `frontend/build` (compatible with the existing GitHub Pages workflow)

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
   ```

## Usage
### Run backend
```bash
npm start
```

Backend endpoints:
- `GET /` - app status
- `GET /health` - health check
- `GET /api/news` - sample news payload
- `GET /api/earnings` - sample earnings payload

### Build frontend
From the `frontend` directory:
```bash
npm run build
```

This generates:
- `frontend/build/index.html`

## Troubleshooting
- If `npm install` fails, ensure your Node.js version is 18+.
- If port `5000` is busy, start with another port:
  ```bash
  PORT=5050 npm start
  ```