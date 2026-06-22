import { randomUUID } from "node:crypto";


import { clusterEpisodes, type ClusteringOptions } from "./clustering.js";
import { computeDistanceMatrix, type DistanceOptions } from "./distance.js";
import { FallbackGenerationProvider, generateSkillFromCluster, type GenerationOptions } from "./generation.js";
import { computeGoalAlignment, hasWeakness, shouldRetire } from "./scoring.js";
import { segmentTrajectory, type SegmentationOptions } from "./segmentation.js";
import { filterClusteringEvents } from "./sources.js";
import {
  dedupeProposalsBySkillId,
  filterRedundantProposals,
  canonicalKeysForSkills,
} from "./proposals.js";
import { canonicalSkillKey } from "./path-labels.js";

import type { DiscoveredCluster, Episode, Skill, SkillProposal, TrajectoryEvent } from "@runcanon/spec";

/** Full mining pipeline options. */
export interface MiningOptions {
  segmentation?: SegmentationOptions;
  distance?: DistanceOptions;
  clustering?: ClusteringOptions;
  generation?: GenerationOptions;
  projectGoals?: string[];
  /** When true, skill generation must use the configured LLM provider (no heuristic fallback). */
  requireLlm?: boolean;
  /** Pending proposal skill ids/canonical keys — used to suppress duplicate creates on re-mine. */
  pendingSkillIds?: Set<string>;
  pendingCanonicalKeys?: Set<string>;
}

/** Result of running the full mining pipeline. */
export interface MiningResult {
  /** Segmented episodes. */
  episodes: Episode[];
  /** Discovered clusters. */
  clusters: DiscoveredCluster[];
  /** Generated skill proposals. */
  proposals: SkillProposal[];
  /** Goal alignment score for the corpus. */
  goalAlignment: number;
}

/**
 * Run the full RunCanon mining pipeline on a set of trajectory events.
 */
export async function mineSkills(
  events: TrajectoryEvent[],
  existingSkills: Skill[] = [],
  options: MiningOptions = {}
): Promise<MiningResult> {
  const clusteringEvents = filterClusteringEvents(events);

  if (clusteringEvents.length === 0) {
    return { episodes: [], clusters: [], proposals: [], goalAlignment: 0 };
  }

  const episodes = segmentTrajectory(clusteringEvents, options.segmentation);
  const distanceMatrix = computeDistanceMatrix(episodes, options.distance);
  const clusters = clusterEpisodes(episodes, distanceMatrix, options.clustering);

  const generationOptions: GenerationOptions = {
    ...options.generation,
    provider: options.generation?.provider ?? new FallbackGenerationProvider(),
    goals: options.projectGoals,
    requireLlm: options.requireLlm,
  };

  const proposals: SkillProposal[] = [];
  for (const cluster of clusters) {
    const skill = await generateSkillFromCluster(cluster, generationOptions);
    const existing = findMatchingExistingSkill(skill, existingSkills);
    const action: SkillProposal["action"] = existing ? "update" : "create";

    proposals.push({
      id: `p-${randomUUID().slice(0, 8)}`,
      action,
      skillId: existing?.id ?? skill.id,
      reason: buildProposalReason(cluster, existing),
      confidence: cluster.coherenceScore,
      payload: skill,
      previous: existing,
    });
  }

  const matchedIds = new Set(proposals.filter((p) => p.action === "update").map((p) => p.skillId));
  for (const existing of existingSkills.filter((skill) => skill.status === "active")) {
    if (matchedIds.has(existing.id)) continue;

    if (shouldRetire(existing)) {
      proposals.push({
        id: `p-${randomUUID().slice(0, 8)}`,
        action: "retire",
        skillId: existing.id,
        reason: `No recent trajectories observed; last used ${existing.metrics.lastUsed ?? "never"}.`,
        confidence: 0.7,
        payload: { ...existing, status: "retired" },
        previous: existing,
      });
    } else if (hasWeakness(existing)) {
      proposals.push({
        id: `p-${randomUUID().slice(0, 8)}`,
        action: "update",
        skillId: existing.id,
        reason: `Success rate ${(existing.metrics.successRate * 100).toFixed(1)}% is below threshold; workflow needs attention.`,
        confidence: 0.6,
        payload: { ...existing, version: existing.version + 1 },
        previous: existing,
      });
    }
  }

  const goalAlignment = computeGoalAlignment(episodes, options.projectGoals ?? []);

  // Detect merge candidates: active skills with highly overlapping triggers.
  const mergeProposals = detectMergeProposals(existingSkills.filter((s) => s.status === "active"));
  proposals.push(...mergeProposals);

  const activeIds = new Set(existingSkills.filter((s) => s.status === "active").map((s) => s.id));
  const activeKeys = canonicalKeysForSkills(existingSkills.filter((s) => s.status === "active"));

  let finalProposals = dedupeProposalsBySkillId(proposals);
  finalProposals = filterRedundantProposals(finalProposals, {
    activeSkillIds: activeIds,
    pendingSkillIds: options.pendingSkillIds,
    activeCanonicalKeys: activeKeys,
    pendingCanonicalKeys: options.pendingCanonicalKeys,
  });

  return { episodes, clusters, proposals: finalProposals, goalAlignment };
}

