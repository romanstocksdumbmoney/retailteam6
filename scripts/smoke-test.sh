#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"
TMP_DIR="/tmp/aapp-smoke"

mkdir -p "$TMP_DIR"

echo "Running smoke test against $BASE_URL"

check_json_contains() {
  local path="$1"
  local expected="$2"
  local outfile="$TMP_DIR/response.json"
  curl -sS "$BASE_URL$path" > "$outfile"
  if rg -q "$expected" "$outfile"; then
    echo "PASS: $path contains $expected"
  else
    echo "FAIL: $path missing $expected"
    echo "--- response ---"
    rg "." "$outfile"
    exit 1
  fi
}

check_status_code() {
  local path="$1"
  local expected="$2"
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL$path")"
  if [[ "$code" == "$expected" ]]; then
    echo "PASS: $path returned $expected"
  else
    echo "FAIL: $path returned $code (expected $expected)"
    exit 1
  fi
}

check_json_contains "/health" "\"status\":\"ok\""
check_json_contains "/api/market/stock-outlook?ticker=TSLA" "\"ticker\":\"TSLA\""
check_json_contains "/api/market/scan-x?ticker=TSLA&method=llm-sentiment" "\"isLimited\":true"
check_status_code "/api/market/options?ticker=TSLA&spot=220&strike=230&daysToExpiry=21&iv=0.42" "403"
check_json_contains "/api/market/earnings-gambling" "\"items\""

echo "Smoke test complete."
