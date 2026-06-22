#!/usr/bin/env bash
# Initialize RunCanon in the demo project via the demo container.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="${1:-$HOME/Documents/ai-striker-security-app}"
exec "$ROOT/scripts/demo-exec.sh" init --project /project
