import { describe, expect, it } from "vitest";

import { autonomousLadderCount, formatAutonomyRiskSummary } from "./autonomy-summary.js";

describe("autonomousLadderCount", () => {
  const askLadders = [{ level: "ask" as const }, { level: "ask" as const }];

  it("returns 0 when global autonomy is disabled", () => {
    expect(autonomousLadderCount(askLadders, false, false)).toBe(0);
  });

  it("returns 0 when emergency stop is active", () => {
    expect(autonomousLadderCount([{ level: "do-show" }], true, true)).toBe(0);
  });

  it("does not count ask or show levels", () => {
    expect(autonomousLadderCount(askLadders, true, false)).toBe(0);
  });

  it("counts do-show and do-tell levels", () => {
    expect(
      autonomousLadderCount(
        [{ level: "do-show" }, { level: "do-tell" }, { level: "ask" }],
        true,
        false
      )
    ).toBe(2);
  });
});

describe("formatAutonomyRiskSummary", () => {
  it("matches disabled global autonomy with ask-only ladders", () => {
    expect(
      formatAutonomyRiskSummary({
        globalEnabled: false,
        emergencyStop: false,
        autonomousCount: 0,
        ladderCount: 2,
        undoWindowMinutes: 5,
      })
    ).toBe(
      "Global autonomy is disabled. 0 of 2 task types can execute without explicit confirmation. Undo window is 5 minutes."
    );
  });
});
