import { createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { encryptionKey } from "./env.js";
import { dataDir } from "./store.js";

export interface SkillBundleManifest {
  id: string;
  version: string;
  createdAt: string;
  createdBy: string;
  skillIds: string[];
  harnesses: string[];
  signature: string;
  algorithm: "HMAC-SHA256";
}

function bundlesDir(): string {
  return join(dataDir(), "org", "bundles");
}

function signingSecret(): string {
  const key = encryptionKey() ?? process.env.RUNCANON_BUNDLE_SIGNING_KEY;
  if (!key) {
    throw new Error("RUNCANON_ENCRYPTION_KEY or RUNCANON_BUNDLE_SIGNING_KEY required for signed bundles");
  }
  return key;
}

function signPayload(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("hex");
}

/** Create a signed manifest for an air-gapped skill bundle export. */
export async function createSignedSkillBundle(input: {
  skillIds: string[];
  harnesses: string[];
  createdBy: string;
  markdownFiles: Record<string, string>;
}): Promise<{ bundleId: string; manifest: SkillBundleManifest; bundlePath: string }> {
  await mkdir(bundlesDir(), { recursive: true });
  const bundleId = randomUUID();
  const bundlePath = join(bundlesDir(), bundleId);
  await mkdir(bundlePath, { recursive: true });

  for (const [skillId, markdown] of Object.entries(input.markdownFiles)) {
    await writeFile(join(bundlePath, `${skillId}.md`), markdown, "utf-8");
  }

  const manifestBody = {
    id: bundleId,
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    skillIds: input.skillIds,
    harnesses: input.harnesses,
    algorithm: "HMAC-SHA256" as const,
  };

  const signature = signPayload(JSON.stringify(manifestBody));
  const manifest: SkillBundleManifest = { ...manifestBody, signature };
  await writeFile(join(bundlePath, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  return { bundleId, manifest, bundlePath };
}

/** Verify a signed bundle manifest (air-gapped import validation). */
export function verifySkillBundleManifest(manifest: SkillBundleManifest): boolean {
  const { signature, ...body } = manifest;
  const expected = signPayload(JSON.stringify({ ...body, algorithm: manifest.algorithm }));
  return signature === expected;
}

export async function readSkillBundle(bundleId: string): Promise<{
  manifest: SkillBundleManifest;
  files: Record<string, string>;
}> {
  const bundlePath = join(bundlesDir(), bundleId);
  const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf-8")) as SkillBundleManifest;
  if (!verifySkillBundleManifest(manifest)) {
    throw new Error("Bundle signature verification failed");
  }

  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(bundlePath);
  const files: Record<string, string> = {};
  for (const entry of entries.filter((e) => e.endsWith(".md"))) {
    const skillId = entry.replace(/\.md$/, "");
    files[skillId] = await readFile(join(bundlePath, entry), "utf-8");
  }
  return { manifest, files };
}
