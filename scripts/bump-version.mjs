#!/usr/bin/env node
/**
 * Bump VERSION and sync workspace packages.
 *
 *   node scripts/bump-version.mjs patch|minor|major
 *   node scripts/bump-version.mjs build   # 0.1.1+20260321.184530 (unique per build)
 *   node scripts/bump-version.mjs --set 0.2.0
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const versionPath = join(root, "VERSION");

function readBaseVersion() {
  return readFileSync(versionPath, "utf8").trim().split("+")[0];
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`Invalid semver base: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function formatBuildId(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}.${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
}

function bump(kind) {
  const base = readBaseVersion();
  const { major, minor, patch } = parseSemver(base);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  if (kind === "build") {
    const buildId = process.env.RUNCANON_BUILD_ID?.trim() || formatBuildId();
    return `${base}+${buildId}`;
  }
  throw new Error(`Unknown bump kind: ${kind}. Use patch, minor, major, or build.`);
}

const args = process.argv.slice(2);
const next = args[0] === "--set" && args[1] ? args[1].trim() : bump(args[0] || "patch");

const sync = spawnSync(process.execPath, ["scripts/sync-version.mjs", "--set", next], {
  cwd: root,
  stdio: "inherit",
});

if (sync.status !== 0) {
  process.exit(sync.status ?? 1);
}

console.log(`Version is now ${next}`);
