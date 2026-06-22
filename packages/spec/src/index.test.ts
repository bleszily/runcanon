import { describe, expect, it } from "vitest";

import { renderClaudeSkill, serializeSkill, skillSchema } from "./index.js";

import type { Skill } from "./types.js";

const sampleSkill: Skill = {
  id: "triage-cve",
  name: "Triage CVEs",
  description: "Contextually triage CVE findings using the security methodology.",
  version: 1,
  status: "active",
  scope: ["uc-security-mcp"],
  harnesses: ["claude"],
  tags: ["triage", "cve", "security"],
  triggers: [{ pattern: "triage CVEs for {repo}" }],
  preconditions: ["CVE list available", "Security methodology loaded"],
  workflow: [
    { instruction: "Load security methodology", action: "security_guide" },
    { instruction: "Classify each finding", action: "triage_vulnerability" },
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

describe("skillSchema", () => {
  it("validates a correct skill", () => {
    expect(skillSchema.safeParse(sampleSkill).success).toBe(true);
  });

  it("rejects an invalid id", () => {
    const invalid = { ...sampleSkill, id: "Triage CVE" };
    expect(skillSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("serializeSkill", () => {
  it("produces markdown with YAML frontmatter", () => {
    const markdown = serializeSkill(sampleSkill);
    expect(markdown.startsWith("---\n")).toBe(true);
    expect(markdown).toContain("## workflow");
    expect(markdown).toContain("triage-cve");
  });
});

describe("renderClaudeSkill", () => {
  it("renders a skill directory file", () => {
    const rendered = renderClaudeSkill(sampleSkill);
    expect(rendered).toHaveLength(1);
    expect(rendered[0].path).toBe(".claude/skills/triage-cve/SKILL.md");
    expect(rendered[0].content).toContain("name:");
    expect(rendered[0].content).toContain("description:");
  });
});
