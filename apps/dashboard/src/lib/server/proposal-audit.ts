import type { AuditEntry } from "./audit.js";

/** Match audit rows to a specific proposal id (not skill id — avoids stale approve/reject bleed). */
export function auditEntriesForProposal(audit: AuditEntry[], proposalId: string): AuditEntry[] {
  return audit.filter(
    (entry) => entry.resourceId === proposalId || (entry.note != null && entry.note.includes(proposalId))
  );
}
