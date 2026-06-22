#!/usr/bin/env bash
# Wrapper — run full MCP tool test via the demo container (not host runcanon-mcp).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! docker ps --format '{{.Names}}' | grep -qx "${RUNCANON_CONTAINER:-runcanon-demo}"; then
  echo "Container runcanon-demo is not running. Run: ./scripts/demo-docker.sh" >&2
  exit 1
fi

export RUNCANON_MCP_BIN="${ROOT}/scripts/runcanon-mcp-docker.sh"
export RUNCANON_PROJECT_PATH="${RUNCANON_PROJECT_HOST:-${HOME}/Documents/ai-striker-security-app}"
export RUNCANON_SERVER="${RUNCANON_SERVER:-http://127.0.0.1:3000}"

exec pnpm --dir "$ROOT/packages/mcp" run test:tools "$@"
