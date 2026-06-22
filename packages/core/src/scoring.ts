import type { Episode, Skill, SkillMetrics, SkillProposal } from "@runcanon/spec";

/** Options for computing skill metrics. */
export interface ScoringOptions {
  /** Days after last usage before a skill is considered stale. */
  stalenessDays?: number;
  /** Minimum success rate to avoid weakness penalty. */
  weaknessSuccessThreshold?: number;
  /** Minimum sample size to trust metrics. */
  minSampleSize?: number;
}

const DEFAULT_OPTIONS: Required<ScoringOptions> = {
  stalenessDays: 30,
  weaknessSuccessThreshold: 0.7,
  minSampleSize: 5,
};

/**
 * Compute skill metrics from a set of episodes that belong to the skill.
 *
 * Importance combines frequency, recency, success, and sample size.
 * Weakness penalizes low success rate, high failure rate, and small samples.
 * Staleness grows with days since last usage.
 */
export function computeSkillMetrics(episodes: Episode[], options: ScoringOptions = {}): SkillMetrics {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const now = new Date();

  const frequency = episodes.length;
  const sampleSize = frequency;

  const successes = episodes.filter((episode) => episode.outcome === "success").length;
  const failures = episodes.filter((episode) => episode.outcome === "failure").length;
  const successRate = frequency > 0 ? successes / frequency : 0;
  const failureRate = frequency > 0 ? failures / frequency : 0;

  const timestamps = episodes.map((episode) => new Date(episode.events[episode.events.length - 1]?.timestamp ?? now).getTime());
  const lastUsed = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : now.toISOString();

  const daysSinceLastUse = Math.max(0, now.getTime() - new Date(lastUsed).getTime()) / (1000 * 60 * 60 * 24);
  const stalenessScore = Math.min(daysSinceLastUse / opts.stalenessDays, 1);

  // Weakness: low success, high failure, insufficient samples.
  const successPenalty = successRate < opts.weaknessSuccessThreshold ? (opts.weaknessSuccessThreshold - successRate) / opts.weaknessSuccessThreshold : 0;
  const samplePenalty = sampleSize < opts.minSampleSize ? (opts.minSampleSize - sampleSize) / opts.minSampleSize : 0;
  const weaknessScore = Math.min((successPenalty + failureRate + samplePenalty) / 2, 1);

  // Importance: high frequency, recent use, high success, sufficient sample.
  const recencyScore = Math.max(0, 1 - stalenessScore);
  const sampleConfidence = Math.min(sampleSize / (opts.minSampleSize * 2), 1);
  const importanceScore = (successRate * 0.35 + recencyScore * 0.25 + sampleConfidence * 0.25 + Math.min(frequency / 20, 1) * 0.15);

  return {
    frequency,
    successRate,
    failureRate,
    weaknessScore,
    stalenessScore,
    importanceScore,
    lastUsed,
    generatedAt: now.toISOString(),
    sampleSize,
  };
}

/**
 * Score a set of episodes against a project's stated goals to compute alignment.
 *
 * Returns a number in [0, 1] where 1 means all episodes strongly align with project goals.
 */
export function computeGoalAlignment(episodes: Episode[], goals: string[]): number {
  if (goals.length === 0 || episodes.length === 0) return 0;

  const goalWords = new Set(goals.flatMap((goal) => goal.toLowerCase().split(/\W+/).filter(Boolean)));
  let totalScore = 0;

  for (const episode of episodes) {
    const intentWords = episode.intent.toLowerCase().split(/\W+/).filter(Boolean);
    const matches = intentWords.filter((word) => goalWords.has(word)).length;
    totalScore += intentWords.length > 0 ? matches / intentWords.length : 0;
  }

  return totalScore / episodes.length;
}

/** Lightweight synonym expansion for security/devops goal alignment. */
const GOAL_SYNONYMS: Record<string, string[]> = {
  security: ["vuln", "vulnerability", "cve", "owasp", "sast", "dast", "triage"],
  automate: ["automation", "automated", "pipeline", "workflow"],
  triage: ["prioritize", "priority", "classify", "assess"],
  jira: ["ticket", "issue", "tracking"],
  remediation: ["fix", "patch", "mitigate", "resolve"],
  skill: ["workflow", "procedure", "playbook"],
};

function expandGoalWords(goals: string[]): Set<string> {
  const words = new Set<string>();
  for (const goal of goals) {
    for (const word of goal.toLowerCase().split(/\W+/).filter((w) => w.length > 2)) {
      words.add(word);
      for (const syn of GOAL_SYNONYMS[word] ?? []) words.add(syn);
    }
  }
  return words;
}

/** Enhanced goal alignment with synonym expansion and signature matching. */
export function computeGoalAlignmentEnhanced(episodes: Episode[], goals: string[]): number {
  if (goals.length === 0 || episodes.length === 0) return 0;
  const goalWords = expandGoalWords(goals);
  let totalScore = 0;

  for (const episode of episodes) {
    const text = [episode.intent, ...episode.signature].join(" ").toLowerCase();
    const words = text.split(/\W+/).filter(Boolean);
    const matches = words.filter((word) => goalWords.has(word)).length;
    totalScore += words.length > 0 ? Math.min(1, matches / Math.max(3, words.length * 0.3)) : 0;
  }

  return totalScore / episodes.length;
}

/** Compute a composite quality score for a skill proposal. */
export function computeProposalQuality(proposal: SkillProposal, episodes: Episode[]): number {
  const metrics = computeSkillMetrics(episodes);
  return metrics.importanceScore * 0.5 + proposal.confidence * 0.3 + (1 - metrics.weaknessScore) * 0.2;
}

/** Determine whether a skill is stale enough to propose retirement. */
export function shouldRetire(skill: Skill, options: ScoringOptions = {}): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!skill.metrics.lastUsed) return false;
  const days = (Date.now() - new Date(skill.metrics.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
  return days > opts.stalenessDays * 2 || skill.metrics.stalenessScore > 0.9;
}

/** Determine whether a skill has a significant weakness that needs attention. */
export function hasWeakness(skill: Skill, options: ScoringOptions = {}): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return skill.metrics.successRate < opts.weaknessSuccessThreshold && skill.metrics.sampleSize >= opts.minSampleSize;
}
