#!/usr/bin/env bash
# Build verified CLI release archives for macOS and Windows.
# Output: releases/<version>/manifest.json + platform archives + SHA256SUMS
#
# Usage:
#   ./scripts/build-cli-release.sh
#   ./scripts/build-cli-release.sh --sign   # GPG-sign SHA256SUMS (requires GPG key)
#
# Native single-binary builds (optional, requires Bun):
#   bun build --compile packages/cli/src/cli.ts --outfile releases/.../runcanon-darwin-arm64
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SIGN=false
for arg in "$@"; do
  if [[ "$arg" == "--sign" ]]; then SIGN=true; fi
done

VERSION="$(node -p "require('./packages/cli/package.json').version")"
RELEASE_ROOT="${RUNCANON_RELEASES_DIR:-$ROOT/releases}"
OUT_DIR="$RELEASE_ROOT/v$VERSION"
STAGING="$OUT_DIR/.staging"

echo "Building RunCanon CLI release v$VERSION → $OUT_DIR"

pnpm --filter @runcanon/cli build
pnpm --filter @runcanon/mcp build

rm -rf "$STAGING"
mkdir -p "$STAGING"

pack_platform() {
  local id="$1"
  local archive_name="$2"
  local work="$STAGING/$id"
  mkdir -p "$work/bin" "$work/lib/cli" "$work/lib/mcp"

  node <<NODE
const { createRequire } = require("module");
const path = require("path");
const req = createRequire(path.join("$ROOT", "packages/cli/package.json"));
const esbuild = req("esbuild");
esbuild.buildSync({
  entryPoints: [path.join("$ROOT", "packages/cli/src/cli.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join("$work", "lib/cli/cli.cjs"),
});
esbuild.buildSync({
  entryPoints: [path.join("$ROOT", "packages/mcp/src/bin.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join("$work", "lib/mcp/mcp.cjs"),
});
NODE

  chmod +x "$work/lib/cli/cli.cjs"
  chmod +x "$work/lib/mcp/mcp.cjs"

  if [[ "$id" == win-x64 ]]; then
    cat > "$work/bin/runcanon.cmd" <<'EOF'
@echo off
setlocal
set "DIR=%~dp0"
node "%DIR%..\lib\cli\cli.cjs" %*
EOF
    cat > "$work/bin/runcanon-mcp.cmd" <<'EOF'
@echo off
setlocal
set "DIR=%~dp0"
node "%DIR%..\lib\mcp\mcp.cjs" %*
EOF
    (cd "$work" && zip -qr "$OUT_DIR/$archive_name" bin lib)
  else
    cat > "$work/bin/runcanon" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  case "$SOURCE" in /*) ;; *) SOURCE="$DIR/$SOURCE" ;; esac
done
DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
exec node "$DIR/../lib/cli/cli.cjs" "$@"
EOF
    cat > "$work/bin/runcanon-mcp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  case "$SOURCE" in /*) ;; *) SOURCE="$DIR/$SOURCE" ;; esac
done
DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
exec node "$DIR/../lib/mcp/mcp.cjs" "$@"
EOF
    chmod +x "$work/bin/runcanon" "$work/bin/runcanon-mcp"
    tar -czf "$OUT_DIR/$archive_name" -C "$work" bin lib
  fi

  echo "  packed $archive_name"
}

mkdir -p "$OUT_DIR"
pack_platform "darwin-arm64" "runcanon-${VERSION}-darwin-arm64.tar.gz"
pack_platform "darwin-x64" "runcanon-${VERSION}-darwin-x64.tar.gz"
pack_platform "linux-x64" "runcanon-${VERSION}-linux-x64.tar.gz"
pack_platform "win-x64" "runcanon-${VERSION}-win-x64.zip"

# SHA256 checksums
: > "$OUT_DIR/SHA256SUMS"
for f in "$OUT_DIR"/runcanon-"${VERSION}"-*; do
  [[ -f "$f" ]] || continue
  basename="$(basename "$f")"
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk -v n="$basename" '{print $1 "  " n}' >> "$OUT_DIR/SHA256SUMS"
  else
    sha256sum "$f" | awk -v n="$basename" '{print $1 "  " n}' >> "$OUT_DIR/SHA256SUMS"
  fi
done

CHECKSUMS_SHA="$(shasum -a 256 "$OUT_DIR/SHA256SUMS" 2>/dev/null | awk '{print $1}' || sha256sum "$OUT_DIR/SHA256SUMS" | awk '{print $1}')"

if $SIGN && command -v gpg >/dev/null 2>&1; then
  gpg --armor --detach-sign --output "$OUT_DIR/SHA256SUMS.asc" "$OUT_DIR/SHA256SUMS"
  echo "  signed SHA256SUMS → SHA256SUMS.asc"
fi

# manifest.json
node <<NODE
const fs = require('fs');
const path = require('path');
const sums = fs.readFileSync('$OUT_DIR/SHA256SUMS', 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [sha256, name] = line.split(/\s+/);
    const m = name.match(/runcanon-([\\d.]+)-(darwin-arm64|darwin-x64|linux-x64|win-x64)\\.(tar\\.gz|zip)/);
    return {
      id: m[2],
      file: name,
      sha256,
      url: '/downloads/v$VERSION/' + name,
      kind: name.endsWith('.zip') ? 'zip' : 'tar.gz',
    };
  });

const manifest = {
  schemaVersion: '1.0.0',
  version: '$VERSION',
  releasedAt: new Date().toISOString(),
  minNode: '20.0.0',
  requiresNode: true,
  checksumsFile: '/downloads/v$VERSION/SHA256SUMS',
  checksumsSha256: '$CHECKSUMS_SHA',
  artifacts: sums,
  install: {
    unix: '/api/releases/install.sh',
    windows: '/api/releases/install.ps1',
  },
  notes: 'Verify SHA256 before install. Code-signed native binaries ship when RUNCANON_CLI_SIGN=1 in CI.',
};

fs.writeFileSync('$OUT_DIR/manifest.json', JSON.stringify(manifest, null, 2) + '\\n');
fs.writeFileSync('$RELEASE_ROOT/latest.json', JSON.stringify({ version: '$VERSION', path: '/downloads/v$VERSION/manifest.json' }, null, 2) + '\\n');
NODE

rm -rf "$STAGING"
echo "Done. Manifest: $OUT_DIR/manifest.json"
echo "Serve from RUNCANON_RELEASES_DIR=$RELEASE_ROOT"
