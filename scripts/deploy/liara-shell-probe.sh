#!/usr/bin/env bash
set -euo pipefail

# Liara CLI 9.5.1 calls setRawMode even for a one-shot command. Actions
# has no terminal; util-linux script supplies one and preserves exit status.
# Expand credentials in the child shell, never into script's command text.
# The caller captures output privately and runs the existing fail-closed gate.
: "${LIARA_CLI:?}" "${APP:?}" "${LIARA_API_TOKEN:?}" "${CMD:?}"
exec script --quiet --return --command \
  'stty rows 24 cols 80 && exec npx --yes "$LIARA_CLI" shell -a "$APP" --api-token "$LIARA_API_TOKEN" -c "$CMD"' \
  /dev/null < /dev/null
