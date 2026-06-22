#!/usr/bin/env bash
# Run RunCanon CLI inside the demo container (Show & Tell / demo default).
# Usage: ./scripts/demo-exec.sh whoami
#        ./scripts/demo-exec.sh login --server http://127.0.0.1:3000 --email you@company.com --password '...'
set -euo pipefail

CONTAINER="${RUNCANON_CONTAINER:-runcanon-demo}"
PROJECT_IN_CONTAINER="${RUNCANON_PROJECT_PATH:-/project}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container '${CONTAINER}' is not running." >&2
  echo "Start the demo stack first: ./scripts/demo-docker.sh" >&2
  exit 1
fi

TTY_FLAGS=(-i)
if [ -t 0 ] && [ -t 1 ]; then
  TTY_FLAGS=(-it)
fi

exec docker exec "${TTY_FLAGS[@]}" \
  -e RUNCANON_PROJECT_PATH="${PROJECT_IN_CONTAINER}" \
  -e RUNCANON_DATA_DIR=/data \
  "$CONTAINER" \
  runcanon "$@"
