import { describe, expect, it } from "vitest";

import { registeredHarnesses, renderProjectInstructionsForHarness, renderSkillForHarness } from "./index.js";

import type { Skill } from "../types.js";

const sampleSkill: Skill = {
  id: "triage-cve",
  name: "Triage CVEs",
  description: "Contextually triage CVE findings using the security methodology.",
  version: 1,
  status: "active",
  scope: ["security"],
  harnesses: ["claude", "cursor", "copilot", "codex", "openai"],
  tags: ["triage", "cve", "security"],
  triggers: [{ pattern: "triage CVEs for {repo}" }],
  preconditions: ["CVE list available"],
  workflow: [
    { id: "1", instruction: "Load security methodology", action: "security_guide" },
    { id: "2", instruction: "Classify each finding", action: "triage_vulnerability" },
  ],
  validation: [{ description: "All findings classified", severity: "error" }],
  examples: [{ prompt: "Triage CVEs for consent-api", plan: "Run triage workflow" }],
  metrics: {
    frequency: 12,
    successRate: 0.95,
    weaknessScore: 0.1,
    stalenessScore: 0.05,
    importanceScore: 0.85,
    generatedAt: new Date().toISOString(),
    sampleSize: 12,
  },
};

describe("registered harnesses", () => {
  const harnesses = registeredHarnesses();

  it("includes primary agent targets", () => {
    expect(harnesses).toContain("claude");
    expect(harnesses).toContain("cursor");
    expect(harnesses).toContain("copilot");
    expect(harnesses).toContain("codex");
  });

  it.each(harnesses)("renders skill files for %s", (harness) => {
    const skill = { ...sampleSkill, harnesses: [harness as Skill["harnesses"][number]] };
    const rendered = renderSkillForHarness(harness as Skill["harnesses"][number], skill);
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered[0]?.path).toBeTruthy();
    expect(rendered[0]?.content.length).toBeGreaterThan(0);
  });

  it.each(["claude", "cursor", "copilot", "codex"] as const)(
    "renders project instructions for %s when supported",
    (harness) => {
      const instructions = renderProjectInstructionsForHarness(harness, [sampleSkill]);
      if (instructions) {
        expect(instructions.path).toBeTruthy();
        expect(instructions.content.length).toBeGreaterThan(50);
        expect(
          instructions.content.includes("triage-cve") ||
            instructions.content.includes("triage CVEs") ||
            instructions.content.includes("Triage CVEs")
        ).toBe(true);
      }
    }
  );
});
