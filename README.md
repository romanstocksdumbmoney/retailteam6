# A app

Minimal full-stack starter application:
- Express backend API (`server.js`)
- Static frontend (`frontend/src`) that calls backend endpoints
- Build output to `frontend/build` (compatible with existing GitHub Pages workflow)

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
   - `http://localhost:5000/health` for health

## API Endpoints
- `GET /api/news` - sample news payload
- `GET /api/earnings` - sample earnings payload
- `GET /health` - backend health check

## Frontend scripts
From the `frontend` directory:
- `npm run build` - writes `frontend/build/index.html`, `app.js`, and `styles.css`
- `npm start` - simple static dev server on `http://localhost:3000`

## Troubleshooting
- Ensure Node.js is 18+ if install/build fails.
- If port `5000` is busy:
  ```bash
  PORT=5050 npm start
  ```