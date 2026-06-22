#!/usr/bin/env bash
# Install RunCanon CLI from your hosted instance (macOS / Linux).
# Verifies SHA256 from the signed manifest before installing.
#
# Usage:
#   curl -fsSL http://127.0.0.1:3000/api/releases/install.sh | bash
#   curl -fsSL http://127.0.0.1:3000/api/releases/install.sh | bash -s -- --version 0.1.0
set -euo pipefail

SERVER="${RUNCANON_INSTALL_SERVER:-{{SERVER_URL}}}"
VERSION="${RUNCANON_INSTALL_VERSION:-}"
INSTALL_DIR="${RUNCANON_INSTALL_DIR:-$HOME/.local}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

SERVER="${SERVER%/}"

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin)
      if [[ "$arch" == "arm64" ]]; then echo "darwin-arm64"; else echo "darwin-x64"; fi
      ;;
    Linux) echo "linux-x64" ;;
    MINGW*|MSYS*|CYGWIN*) echo "win-x64" ;;
    *) echo "linux-x64" ;;
  esac
}

PLATFORM="$(detect_platform)"
MANIFEST_URL="$SERVER/api/releases/latest?platform=$PLATFORM"
if [[ -n "$VERSION" ]]; then
  MANIFEST_URL="$MANIFEST_URL&version=$VERSION"
fi

echo "→ Fetching release manifest from $MANIFEST_URL"
META="$(curl -fsSL "$MANIFEST_URL")"
MANIFEST_PATH="$(echo "$META" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(j.manifest.checksumsFile.replace(/^\\//,''))")"
ARTIFACT_FILE="$(echo "$META" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(j.recommended.file)")"
EXPECTED_SHA="$(echo "$META" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(j.recommended.sha256)")"
CLI_VERSION="$(echo "$META" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(j.manifest.version)")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SUMS_URL="$SERVER/$MANIFEST_PATH"
SUMS_FILE="$TMP/SHA256SUMS"
ARCHIVE_URL="$SERVER/downloads/v${CLI_VERSION}/${ARTIFACT_FILE}"
ARCHIVE_PATH="$TMP/$ARTIFACT_FILE"

echo "→ Downloading checksums"
curl -fsSL "$SUMS_URL" -o "$SUMS_FILE"

echo "→ Downloading $ARTIFACT_FILE"
curl -fsSL "$ARCHIVE_URL" -o "$ARCHIVE_PATH"

echo "→ Verifying SHA256"
ACTUAL_SHA="$(shasum -a 256 "$ARCHIVE_PATH" 2>/dev/null | awk '{print $1}' || sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "ERROR: checksum mismatch!" >&2
  echo "  expected: $EXPECTED_SHA" >&2
  echo "  actual:   $ACTUAL_SHA" >&2
  exit 1
fi
grep -q "$EXPECTED_SHA  $ARTIFACT_FILE" "$SUMS_FILE" || {
  echo "ERROR: artifact not listed in SHA256SUMS" >&2
  exit 1
}

echo "→ Installing to $INSTALL_DIR/runcanon/$CLI_VERSION"
TARGET="$INSTALL_DIR/runcanon/$CLI_VERSION"
mkdir -p "$TARGET"
if [[ "$ARTIFACT_FILE" == *.zip ]]; then
  unzip -qo "$ARCHIVE_PATH" -d "$TARGET"
else
  tar -xzf "$ARCHIVE_PATH" -C "$TARGET"
fi

BIN_DIR="$INSTALL_DIR/bin"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/runcanon" <<EOF
#!/usr/bin/env bash
exec "$TARGET/bin/runcanon" "\$@"
EOF
chmod +x "$BIN_DIR/runcanon"

cat > "$BIN_DIR/runcanon-mcp" <<EOF
#!/usr/bin/env bash
exec "$TARGET/bin/runcanon-mcp" "\$@"
EOF
chmod +x "$BIN_DIR/runcanon-mcp"

echo ""
echo "RunCanon CLI v$CLI_VERSION installed."
echo "  runcanon --version"
echo "  runcanon login --server $SERVER --email you@company.com"
echo "  runcanon-mcp   # MCP server for Cursor (stdio)"
echo ""
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Add to PATH: export PATH=\"$BIN_DIR:\$PATH\""
fi
