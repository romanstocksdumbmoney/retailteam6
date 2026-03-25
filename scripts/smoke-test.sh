#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"
TMP_DIR="/tmp/aapp-smoke"
AUTH_TOKEN=""

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

check_auth_status_code() {
  local path="$1"
  local expected="$2"
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $AUTH_TOKEN" "$BASE_URL$path")"
  if [[ "$code" =~ ^($expected)$ ]]; then
    echo "PASS: $path (authed) returned $expected"
  else
    echo "FAIL: $path (authed) returned $code (expected $expected)"
    exit 1
  fi
}

signup_and_capture_token() {
  local email="smoke.$RANDOM.$$.test@example.com"
  local outfile="$TMP_DIR/signup.json"
  local code
  code="$(curl -sS -o "$outfile" -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"password123\"}" \
    "$BASE_URL/api/auth/signup")"

  if [[ "$code" != "201" ]]; then
    echo "FAIL: signup returned $code"
    echo "--- response ---"
    rg "." "$outfile"
    exit 1
  fi

  AUTH_TOKEN="$(node -e "const fs=require('fs');const body=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));if(!body.token){process.exit(1);}process.stdout.write(body.token);" "$outfile")"
  if [[ -z "$AUTH_TOKEN" ]]; then
    echo "FAIL: signup succeeded but token missing"
    exit 1
  fi
  echo "PASS: signup returned auth token"
}

check_json_contains "/health" "\"status\":\"ok\""
check_json_contains "/api/auth/billing-info" "\"configured\""
check_status_code "/api/auth/me" "401"
signup_and_capture_token
check_json_contains "/api/market/stock-outlook?ticker=TSLA" "\"ticker\":\"TSLA\""
check_auth_status_code "/api/auth/me" "200"
check_auth_status_code "/api/auth/billing/checkout-preview" "503|200"
check_json_contains "/api/market/scan-x?ticker=TSLA&method=llm-sentiment" "\"isLimited\":true"
check_auth_status_code "/api/market/options?ticker=TSLA&spot=220&strike=230&daysToExpiry=21&iv=0.42" "403"
check_json_contains "/api/market/stock-outlook?ticker=TSLA" "\"ticker\":\"TSLA\""
check_json_contains "/api/market/earnings-gambling" "\"reportTimeLabel\":\"Pre-Market\"|\"reportTimeLabel\":\"After-Hours\""
check_json_contains "/api/market/earnings-gambling" "\"analystPushes\""
check_json_contains "/api/market/earnings-gambling" "\"recentNews\""
node -e "const base=process.argv[1];const https=require('http').request;const req=https(base+'/api/market/earnings-gambling',{method:'GET'},res=>{let data='';res.on('data',d=>data+=d);res.on('end',()=>{try{const payload=JSON.parse(data);const items=Array.isArray(payload.items)?payload.items:[];const valid=items.every(it=>{if(!it.eventDate)return false;const d=new Date(it.eventDate+'T00:00:00Z');const now=new Date();const todayUtc=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));const maxUtc=new Date(todayUtc);maxUtc.setUTCDate(maxUtc.getUTCDate()+31);return d>=todayUtc&&d<=maxUtc;});if(!valid){console.error('FAIL: earnings eventDate outside expected 31-day window');process.exit(1);}console.log('PASS: earnings eventDate within expected 31-day window');}catch(e){console.error('FAIL: could not validate earnings date window');process.exit(1);}})});req.on('error',()=>{console.error('FAIL: could not fetch earnings payload');process.exit(1);});req.end();" "$BASE_URL"
check_json_contains "/api/market/realized-patterns" "\"items\""
check_json_contains "/api/market/wild-takes" "\"items\""
check_auth_status_code "/api/market/high-iv" "403"

echo "Smoke test complete."
