#!/usr/bin/env bash
# Deploy with PRIVATE_KEY from Relix/.env (do not run `pnpm run deploy -- --account ...`;
# the part after `--` is passed to Solidity `run()`, not to Forge's wallet.)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

set -a
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env"
fi
set +a

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "Missing PRIVATE_KEY in $ROOT/.env" >&2
  echo "Add: PRIVATE_KEY=0x...   (your deployer key)" >&2
  exit 1
fi

PK="$PRIVATE_KEY"
if [[ "$PK" != 0x* ]]; then
  PK="0x$PK"
fi

exec forge script script/DeployUniversalClaimLinks.s.sol:DeployUniversalClaimLinks \
  --broadcast \
  -vvvv \
  --private-key "$PK"
