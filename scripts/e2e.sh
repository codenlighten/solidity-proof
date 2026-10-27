#!/usr/bin/env bash
# Browser end-to-end test of web/index.html: starts a local Hardhat node and a static server, deploys,
# loads the real page in headless Chrome with a mock wallet (web/e2e/), clicks its buttons, and reports.
# Needs: npm ci done, python3, and Chrome/Chromium (CHROME=/path/to/browser to override).
# Nodes are bound to 127.0.0.1 only. Everything started here is killed by PID on exit.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-google-chrome}"
RPC_PORT="${RPC_PORT:-8545}"
WEB_PORT="${WEB_PORT:-8000}"

./node_modules/.bin/hardhat node --hostname 127.0.0.1 --port "$RPC_PORT" >/dev/null 2>&1 &
NODE_PID=$!
python3 -m http.server "$WEB_PORT" --bind 127.0.0.1 --directory web >/dev/null 2>&1 &
WEB_PID=$!
PROFILE="$(mktemp -d)"
trap 'kill "$NODE_PID" "$WEB_PID" 2>/dev/null || true; rm -rf "$PROFILE"' EXIT

for _ in $(seq 1 60); do
  curl -s -m 2 -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "http://127.0.0.1:$RPC_PORT" >/dev/null && break
  sleep 0.5
done

VAULT="$(npx hardhat run scripts/deploy.js --network localhost | sed -n "s/.*vaultProxy: '\(0x[0-9a-fA-F]*\)'.*/\1/p")"
[ -n "$VAULT" ] || { echo "could not read the vault address from deploy.js"; exit 1; }
echo "vault proxy $VAULT"

# a fresh profile each run: Chrome would otherwise serve stale cached modules
"$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$PROFILE" --disk-cache-size=1 \
  --virtual-time-budget=60000 --dump-dom \
  "http://127.0.0.1:$WEB_PORT/e2e/e2e.html?vault=$VAULT&rpc=http://127.0.0.1:$RPC_PORT" 2>/dev/null |
  python3 scripts/e2e-report.py
