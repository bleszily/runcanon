import { describe, expect, it } from "vitest";

import { sparklineFromTimestamps, sparklinePendingProposals } from "./dashboard-stats.js";

describe("sparklinePendingProposals", () => {
  it("returns flat zeros when nothing is pending", () => {
    const line = sparklinePendingProposals([
      { status: "applied", createdAt: "2026-06-20T10:00:00.000Z" },
      { status: "rejected", createdAt: "2026-06-21T10:00:00.000Z" },
    ]);
    expect(line.every((value) => value === 0)).toBe(true);
  });

  it("includes only pending proposals in the sparkline", () => {
    const line = sparklinePendingProposals([
      { status: "pending", createdAt: "2026-06-20T10:00:00.000Z" },
      { status: "applied", createdAt: "2026-06-20T11:00:00.000Z" },
      { status: "pending", createdAt: "2026-06-21T10:00:00.000Z" },
    ]);
    expect(line.at(-1)).toBe(2);
    expect(sparklineFromTimestamps([]).every((value) => value === 0)).toBe(true);
  });
});
