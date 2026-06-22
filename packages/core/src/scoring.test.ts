import { describe, expect, it } from "vitest";

import type { Episode } from "@runcanon/spec";

import { computeGoalAlignment, computeGoalAlignmentEnhanced } from "./scoring.js";

const cveEpisodes: Episode[] = [
  {
    id: "ep-1",
    sessionId: "s1",
    intent: "Triage Apiiro CVE findings for this repo",
    signature: ["fetch_apiiro_risks", "triage_vulnerability"],
    outcome: "success",
    events: [],
  },
  {
    id: "ep-2",
    sessionId: "s2",
    intent: "Audit npm dependencies for known CVEs",
    signature: ["search_codebase", "audit_dependencies"],
    outcome: "success",
    events: [],
  },
];

describe("computeGoalAlignment", () => {
  it("returns 0 when project goals are empty", () => {
    expect(computeGoalAlignment(cveEpisodes, [])).toBe(0);
    expect(computeGoalAlignmentEnhanced(cveEpisodes, [])).toBe(0);
  });

  it("returns 0 when there are no episodes", () => {
    expect(
      computeGoalAlignmentEnhanced([], ["Automate CVE triage and security remediation"])
    ).toBe(0);
  });

  it("scores alignment when goals match trajectory intents", () => {
    const goals = [
      "Automate CVE triage and vulnerability prioritization",
      "Audit dependencies for known security issues",
    ];
    const score = computeGoalAlignmentEnhanced(cveEpisodes, goals);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("returns low alignment for unrelated goals", () => {
    const score = computeGoalAlignmentEnhanced(cveEpisodes, ["Improve frontend UI animations"]);
    expect(score).toBeLessThan(0.2);
  });
});
