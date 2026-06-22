import { describe, expect, it } from "vitest";

import {
  isPrimarySkillMarkdownPath,
  normalizeImportedSkillMarkdown,
  splitSkillMarkdown,
} from "./import-normalize.js";
import { parseImportedSkillMarkdown } from "./skill-import.js";

const CURSOR_SKILL = `---
name: implement
description: "Implement a piece of work based on a PRD or set of issues."
disable-model-invocation: true
---

Implement the work described by the user in the PRD or issues.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /review to review the work.

Commit your work to the current branch.
`;

describe("isPrimarySkillMarkdownPath", () => {
  it("accepts SKILL.md under skills trees", () => {
    expect(isPrimarySkillMarkdownPath("skills/engineering/implement/SKILL.md")).toBe(true);
    expect(isPrimarySkillMarkdownPath(".cursor/skills/my-skill/SKILL.md")).toBe(true);
    expect(isPrimarySkillMarkdownPath(".claude/skills/triage/SKILL.md")).toBe(true);
  });

  it("rejects auxiliary markdown in skill folders", () => {
    expect(isPrimarySkillMarkdownPath("skills/engineering/codebase-design/DEEPENING.md")).toBe(false);
    expect(isPrimarySkillMarkdownPath("skills/engineering/domain-modeling/ADR-FORMAT.md")).toBe(false);
    expect(isPrimarySkillMarkdownPath("docs/invocation.md")).toBe(false);
    expect(isPrimarySkillMarkdownPath("README.md")).toBe(false);
  });
});

describe("splitSkillMarkdown", () => {
  it("handles UTF-8 BOM and CRLF", () => {
    const content = `\uFEFF---\r\nname: demo\r\ndescription: test\r\n---\r\n\r\nBody text.`;
    const { frontmatter, body } = splitSkillMarkdown(content);
    expect(frontmatter.name).toBe("demo");
    expect(body).toContain("Body text.");
  });

  it("returns body-only when no frontmatter", () => {
    const { frontmatter, body, hasFrontmatter } = splitSkillMarkdown("# Title\n\nDo the thing.");
    expect(hasFrontmatter).toBe(false);
    expect(frontmatter).toEqual({});
    expect(body).toContain("Do the thing.");
  });
});

describe("normalizeImportedSkillMarkdown", () => {
  it("normalizes Cursor/Claude agent SKILL.md", () => {
    const { skill, format } = normalizeImportedSkillMarkdown(
      CURSOR_SKILL,
      "skills/engineering/implement/SKILL.md"
    );

    expect(format).toBe("agent-skill");
    expect(skill.id).toBe("implement");
    expect(skill.name).toBe("Implement");
    expect(skill.description).toContain("PRD");
    expect(skill.harnesses).toContain("cursor");
    expect(skill.triggers.length).toBeGreaterThan(0);
    expect(skill.workflow.length).toBeGreaterThan(0);
    expect(skill.invocation?.disableModelInvocation).toBe(true);
    expect(skill.tags).toContain("engineering");
  });

  it("derives workflow from bullet lists", () => {
    const content = `---
name: checklist
description: Run a checklist
---

- First step here
- Second step here
- Third step here
`;
    const { skill } = normalizeImportedSkillMarkdown(content);
    expect(skill.workflow).toHaveLength(3);
    expect(skill.workflow[0].instruction).toContain("First step");
  });

  it("maps when_to_use to triggers", () => {
    const content = `---
name: review
description: Review code changes
when_to_use:
  - user asks for a code review
  - before opening a pull request
---

Review the diff carefully.
`;
    const { skill } = normalizeImportedSkillMarkdown(content);
    expect(skill.triggers).toHaveLength(2);
    expect(skill.triggers[0].pattern).toContain("code review");
  });

  it("marks deprecated folder skills", () => {
    const { skill } = normalizeImportedSkillMarkdown(
      CURSOR_SKILL,
      "skills/deprecated/qa/SKILL.md"
    );
    expect(skill.status).toBe("deprecated");
    expect(skill.tags).toContain("deprecated");
  });

  it("infers harness from .claude path", () => {
    const { skill } = normalizeImportedSkillMarkdown(
      CURSOR_SKILL,
      ".claude/skills/implement/SKILL.md"
    );
    expect(skill.harnesses).toEqual(["claude"]);
  });

  it("handles body-only markdown using path id", () => {
    const { skill, format } = normalizeImportedSkillMarkdown(
      "Follow the security checklist before deploy.",
      "skills/security/pre-deploy/SKILL.md"
    );
    expect(format).toBe("markdown-only");
    expect(skill.id).toBe("pre-deploy");
    expect(skill.workflow.length).toBeGreaterThan(0);
  });

  it("preserves valid RunCanon skills", () => {
    const runcanon = `---
id: triage-cve
name: Triage CVEs
description: Contextually triage CVE findings using the security methodology.
version: 1
status: active
scope:
  - org-wide
harnesses:
  - claude
tags:
  - triage
  - cve
triggers:
  - pattern: triage CVEs for {repo}
metrics:
  frequency: 0
  successRate: 0
  failureRate: 0
  weaknessScore: 0
  stalenessScore: 0
  importanceScore: 0.5
  generatedAt: "2026-01-01T00:00:00.000Z"
  sampleSize: 0
---

## workflow

1. **Load methodology**
2. **Classify findings**
`;
    const { skill, format } = normalizeImportedSkillMarkdown(runcanon);
    expect(format).toBe("runcanon");
    expect(skill.id).toBe("triage-cve");
    expect(skill.workflow.length).toBeGreaterThanOrEqual(2);
  });

  it("fills partial RunCanon frontmatter", () => {
    const partial = `---
id: cloud-security
name: Cloud Security
description: Harden cloud workloads
version: 2
tags:
  - security
  - cloud
---

## workflow

1. **Review IAM**
2. **Review network rules**
`;
    const { skill, format, warnings } = normalizeImportedSkillMarkdown(partial);
    expect(format).toBe("partial-runcanon");
    expect(warnings.some((w) => w.includes("Partial RunCanon"))).toBe(true);
    expect(skill.scope).toEqual(["org-wide"]);
    expect(skill.harnesses.length).toBeGreaterThan(0);
    expect(skill.triggers.length).toBeGreaterThan(0);
    expect(skill.metrics.sampleSize).toBe(0);
  });

  it("rejects empty files", () => {
    expect(() => normalizeImportedSkillMarkdown("   \n")).toThrow(/empty/i);
  });
});

describe("parseImportedSkillMarkdown", () => {
  it("sets proposed status and imported metadata", () => {
    const skill = parseImportedSkillMarkdown(CURSOR_SKILL, "skills/engineering/implement/SKILL.md");
    expect(skill.status).toBe("proposed");
    expect(skill.metadata?.importedFrom).toBe("skills/engineering/implement/SKILL.md");
    expect(skill.metadata?.generatedBy).toBe("import-normalize");
  });
});
