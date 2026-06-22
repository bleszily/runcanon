import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

export interface ReleaseArtifact {
  id: string;
  file: string;
  sha256: string;
  url: string;
  kind: "tar.gz" | "zip";
}

export interface ReleaseManifest {
  schemaVersion: string;
  version: string;
  releasedAt: string;
  minNode?: string;
  requiresNode?: boolean;
  checksumsFile: string;
  checksumsSha256: string;
  artifacts: ReleaseArtifact[];
  install: { unix: string; windows: string };
  notes?: string;
}

export interface LatestReleasePointer {
  version: string;
  path: string;
}

function releasesRoot(): string {
  return process.env.RUNCANON_RELEASES_DIR ?? join(process.cwd(), "releases");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function resolveReleaseFile(relativePath: string): string {
  const root = releasesRoot();
  const normalized = relativePath.replace(/^\/+/, "").replace(/^downloads\//, "");
  const full = join(root, normalized);
  if (!full.startsWith(root)) {
    throw new Error("Invalid release path");
  }
  return full;
}

export async function readLatestReleasePointer(): Promise<LatestReleasePointer | undefined> {
  const path = join(releasesRoot(), "latest.json");
  if (!(await exists(path))) return undefined;
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as LatestReleasePointer;
}

export async function readReleaseManifest(version?: string): Promise<ReleaseManifest | undefined> {
  const root = releasesRoot();
  let manifestPath: string;

  if (version) {
    manifestPath = join(root, `v${version.replace(/^v/, "")}`, "manifest.json");
  } else {
    const latest = await readLatestReleasePointer();
    if (!latest) return undefined;
    manifestPath = join(root, latest.path.replace(/^\/downloads\//, ""));
  }

  if (!(await exists(manifestPath))) return undefined;
  const raw = await readFile(manifestPath, "utf-8");
  return JSON.parse(raw) as ReleaseManifest;
}

export function detectPlatformId(): string {
  const { platform, arch } = process;
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  if (platform === "darwin") return "darwin-x64";
  if (platform === "win32") return "win-x64";
  return "linux-x64";
}
