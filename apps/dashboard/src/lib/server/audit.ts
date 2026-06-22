import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { SkillPaths } from "./registry.js";

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  resourceType: "skill" | "proposal" | "config" | "mine" | "export";
  resourceId?: string;
  note?: string;
  beforeHash?: string;
  afterHash?: string;
}

export async function appendAudit(paths: SkillPaths, entry: Omit<AuditEntry, "id" | "timestamp">): Promise<AuditEntry> {
  await mkdir(paths.dataDir, { recursive: true });
  const record: AuditEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  await appendFile(join(paths.dataDir, "audit.jsonl"), `${JSON.stringify(record)}\n`, "utf-8");
  return record;
}

export async function readRecentAudit(paths: SkillPaths, limit = 50): Promise<AuditEntry[]> {
  const { readFile } = await import("node:fs/promises");
  try {
    const raw = await readFile(join(paths.dataDir, "audit.jsonl"), "utf-8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as AuditEntry)
      .reverse();
  } catch {
    return [];
  }
}