/** Propose merging skills with overlapping trigger patterns. */
function detectMergeProposals(activeSkills: Skill[]): SkillProposal[] {
  const merges: SkillProposal[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < activeSkills.length; i++) {
    for (let j = i + 1; j < activeSkills.length; j++) {
      const a = activeSkills[i];
      const b = activeSkills[j];
      if (!a || !b) continue;

      const overlap = a.triggers.filter((ta) =>
        b.triggers.some((tb) => normalizeIntent(ta.pattern) === normalizeIntent(tb.pattern))
      );
      if (overlap.length === 0) continue;

      const pairKey = [a.id, b.id].sort().join("+");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const merged: Skill = {
        ...a,
        id: `${a.id}-merged`,
        name: `${a.name} + ${b.name}`,
        description: `Merged workflow combining ${a.name} and ${b.name}.`,
        version: Math.max(a.version, b.version) + 1,
        triggers: [...a.triggers, ...b.triggers.filter((t) => !a.triggers.some((at) => at.pattern === t.pattern))],
        workflow: [...a.workflow, ...b.workflow],
        tags: [...new Set([...a.tags, ...b.tags])],
        harnesses: [...new Set([...a.harnesses, ...b.harnesses])],
      };

      merges.push({
        id: `p-${randomUUID().slice(0, 8)}`,
        action: "merge",
        skillId: merged.id,
        reason: `Skills \`${a.id}\` and \`${b.id}\` share ${overlap.length} trigger(s); consider merging.`,
        confidence: 0.65,
        payload: merged,
        previous: a,
      });
    }
  }

  return merges;
}

/** Find an existing skill that matches a generated skill by id or trigger similarity. */
function findMatchingExistingSkill(skill: Skill, existingSkills: Skill[]): Skill | undefined {
  const skillKey = canonicalSkillKey(skill.name || skill.id);
  return existingSkills.find((existing) => {
    if (existing.id === skill.id) return true;
    if (canonicalSkillKey(existing.name || existing.id) === skillKey) return true;
    const sharedTriggers = existing.triggers.filter((existingTrigger) =>
      skill.triggers.some(
        (newTrigger) => normalizeIntent(newTrigger.pattern) === normalizeIntent(existingTrigger.pattern)
      )
    );
    return sharedTriggers.length > 0;
  });
}

/** Normalize an intent string for comparison. */
function normalizeIntent(intent: string): string {
  return intent
    .toLowerCase()
    .replace(/\{[^}]*\}/g, "{}")
    .replace(/[^a-z0-9{}]/g, "")
    .trim();
}

/** Build a human-readable proposal reason. */
function buildProposalReason(cluster: DiscoveredCluster, existing?: Skill): string {
  if (existing) {
    return `Cluster matched existing skill \`${existing.id}\` (${String(cluster.size)} episodes, coherence ${(cluster.coherenceScore * 100).toFixed(0)}%).`;
  }
  return `Discovered recurring workflow with ${String(cluster.size)} episodes and coherence ${(cluster.coherenceScore * 100).toFixed(0)}%.`;
}

