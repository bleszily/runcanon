import type { Episode, SkillProposal } from "@runcanon/spec";

import type { LlmProvider } from "./provider.js";
import { extractJson } from "./provider.js";
import { computeGoalAlignmentEnhanced, computeProposalQuality } from "../scoring.js";

export interface ProposalRankingInput {
  proposal: SkillProposal;
  episodes: Episode[];
  goals: string[];
  existingSkillNames?: string[];
}

export interface ProposalRankingResult {
  qualityScore: number;
  goalAlignment: number;
  llmAdjustedScore?: number;
  llmRationale?: string;
  usedLlm: boolean;
}

/** Heuristic-only ranking (always available). */
export function rankProposalHeuristic(input: ProposalRankingInput): ProposalRankingResult {
  const goalAlignment = computeGoalAlignmentEnhanced(input.episodes, input.goals);
  const qualityScore = computeProposalQuality(input.proposal, input.episodes);
  const alignmentBoost = goalAlignment * 0.15;
  return {
    qualityScore: Math.min(1, qualityScore + alignmentBoost),
    goalAlignment,
    usedLlm: false,
  };
}

/**
 * Rank a proposal for recommendation. Uses LLM when available to refine score and rationale;
 * falls back to heuristics on any error or when no provider is configured.
 */
export async function rankProposal(
  input: ProposalRankingInput,
  llm?: LlmProvider
): Promise<ProposalRankingResult> {
  const baseline = rankProposalHeuristic(input);
  if (!llm) return baseline;

  try {
    const heuristic = baseline;
    const prompt = `You are RunCanon, an expert at evaluating AI agent skill proposals mined from trajectories.

Project goals:
${input.goals.length > 0 ? input.goals.map((g) => `- ${g}`).join("\n") : "- Improve reusable, secure agent workflows"}

Proposal:
- name: ${input.proposal.payload.name}
- type: ${input.proposal.action}
- confidence: ${input.proposal.confidence}
- reason: ${input.proposal.reason}
- sample size: ${input.episodes.length}
- heuristic quality: ${heuristic.qualityScore.toFixed(3)}
- heuristic goal alignment: ${heuristic.goalAlignment.toFixed(3)}

Existing skills: ${(input.existingSkillNames ?? []).slice(0, 12).join(", ") || "none"}

Respond with ONLY JSON:
{
  "adjustedScore": number,
  "goalAlignment": number,
  "rationale": string
}

adjustedScore must be between 0 and 1 (higher = stronger recommendation).`;

    const result = await llm.complete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      maxTokens: 512,
    });

    const parsed = extractJson<{ adjustedScore: number; goalAlignment: number; rationale: string }>(result.content);
    const adjusted = Math.max(0, Math.min(1, parsed.adjustedScore));

    return {
      qualityScore: heuristic.qualityScore,
      goalAlignment: Math.max(0, Math.min(1, parsed.goalAlignment ?? heuristic.goalAlignment)),
      llmAdjustedScore: adjusted,
      llmRationale: parsed.rationale,
      usedLlm: true,
    };
  } catch {
    return baseline;
  }
}
