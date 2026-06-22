import { describe, expect, it } from "vitest";

import { isNearDuplicateSkillKey, matchesAnyActiveSkillKey } from "./path-labels.js";

describe("isNearDuplicateSkillKey", () => {
  it("matches exact keys", () => {
    expect(isNearDuplicateSkillKey("audit-dependencies-known-cves", "audit-dependencies-known-cves")).toBe(true);
  });

  it("matches near-duplicate audit dependency skills with different slugs", () => {
    expect(
      isNearDuplicateSkillKey("audit-core-package-dependencies", "audit-dependencies-known-cves")
    ).toBe(true);
    expect(
      isNearDuplicateSkillKey("audit-core-package-dependency-cves", "audit-dependencies-known-cves")
    ).toBe(true);
  });

  it("does not match unrelated skills", () => {
    expect(isNearDuplicateSkillKey("cve-triage-search-codebase", "audit-dependencies-known-cves")).toBe(
      false
    );
  });

  it("matchesAnyActiveSkillKey checks all active keys", () => {
    const active = new Set(["audit-dependencies-known-cves"]);
    expect(matchesAnyActiveSkillKey("audit-core-package-dependencies", active)).toBe(true);
  });
});
