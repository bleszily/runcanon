import { canonicalSkillKey, isNoiseSkillIdentity } from "./path-labels.js";

import type { Skill, SkillProposal } from "@runcanon/spec";

export interface ProposalDedupeContext {
  activeSkillIds?: Set<string>;
  pendingSkillIds?: Set<string>;
  activeCanonicalKeys?: Set<string>;
  pendingCanonicalKeys?: Set<string>;
}

/** Keep the highest-confidence proposal per skillId and per canonical name. */
export function dedupeProposalsBySkillId(proposals: SkillProposal[]): SkillProposal[] {
  const ranked = [...proposals].sort((a, b) => b.confidence - a.confidence);
  const bySkillId = new Map<string, SkillProposal>();
  const byCanonical = new Map<string, SkillProposal>();
  for (const proposal of ranked) {
    const canonical = proposalCanonicalKey(proposal);
    if (bySkillId.has(proposal.skillId) || byCanonical.has(canonical)) continue;
    bySkillId.set(proposal.skillId, proposal);
    byCanonical.set(canonical, proposal);
  }
  return [...bySkillId.values()];
}

export function proposalCanonicalKey(proposal: SkillProposal): string {
  return canonicalSkillKey(proposal.payload.name || proposal.skillId);
}

/** Drop creates/updates that duplicate active or pending skills on re-mine. */
export function filterRedundantProposals(
  proposals: SkillProposal[],
  context: ProposalDedupeContext = {}
): SkillProposal[] {
  const activeIds = context.activeSkillIds ?? new Set<string>();
  const pendingIds = context.pendingSkillIds ?? new Set<string>();
  const activeKeys = context.activeCanonicalKeys ?? new Set<string>();
  const pendingKeys = context.pendingCanonicalKeys ?? new Set<string>();

  return proposals.filter((proposal) => {
    const canonical = proposalCanonicalKey(proposal);

    if (isNoiseSkillIdentity(proposal.skillId) || isNoiseSkillIdentity(proposal.payload.name)) {
      return false;
    }

    if (proposal.action === "create") {
      if (activeIds.has(proposal.skillId) || activeKeys.has(canonical)) return false;
      if (pendingIds.has(proposal.skillId) || pendingKeys.has(canonical)) return false;
    }

    if (proposal.action === "update") {
      if (!activeIds.has(proposal.skillId) && !activeKeys.has(canonical)) {
        // Updates without an active target become noisy duplicates after export/re-import cycles.
        return false;
      }
    }

    return true;
  });
}

export function canonicalKeysForSkills(skills: Skill[]): Set<string> {
  return new Set(skills.map((skill) => canonicalSkillKey(skill.name || skill.id)));
}
