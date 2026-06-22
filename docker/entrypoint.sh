#!/bin/sh
set -e

CLI="/app/packages/cli/dist/cli.cjs"
MCP="/app/packages/mcp/dist/bin.cjs"
DASHBOARD="/app/apps/dashboard/build/index.js"

run_cli() {
  exec node "$CLI" "$@"
}

case "${1:-dashboard}" in
  dashboard)
    export HEADERS_TIMEOUT="${HEADERS_TIMEOUT:-1800}"
    export BODY_SIZE_LIMIT="${BODY_SIZE_LIMIT:-10M}"
    exec node "$DASHBOARD"
    ;;
  mcp|runcanon-mcp)
    shift
    exec node "$MCP" "$@"
    ;;
  runcanon|skillsmith)
    shift
    run_cli "$@"
    ;;
  init|mine|review|export)
    run_cli "$@"
    ;;
  --help|-h|--version|-V)
    run_cli "$@"
    ;;
  *)
    run_cli "$@"
    ;;
esac
