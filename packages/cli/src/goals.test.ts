import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initializeProject } from "./cli.js";
import { addGoals, clearGoals, listGoals, setGoals } from "./goals.js";

async function makeTempDir(prefix: string): Promise<string> {
  const path = resolve(tmpdir(), `${prefix}-${randomUUID()}`);
  await mkdir(path, { recursive: true });
  return path;
}

describe("goals", () => {
  let tempDir: string;
  let priorConfigDir: string | undefined;

  beforeEach(async () => {
    priorConfigDir = process.env.RUNCANON_CONFIG_DIR;
    process.env.RUNCANON_CONFIG_DIR = await makeTempDir("runcanon-goals-creds");
    tempDir = await makeTempDir("runcanon-goals-test");
    await initializeProject(tempDir);
  });

  afterEach(async () => {
    if (priorConfigDir === undefined) {
      delete process.env.RUNCANON_CONFIG_DIR;
    } else {
      process.env.RUNCANON_CONFIG_DIR = priorConfigDir;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("sets, lists, adds, and clears local goals", async () => {
    await setGoals(["Automate CVE triage"], { project: tempDir });
    let listed = await listGoals({ project: tempDir });
    expect(listed.goals).toEqual(["Automate CVE triage"]);

    await addGoals(["Audit dependencies"], { project: tempDir });
    listed = await listGoals({ project: tempDir });
    expect(listed.goals).toEqual(["Automate CVE triage", "Audit dependencies"]);

    await clearGoals({ project: tempDir });
    listed = await listGoals({ project: tempDir });
    expect(listed.goals).toEqual([]);
  });

  it("deduplicates goals case-insensitively", async () => {
    await setGoals(["Automate CVE triage", "automate cve triage"], { project: tempDir });
    const listed = await listGoals({ project: tempDir });
    expect(listed.goals).toEqual(["Automate CVE triage"]);
  });
});
