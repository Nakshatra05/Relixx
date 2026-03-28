#!/usr/bin/env bash
# Sanity checks: Forge + optional on-chain bytecode (no private keys).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== 1) Forge compile + sync ABI to frontend =="
forge build
node scripts/sync-universal-claim-abi.mjs

echo ""
echo "== 2) Forge tests =="
forge test

RPC="${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}"

pick_addr() {
  local f line
  for f in "$ROOT/frontend/.env" "$ROOT/.env"; do
    [[ -f "$f" ]] || continue
    line=$(grep -E '^[[:space:]]*VITE_UNIVERSAL_CLAIM_LINKS_ADDRESS=' "$f" 2>/dev/null | head -1 || true)
    [[ -n "${line:-}" ]] || continue
    echo "$line" | cut -d= -f2- | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr -d '"' | tr -d "'"
    return 0
  done
  echo ""
}

ADDR="$(pick_addr)"

echo ""
echo "== 3) On-chain check (Monad RPC: $RPC) =="
if [[ -z "${ADDR:-}" ]]; then
  echo "No VITE_UNIVERSAL_CLAIM_LINKS_ADDRESS in frontend/.env or .env — set it to your deployed contract, then re-run: pnpm run doctor"
  echo ""
  echo "Deploy: set PRIVATE_KEY in .env then pnpm run deploy:env (or: pnpm run deploy -- --private-key 0x...)"
  exit 0
fi

if ! command -v cast >/dev/null 2>&1; then
  echo "cast not found (install Foundry). Skipping bytecode check."
  exit 0
fi

CODE="$(cast code "$ADDR" --rpc-url "$RPC" 2>/dev/null || true)"
if [[ -z "$CODE" || "$CODE" == "0x" ]]; then
  echo "Address $ADDR has NO contract code on $RPC."
  echo "  → Wrong network, wrong address, or not deployed yet."
  echo "  → Match VITE_CHAIN_ID (10143 testnet / 143 mainnet) with where you deployed."
  exit 1
fi

echo "OK: bytecode at $ADDR (length ${#CODE} chars)."
echo "  Try: cast call $ADDR \"owner()\" --rpc-url $RPC"
