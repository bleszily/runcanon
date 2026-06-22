#!/usr/bin/env node
/**
 * Sync VERSION (or --set value) into workspace package.json files and core/version.ts.
 * Usage: node scripts/sync-version.mjs [--set 0.1.2+20260321.120000]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readVersion() {
  const setIdx = process.argv.indexOf("--set");
  if (setIdx !== -1 && process.argv[setIdx + 1]) {
    return process.argv[setIdx + 1].trim();
  }
  return readFileSync(join(root, "VERSION"), "utf8").trim();
}

function listWorkspacePackageJsonPaths() {
  const paths = [];
  for (const group of ["packages", "apps"]) {
    const groupDir = join(root, group);
    for (const name of readdirSync(groupDir)) {
      const pkgPath = join(groupDir, name, "package.json");
      try {
        if (statSync(pkgPath).isFile()) paths.push(pkgPath);
      } catch {
        // skip
      }
    }
  }
  return paths;
}

function updatePackageJson(path, semverBase) {
  const raw = readFileSync(path, "utf8");
  const pkg = JSON.parse(raw);
  pkg.version = semverBase;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

const version = readVersion();
const semverBase = version.split("+")[0];

writeFileSync(join(root, "VERSION"), `${semverBase}\n`, "utf8");

writeFileSync(
  join(root, "packages/core/src/version.ts"),
  `/** RunCanon release version — synced from /VERSION by scripts/sync-version.mjs */\nexport const RUNCANON_VERSION = "${version}";\n`,
  "utf8"
);

const updated = [];
for (const pkgPath of listWorkspacePackageJsonPaths()) {
  updatePackageJson(pkgPath, semverBase);
  updated.push(pkgPath.replace(`${root}/`, ""));
}

console.log(`Synced RunCanon version ${version} (semver ${semverBase})`);
for (const p of updated.sort()) {
  console.log(`  ${p}`);
}
