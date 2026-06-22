import { describe, expect, it } from "vitest";

import { consolidateProposalRecords, type DashboardProposalRecord } from "./proposal-consolidation.js";

function record(
  skillId: string,
  partial: Partial<DashboardProposalRecord> & Pick<DashboardProposalRecord, "id" | "status" | "action">
): DashboardProposalRecord {
  return {
    skillId,
    reason: "test",
    confidence: 0.5,
    payload: {
      id: skillId,
      name: skillId,
      description: "",
      version: 1,
      status: "proposed",
      scope: [],
      harnesses: [],
      tags: [],
      triggers: [],
      workflow: [],
      metrics: {
        frequency: 1,
        successRate: 1,
        failureRate: 0,
        weaknessScore: 0,
        stalenessScore: 0,
        importanceScore: 0.5,
        sampleSize: 2,
        generatedAt: "2026-06-21T21:00:00.000Z",
      },
    },
    ...partial,
  };
}

describe("consolidateProposalRecords", () => {
  it("keeps pending update over applied create for the same skill", () => {
    const pending = record("triage-apiiro-cve", {
      id: "p-new",
      status: "pending",
      action: "update",
      confidence: 0.35,
    });
    const applied = record("triage-apiiro-cve", {
      id: "p-old",
      status: "applied",
      action: "create",
      confidence: 1,
      reason: "Approved skill triage-apiiro-cve",
      resolvedAt: "2026-06-21T16:10:09.428Z",
    });

    const result = consolidateProposalRecords([applied, pending]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("p-new");
    expect(result[0]?.status).toBe("pending");
  });

  it("keeps archived applied update over audit backfill create", () => {
    const archived = record("triage-apiiro-cve", {
      id: "p-applied-update",
      status: "applied",
      action: "update",
      confidence: 0.35,
      reason: "Cluster matched existing skill",
      resolvedAt: "2026-06-21T21:09:34.900Z",
      payload: {
        ...record("triage-apiiro-cve", { id: "p-applied-update", status: "applied", action: "update" }).payload,
        metrics: {
          ...record("triage-apiiro-cve", { id: "p-applied-update", status: "applied", action: "update" }).payload
            .metrics,
          generatedAt: "2026-06-21T21:09:34.900Z",
        },
      },
    });
    const backfill = record("triage-apiiro-cve", {
      id: "p-old-create",
      status: "applied",
      action: "create",
      confidence: 1,
      reason: "Approved skill triage-apiiro-cve",
      resolvedAt: "2026-06-21T16:10:09.428Z",
    });

    const result = consolidateProposalRecords([backfill, archived]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("p-applied-update");
  });

  it("preserves distinct skills", () => {
    const a = record("skill-a", { id: "p-a", status: "pending", action: "update" });
    const b = record("skill-b", { id: "p-b", status: "applied", action: "create", reason: "Approved skill skill-b" });

    const result = consolidateProposalRecords([a, b]);
    expect(result.map((r) => r.skillId).sort()).toEqual(["skill-a", "skill-b"]);
  });
});
