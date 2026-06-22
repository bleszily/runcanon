import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { collectEventsFromSources, filterWorkflowMiningEvents, filterClusteringEvents } from "./sources.js";

async function makeTempDir(): Promise<string> {
  const path = resolve(tmpdir(), `runcanon-sources-${randomUUID()}`);
  await mkdir(path, { recursive: true });
  return path;
}

describe("collectEventsFromSources", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads trajectory jsonl files completely", async () => {
    const trajDir = join(tempDir, ".runcanon", "trajectories");
    await mkdir(trajDir, { recursive: true });
    await writeFile(
      join(trajDir, "session.jsonl"),
      [
        JSON.stringify({
          id: "e1",
          sessionId: "s1",
          sequence: 0,
          timestamp: new Date().toISOString(),
          actor: "user",
          type: "message",
          intent: "run security scan",
        }),
        JSON.stringify({
          id: "e2",
          sessionId: "s1",
          sequence: 1,
          timestamp: new Date().toISOString(),
          actor: "agent",
          type: "tool_call",
          action: "scan",
        }),
      ].join("\n"),
      "utf-8"
    );

    const result = await collectEventsFromSources(tempDir);
    expect(result.events).toHaveLength(2);
    expect(result.workflowEvents).toHaveLength(2);
    expect(result.summary.trajectoryFiles).toBe(1);
  });

  it("creates one reference event per markdown file (not per heading)", async () => {
    await writeFile(
      join(tempDir, "guide.md"),
      "# Guide\n\nIntro\n\n## Section A\n\nContent A\n\n## Section B\n\nContent B",
      "utf-8"
    );

    const result = await collectEventsFromSources(tempDir, { sources: ["guide.md"], scanProject: false });
    expect(result.events).toHaveLength(1);
    expect(result.workflowEvents).toHaveLength(0);
    expect(result.summary.documentFiles).toBe(1);
  });

  it("skips generic documentation directories", async () => {
    const docsDir = join(tempDir, "docs");
    await mkdir(docsDir, { recursive: true });
    await writeFile(join(docsDir, "readme.md"), "# Readme", "utf-8");

    const result = await collectEventsFromSources(tempDir, { sources: ["docs"], scanProject: false });
    expect(result.events).toHaveLength(0);
    expect(result.summary.skippedPaths).toContain("docs");
  });

  it("reads SKILL.md files from skills directories", async () => {
    const skillDir = join(tempDir, "skills", "triage-cve");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: triage-cve\n---\n# Triage CVE", "utf-8");

    const result = await collectEventsFromSources(tempDir, { sources: ["skills"], scanProject: false });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe("prompt_invoke");
    expect(result.summary.skillFiles).toBe(1);
  });

  it("auto-discovers nested skill catalogs when scanning the project", async () => {
    const catalog = join(tempDir, "plugins", "demo-skills", "skills", "scan-repo");
    await mkdir(catalog, { recursive: true });
    await writeFile(join(catalog, "SKILL.md"), "---\nname: scan-repo\n---\n# Scan Repo", "utf-8");

    const result = await collectEventsFromSources(tempDir);
    expect(result.summary.skillFiles).toBe(1);
    expect(result.summary.autoDiscoveredSkillDirs).toHaveLength(1);
    expect(result.summary.autoDiscoveredSkillDirs[0]).toContain("plugins/demo-skills/skills");
    expect(result.workflowEvents).toHaveLength(1);
  });

  it("dedupes the same skill from multiple catalog paths", async () => {
    const primary = join(tempDir, "vendor-a", "skills", "cloud-security", "SKILL.md");
    const duplicate = join(tempDir, "vendor-b", "skills", "cloud-security", "SKILL.md");
    await mkdir(join(primary, ".."), { recursive: true });
    await mkdir(join(duplicate, ".."), { recursive: true });
    await writeFile(primary, "---\nname: cloud-security\n---\n# Cloud Security", "utf-8");
    await writeFile(duplicate, "---\nname: cloud-security\n---\n# Cloud Security", "utf-8");

    const result = await collectEventsFromSources(tempDir, {
      sources: ["vendor-a/skills", "vendor-b/skills"],
      scanProject: false,
    });

    expect(result.summary.skillFiles).toBe(1);
    expect(result.workflowEvents).toHaveLength(1);
    expect(result.workflowEvents[0]?.sessionId).toBe("skill-cloud-security");
  });

  it("ignores harness export skill directories", async () => {
    const exportDir = join(tempDir, ".cursor", "skills", "exported-skill");
    await mkdir(exportDir, { recursive: true });
    await writeFile(join(exportDir, "SKILL.md"), "---\nname: exported-skill\n---\n# Exported", "utf-8");

    const result = await collectEventsFromSources(tempDir);
    expect(result.summary.skillFiles).toBe(0);
    expect(result.summary.autoDiscoveredSkillDirs).toHaveLength(0);
  });
});

describe("filterWorkflowMiningEvents", () => {
  it("drops document-only sessions", () => {
    const events = [
      {
        id: "d1",
        sessionId: "doc-1",
        sequence: 0,
        timestamp: new Date().toISOString(),
        actor: "user" as const,
        type: "message" as const,
        intent: "Reference: manifesto",
      },
    ];
    expect(filterWorkflowMiningEvents(events)).toHaveLength(0);
  });
});

describe("filterClusteringEvents", () => {
  it("excludes catalog skill imports from clustering", () => {
    const events = [
      {
        id: "s1",
        sessionId: "skill-cloud-security",
        sequence: 0,
        timestamp: new Date().toISOString(),
        actor: "user" as const,
        type: "prompt_invoke" as const,
        intent: "Existing skill: cloud-security",
        metadata: { sourceKind: "skill" },
      },
    ];
    expect(filterClusteringEvents(events)).toHaveLength(0);
  });
});
