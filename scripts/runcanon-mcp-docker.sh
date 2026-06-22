#!/usr/bin/env bash
# MCP stdio entrypoint for Claude Code / Cursor — runs runcanon-mcp inside the demo container.
# Wire in .mcp.json: "command": "/absolute/path/to/runcanon/scripts/runcanon-mcp-docker.sh"
set -euo pipefail

CONTAINER="${RUNCANON_CONTAINER:-runcanon-demo}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container '${CONTAINER}' is not running. Run: ./scripts/demo-docker.sh" >&2
  exit 1
fi

exec docker exec -i \
  -e RUNCANON_PROJECT_PATH=/project \
  -e RUNCANON_DATA_DIR=/data \
  "$CONTAINER" \
  mcp
