#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"
SERVER_LOG="/tmp/aapp-test-run-server.log"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

echo "[1/5] Installing backend dependencies..."
(cd "$ROOT_DIR" && npm install)

echo "[2/5] Installing frontend dependencies..."
(cd "$ROOT_DIR/frontend" && npm install)

echo "[3/5] Building frontend..."
(cd "$ROOT_DIR/frontend" && npm run build)

echo "[4/5] Starting backend with test auth secret..."
(cd "$ROOT_DIR" && JWT_SECRET="${JWT_SECRET:-dumbdollars-dev-secret}" node server.js > "$SERVER_LOG" 2>&1) &
SERVER_PID=$!

echo "Waiting for backend health endpoint..."
for _ in {1..30}; do
  if curl -sS "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sS "$BASE_URL/health" >/dev/null 2>&1; then
  echo "Backend failed to start. Log output:"
  cat "$SERVER_LOG"
  exit 1
fi

echo "[5/5] Running smoke tests..."
BASE_URL="$BASE_URL" "$ROOT_DIR/scripts/smoke-test.sh"

echo "All checks passed."
