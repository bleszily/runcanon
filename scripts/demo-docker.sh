#!/usr/bin/env bash
# Local demo helper — build image, restart container, mount demo project + CLI creds.
# Show & Tell rule: always run this after code changes; use demo-exec.sh / runcanon-mcp-docker.sh
# for CLI and MCP — not host-installed runcanon binaries.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${RUNCANON_IMAGE:-runcanon:latest}"
PORT="${RUNCANON_PORT:-3000}"
CONTAINER="${RUNCANON_CONTAINER:-runcanon-demo}"
ADMIN_EMAIL="${RUNCANON_ADMIN_EMAIL:-admin@runcanon.ai}"
ADMIN_PASSWORD="${RUNCANON_ADMIN_PASSWORD:-KeyBoard@2021}"
ENCRYPTION_KEY="${RUNCANON_ENCRYPTION_KEY:-0123456789abcdef0123456789abcdef}"
PUBLIC_URL="${RUNCANON_PUBLIC_URL:-http://127.0.0.1:${PORT}}"
PROJECT_HOST="${RUNCANON_PROJECT_HOST:-${HOME}/Documents/ai-striker-security-app}"
CREDS_HOST="${RUNCANON_CREDS_DIR:-${HOME}/.runcanon}"

if [ ! -d "$PROJECT_HOST" ]; then
  echo "Demo project directory not found: ${PROJECT_HOST}" >&2
  echo "Set RUNCANON_PROJECT_HOST to your repo root." >&2
  exit 1
fi

mkdir -p "$CREDS_HOST"

echo "Building ${IMAGE}..."
docker build -t "${IMAGE}" "${ROOT}"

echo "Starting RunCanon on ${PUBLIC_URL}"
echo "RunCanon repo: ${ROOT}"
echo "  Project mount: ${PROJECT_HOST} → /project (CLI/MCP export only; dashboard uses /data workspaces)"
echo "  CLI creds:     ${CREDS_HOST} → /root/.runcanon"
echo "  Sign in:       ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (password reset on first login)"

docker rm -f "${CONTAINER}" 2>/dev/null || true

docker run -d --name "${CONTAINER}" --rm -p "${PORT}:3000" \
  -v runcanon-data:/data \
  -v "${PROJECT_HOST}:/project" \
  -v "${CREDS_HOST}:/root/.runcanon" \
  -e RUNCANON_DATA_DIR=/data \
  -e RUNCANON_PUBLIC_URL="${PUBLIC_URL}" \
  -e RUNCANON_ADMIN_EMAIL="${ADMIN_EMAIL}" \
  -e RUNCANON_ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  -e RUNCANON_ENCRYPTION_KEY="${ENCRYPTION_KEY}" \
  "${IMAGE}"

echo ""
echo "Container ${CONTAINER} is running."
echo ""
echo "Dashboard:  ${PUBLIC_URL}"
echo "CLI (container):  ${ROOT}/scripts/demo-exec.sh whoami"
echo "MCP (container):  ${ROOT}/scripts/runcanon-mcp-docker.sh"
echo ""
echo "Examples:"
echo "  ${ROOT}/scripts/demo-exec.sh login --server http://127.0.0.1:3000 --email blessed@runcanon.ai --password '...'"
echo "  ${ROOT}/scripts/demo-exec.sh init --project /project"
echo "  ${ROOT}/scripts/demo-exec.sh export -h claude --project /project"
echo ""
echo "Claude Code MCP:"
echo "  claude mcp add runcanon -s project -- ${ROOT}/scripts/runcanon-mcp-docker.sh"
echo ""
echo "Hard-refresh the browser after rebuilds. Logs: docker logs -f ${CONTAINER}"
