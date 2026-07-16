#!/usr/bin/env bash
# Sets Forge variables from secretspec-declared secrets (dotenv provider).
set -euo pipefail

keys=$(secretspec schema | jq -r '.properties | keys[]')

for key in $keys; do
  case "$key" in
  FORGE*)
    # Skip vars that only configure Forge CLI invocations.
    continue
    ;;
  esac

  if ! value=$(secretspec get "$key" --provider dotenv --reason "forge-vars-from-env: upload $key" 2>/dev/null); then
    echo "Skipping $key: not set in the dotenv provider" >&2
    continue
  fi

  case "$key" in
  *SECRET* | *TOKEN* | *CREDENTIAL*)
    # Encrypt vars that look like secrets, tokens, or credentials.
    echo npm -s run forge:variables:set-encrypted -- "$key" "****"
    npm run -s forge:variables:set-encrypted -- "$key" "$value"
    ;;
  *)
    echo npm -s run forge:variables:set -- "$key" "$value"
    npm run -s forge:variables:set -- "$key" "$value"
    ;;
  esac
done
