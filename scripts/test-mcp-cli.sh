#!/usr/bin/env bash
# Smoke-test RunCanon CLI (demo container) and document MCP tool inventory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXEC="${ROOT}/scripts/demo-exec.sh"
SERVER="${RUNCANON_SERVER:-http://127.0.0.1:3000}"
PROJECT="${RUNCANON_PROJECT_HOST:-$HOME/Documents/ai-striker-security-app}"

echo "== RunCanon CLI + MCP smoke test (container) =="
echo "Server: $SERVER"
echo "Project mount: $PROJECT → /project"

if ! docker ps --format '{{.Names}}' | grep -qx "${RUNCANON_CONTAINER:-runcanon-demo}"; then
  echo "Container not running. Run: ./scripts/demo-docker.sh" >&2
  exit 1
fi

echo ""
echo "-- CLI: version (container) --"
"$EXEC" --version

echo ""
echo "-- CLI: help (commands) --"
"$EXEC" --help | grep -E "init|mine|review|login|logout|whoami|import|mcp|export"

echo ""
echo "-- Health --"
curl -sf "$SERVER/api/health" | head -c 200
echo ""

if [[ -f "$HOME/.runcanon/credentials.json" ]]; then
  TOKEN=$(python3 -c 'import json; print(json.load(open("'$HOME'/.runcanon/credentials.json"))["token"])')
  echo ""
  echo "-- API: org skills (auth) --"
  curl -sf -H "Authorization: Bearer $TOKEN" "$SERVER/api/org/skills" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("org skills:", d.get("total",0))'

  echo ""
  echo "-- API: org sync --"
  curl -sf -H "Authorization: Bearer $TOKEN" "$SERVER/api/org/sync" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("workspace:", len(d.get("workspaceSkills",[])), "org:", len(d.get("orgSkills",[])))'

  echo ""
  echo "-- CLI: whoami (container) --"
  "$EXEC" whoami || true
else
  echo ""
  echo "(skip authenticated tests — run: $EXEC login --server $SERVER --email you@co.com --password '...')"
fi

echo ""
echo "-- Goal alignment test --"
echo "  ./scripts/test-goal-alignment.sh"
echo ""
echo "-- Full MCP tool test (container MCP) --"
echo "  ./scripts/test-mcp-tools.sh"
echo ""
echo "Done."
