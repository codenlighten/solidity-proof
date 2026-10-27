#!/usr/bin/env bash
# Runs Mythril on the runtime bytecode of the production contracts.
# Needs: `myth` on PATH (Mythril 0.24.8 was used) and compiled artifacts (npx hardhat compile).
# Bounded on purpose: MYTH_TIMEOUT seconds per contract (default 90), transaction depth 3.
# Usage: scripts/mythril.sh [Contract ...]   (default: VaultV1 VaultV2 CappedToken Collectible)
set -euo pipefail
cd "$(dirname "$0")/.."
TIMEOUT="${MYTH_TIMEOUT:-90}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
[ "$#" -gt 0 ] && CONTRACTS=("$@") || CONTRACTS=(VaultV1 VaultV2 CappedToken Collectible)
for c in "${CONTRACTS[@]}"; do
  node -e "const a=require('./artifacts/contracts/$c.sol/$c.json'); require('fs').writeFileSync('$WORK/$c.bin', a.deployedBytecode.slice(2))"
  echo "== $c (timeout ${TIMEOUT}s, depth 3)"
  myth analyze -f "$WORK/$c.bin" --bin-runtime --execution-timeout "$TIMEOUT" -t 3 2>&1 | grep -vE 'pkg_resources|^\s*$' || true
done
