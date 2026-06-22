import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseSkill, serializeSkill } from "@runcanon/spec";
import type { Skill } from "@runcanon/spec";

import { initializeProject, runExport } from "./cli.js";
import {
  approveProposal,
  defaultRegistry,
  loadRegistry,
  rejectProposal,
  retireSkill,
  saveRegistry,
  upsertSkill,
} from "./registry.js";

async function makeTempDir(): Promise<string> {
  const path = resolve(tmpdir(), `runcanon-cli-test-${randomUUID()}`);
  await mkdir(path, { recursive: true });
  return path;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

function buildSampleSkill(id: string, status: Skill["status"] = "active"): Skill {
  const now = new Date().toISOString();
  return {
    id,
    name: `${id} Skill`,
    description: `Description for ${id}.`,
    version: 1,
    status,
    scope: ["workspace-wide"],
    harnesses: ["claude"],
    tags: ["test"],
    triggers: [{ pattern: `run ${id}` }],
    preconditions: [],
    workflow: [{ id: "1", instruction: "Do the thing.", action: "thing" }],
    validation: [],
    examples: [],
    metrics: {
      frequency: 1,
      successRate: 1,
      weaknessScore: 0,
      stalenessScore: 0,
      importanceScore: 0.5,
      generatedAt: now,
      sampleSize: 1,
    },
  };
}

async function addActiveSkill(tempDir: string, skill: Skill): Promise<void> {
  const activeDir = join(tempDir, ".runcanon", "skills", "active");
  await mkdir(activeDir, { recursive: true });
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(join(activeDir, `${skill.id}.md`), serializeSkill(skill), "utf-8")
  );
  const registry = await loadRegistry(join(tempDir, ".runcanon", "skills-index.json"));
  if (!registry.active.includes(skill.id)) {
    registry.active.push(skill.id);
  }
  upsertSkill(registry, skill);
  await saveRegistry(join(tempDir, ".runcanon", "skills-index.json"), registry);
}

describe("initializeProject", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates config, directories, and an empty registry", async () => {
    await initializeProject(tempDir);

    expect(await fileExists(join(tempDir, "runcanon.config.yaml"))).toBe(true);
    expect(await dirExists(join(tempDir, ".runcanon", "skills", "active"))).toBe(true);
    expect(await dirExists(join(tempDir, ".runcanon", "skills", "proposed"))).toBe(true);
    expect(await dirExists(join(tempDir, ".runcanon", "trajectories"))).toBe(true);
    expect(await fileExists(join(tempDir, ".runcanon", "skills-index.json"))).toBe(true);

    const registry = await loadRegistry(join(tempDir, ".runcanon", "skills-index.json"));
    expect(registry.active).toEqual([]);
    expect(registry.draft).toEqual([]);
    expect(registry.retired).toEqual([]);
    expect(registry.skills).toEqual([]);
    expect(registry.schemaVersion).toBeTruthy();
  });
});

describe("registry operations", () => {
  let tempDir: string;
  let registryPath: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
    registryPath = join(tempDir, "skills-index.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loads a default registry when none exists", async () => {
    const registry = await loadRegistry(registryPath);
    expect(registry.schemaVersion).toBeTruthy();
    expect(registry.active).toEqual([]);
    expect(registry.draft).toEqual([]);
    expect(registry.retired).toEqual([]);
  });

  it("persists and reloads registry changes", async () => {
    const registry = defaultRegistry();
    await saveRegistry(registryPath, registry);

    const reloaded = await loadRegistry(registryPath);
    expect(reloaded.generatedAt).toBe(registry.generatedAt);
    expect(reloaded.schemaVersion).toBe(registry.schemaVersion);
  });

  it("tracks skill lifecycle transitions", async () => {
    const registry = defaultRegistry();
    const skill = buildSampleSkill("lifecycle-test", "proposed");

    upsertSkill(registry, skill);
    registry.draft.push(skill.id);

    approveProposal(registry, skill);
    expect(registry.active).toContain("lifecycle-test");
    expect(registry.draft).not.toContain("lifecycle-test");
    expect(registry.skills.find((s) => s.id === skill.id)?.status).toBe("active");

    retireSkill(registry, skill.id);
    expect(registry.active).not.toContain("lifecycle-test");
    expect(registry.retired).toContain("lifecycle-test");
    expect(registry.skills.find((s) => s.id === skill.id)?.status).toBe("retired");

    const skill2 = buildSampleSkill("reject-test", "proposed");
    upsertSkill(registry, skill2);
    registry.draft.push(skill2.id);
    rejectProposal(registry, skill2);
    expect(registry.draft).not.toContain("reject-test");
    expect(registry.skills.find((s) => s.id === skill2.id)?.status).toBe("deprecated");

    await saveRegistry(registryPath, registry);
    const reloaded = await loadRegistry(registryPath);
    expect(reloaded.retired).toContain("lifecycle-test");
    expect(reloaded.skills.find((s) => s.id === "reject-test")?.status).toBe("deprecated");
  });
});

describe("runExport", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("exports active skill to the requested harness", async () => {
    await initializeProject(tempDir);
    const skill = buildSampleSkill("export-test", "active");
    await addActiveSkill(tempDir, skill);

    await runExport({ project: tempDir, harness: "claude" });

    expect(await fileExists(join(tempDir, ".claude", "skills", "export-test", "SKILL.md"))).toBe(true);
    expect(await fileExists(join(tempDir, "CLAUDE.md"))).toBe(true);

    const skillFile = await readFile(join(tempDir, ".claude", "skills", "export-test", "SKILL.md"), "utf-8");
    expect(skillFile).toContain("export-test Skill");
    expect(skillFile).toContain("when_to_use");
  });

  it("exports all configured harnesses when harness is all", async () => {
    await initializeProject(tempDir);
    const configPath = join(tempDir, "runcanon.config.yaml");
    const configText = await readFile(configPath, "utf-8");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        configPath,
        configText.replace("harnesses:\n  - claude", "harnesses:\n  - claude\n  - cursor\n  - copilot"),
        "utf-8"
      )
    );

    const first = buildSampleSkill("first-skill", "active");
    first.harnesses = ["claude", "cursor", "copilot"];
    const second = buildSampleSkill("second-skill", "active");
    second.harnesses = ["claude", "cursor", "copilot"];
    await addActiveSkill(tempDir, first);
    await addActiveSkill(tempDir, second);

    await runExport({ project: tempDir, harness: "all" });

    expect(await fileExists(join(tempDir, ".claude", "skills", "first-skill", "SKILL.md"))).toBe(true);
    expect(await fileExists(join(tempDir, ".cursor", "skills", "first-skill", "SKILL.md"))).toBe(true);
    expect(await fileExists(join(tempDir, ".github", "instructions", "first-skill.instructions.md"))).toBe(true);
  });
});
