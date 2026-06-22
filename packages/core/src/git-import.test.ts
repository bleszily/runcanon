import { describe, expect, it } from "vitest";

import { isPrimarySkillMarkdownPath } from "./import-normalize.js";
import { parseGitRepoUrl, gitImportRequestSchema } from "./git-import.js";

describe("isPrimarySkillMarkdownPath via git-import", () => {
  it("only indexes SKILL.md under skills directories", () => {
    expect(isPrimarySkillMarkdownPath("skills/foo/SKILL.md")).toBe(true);
    expect(isPrimarySkillMarkdownPath("skills/foo/NOTES.md")).toBe(false);
  });
});

describe("parseGitRepoUrl", () => {
  it("parses GitHub HTTPS URLs", () => {
    const ref = parseGitRepoUrl("https://github.com/org/my-skills/tree/main/.cursor/skills");
    expect(ref.provider).toBe("github");
    expect(ref.owner).toBe("org");
    expect(ref.repo).toBe("my-skills");
    expect(ref.branch).toBe("main");
    expect(ref.pathPrefix).toBe(".cursor/skills");
  });

  it("parses Bitbucket HTTPS URLs", () => {
    const ref = parseGitRepoUrl("https://bitbucket.org/workspace/repo/src/develop/skills");
    expect(ref.provider).toBe("bitbucket");
    expect(ref.owner).toBe("workspace");
    expect(ref.repo).toBe("repo");
    expect(ref.branch).toBe("develop");
  });

  it("parses owner/repo shorthand", () => {
    const ref = parseGitRepoUrl("acme/skills", "github");
    expect(ref.owner).toBe("acme");
    expect(ref.repo).toBe("skills");
  });

  it("rejects invalid slugs in schema", () => {
    expect(() => gitImportRequestSchema.parse({ provider: "github", owner: "../x", repo: "y", branch: "main" })).toThrow();
  });
});
