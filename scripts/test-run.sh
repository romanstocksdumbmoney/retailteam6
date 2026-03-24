#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[1/4] Installing backend dependencies..."
(cd "$ROOT_DIR" && npm install)

echo "[2/4] Installing frontend dependencies..."
(cd "$ROOT_DIR/frontend" && npm install)

echo "[3/4] Building frontend..."
(cd "$ROOT_DIR/frontend" && npm run build)

echo "[4/4] Running smoke tests..."
"$ROOT_DIR/scripts/smoke-test.sh"

echo "All checks passed."
