import { describe, expect, it } from "vitest";

import { auditEntriesForProposal } from "./proposal-audit.js";
import type { AuditEntry } from "./audit.js";

function auditEntry(partial: Partial<AuditEntry> & Pick<AuditEntry, "action" | "resourceId">): AuditEntry {
  return {
    id: "audit-1",
    timestamp: "2026-06-21T16:10:09.428Z",
    actor: "admin@runcanon.ai",
    resourceType: "proposal",
    ...partial,
  };
}

describe("auditEntriesForProposal", () => {
  it("matches approve/reject audit by proposal id only", () => {
    const audit: AuditEntry[] = [
      auditEntry({
        action: "proposal.approve",
        resourceId: "p-ae589c8a",
        note: "Approved skill triage-apiiro-cve",
      }),
    ];

    expect(auditEntriesForProposal(audit, "p-ae589c8a")).toHaveLength(1);
    expect(auditEntriesForProposal(audit, "p-f4c05e07")).toHaveLength(0);
  });

  it("does not match a different proposal that targets the same skill id", () => {
    const audit: AuditEntry[] = [
      auditEntry({
        action: "proposal.approve",
        resourceId: "p-old",
        note: "Approved skill triage-apiiro-cve",
      }),
      auditEntry({
        action: "proposal.reject",
        resourceId: "p-new",
        timestamp: "2026-06-21T21:01:06.683Z",
      }),
    ];

    expect(auditEntriesForProposal(audit, "p-new")).toEqual([audit[1]]);
  });
});
