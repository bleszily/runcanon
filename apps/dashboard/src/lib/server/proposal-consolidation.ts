import type { SkillProposal } from "@runcanon/spec";

export type DashboardProposalRecord = SkillProposal & {
  status: "pending" | "approved" | "rejected" | "applied";
  activeSkill?: import("@runcanon/spec").Skill;
  previous?: import("@runcanon/spec").Skill;
  resolvedAt?: string;
};

const STATUS_RANK: Record<DashboardProposalRecord["status"], number> = {
  pending: 4,
  approved: 3,
  rejected: 2,
  applied: 1,
};

function isAuditBackfillRecord(record: DashboardProposalRecord): boolean {
  return (
    record.status === "applied" &&
    record.confidence === 1 &&
    (record.reason === "Approved via dashboard" || record.reason.startsWith("Approved skill "))
  );
}

/** Higher score wins when multiple proposals target the same skill. */
export function proposalRecordScore(record: DashboardProposalRecord): number {
  const statusScore = STATUS_RANK[record.status] * 1_000;
  const confidenceScore = record.confidence * 100;
  const recency = new Date(record.payload.metrics.generatedAt).getTime() / 1e10;
  const backfillPenalty = isAuditBackfillRecord(record) ? -500 : 0;
  return statusScore + confidenceScore + recency + backfillPenalty;
}

/** Keep the single best proposal per skill (pending beats stale applied history). */
export function consolidateProposalRecords(records: DashboardProposalRecord[]): DashboardProposalRecord[] {
  const bestBySkill = new Map<string, DashboardProposalRecord>();

  for (const record of records) {
    const existing = bestBySkill.get(record.skillId);
    if (!existing || proposalRecordScore(record) > proposalRecordScore(existing)) {
      bestBySkill.set(record.skillId, record);
    }
  }

  return [...bestBySkill.values()].sort(
    (a, b) =>
      new Date(b.payload.metrics.generatedAt).getTime() - new Date(a.payload.metrics.generatedAt).getTime()
  );
}
