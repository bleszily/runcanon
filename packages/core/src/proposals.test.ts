import { describe, expect, it } from "vitest";

import {
  dedupeProposalsBySkillId,
  filterRedundantProposals,
  proposalCanonicalKey,
} from "./proposals.js";
import type { SkillProposal } from "@runcanon/spec";

function proposal(skillId: string, action: SkillProposal["action"] = "create"): SkillProposal {
  return {
    id: `p-${skillId}`,
    action,
    skillId,
    reason: "test",
    confidence: 0.8,
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
        sampleSize: 2,
        generatedAt: new Date().toISOString(),
      },
    },
  };
}

describe("dedupeProposalsBySkillId", () => {
  it("keeps highest-confidence proposal per skillId", () => {
    const low = proposal("cloud-security");
    low.confidence = 0.5;
    const high = proposal("cloud-security");
    high.confidence = 0.9;

    const result = dedupeProposalsBySkillId([low, high]);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0.9);
  });
});

describe("filterRedundantProposals", () => {
  it("skips create when skill is already pending", () => {
    const pending = proposal("cloud-security");
    const filtered = filterRedundantProposals([pending], {
      pendingSkillIds: new Set(["cloud-security"]),
      pendingCanonicalKeys: new Set([proposalCanonicalKey(pending)]),
    });
    expect(filtered).toHaveLength(0);
  });

  it("skips update when skill is not active", () => {
    const update = proposal("cloud-security", "update");
    const filtered = filterRedundantProposals([update], {
      activeSkillIds: new Set(),
      activeCanonicalKeys: new Set(),
    });
    expect(filtered).toHaveLength(0);
  });
});
