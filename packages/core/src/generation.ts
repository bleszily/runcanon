import { computeSkillMetrics } from "./scoring.js";
import { formatSkillDisplayName, canonicalSkillKey } from "./path-labels.js";

import type { DiscoveredCluster, Skill } from "@runcanon/spec";


/** Provider interface for LLM-based skill generation. */
export interface SkillGenerationProvider {
  /** Generate a skill from a cluster summary. Returns a partial skill (name, description, workflow). */
  generateSkill(clusterSummary: ClusterSummary): Promise<Partial<Skill>>;
}

/** Summary passed to a generation provider. */
export interface ClusterSummary {
  name: string;
  description: string;
  exemplarIntents: string[];
  actionSignature: string[];
  transitionGraph: DiscoveredCluster["transitionGraph"];
  size: number;
  successRate: number;
}

/** Options for generating a skill from a cluster. */
export interface GenerationOptions {
  /** Target harnesses to include. */
  harnesses?: Skill["harnesses"];
  /** Project scope tags. */
  scope?: string[];
  /** Tags to apply. */
  tags?: string[];
  /** Optional LLM provider for semantic enrichment. */
  provider?: SkillGenerationProvider;
  /** Project goals used to validate alignment. */
  goals?: string[];
  /** When true, failures from the LLM provider propagate instead of falling back to heuristics. */
  requireLlm?: boolean;
}

/**
 * Generate a canonical Skill from a discovered cluster.
 *
 * If a provider is supplied, it enriches name, description, and workflow.
 * Otherwise, deterministic heuristics are used.
 */
export async function generateSkillFromCluster(
  cluster: DiscoveredCluster,
  options: GenerationOptions = {}
): Promise<Skill> {
  const { harnesses = ["claude"], scope = ["workspace-wide"], tags = [], provider, goals = [], requireLlm = false } = options;
  const metrics = computeSkillMetrics(cluster.exemplars);
  const signature = inferSignature(cluster);

  const summary: ClusterSummary = {
    name: cluster.name,
    description: cluster.description,
    exemplarIntents: cluster.exemplars.map((episode) => episode.intent),
    actionSignature: signature,
    transitionGraph: cluster.transitionGraph,
    size: cluster.size,
    successRate: metrics.successRate,
  };

  let enriched: Partial<Skill> = {};
  if (provider) {
    try {
      enriched = await provider.generateSkill(summary);
    } catch (error) {
      if (requireLlm) {
        throw error;
      }
      enriched = {};
    }
  }

  const workflow = enriched.workflow ?? signatureToWorkflow(signature);
  const preconditions = enriched.preconditions ?? inferPreconditions(cluster);
  const triggers = inferTriggers(cluster, enriched.triggers);

  const skill: Skill = {
    id: enriched.id ?? inferSkillId(cluster, enriched.name ?? cluster.name),
    name: formatSkillDisplayName(enriched.name ?? cluster.name),
    description: enriched.description ?? cluster.description,
    version: 1,
    status: "proposed",
    scope,
    harnesses,
    tags: dedupe([...tags, ...inferTags(cluster, goals)]),
    triggers,
    preconditions,
    workflow,
    validation: enriched.validation ?? inferValidation(cluster, workflow),
    examples: enriched.examples ?? inferExamples(cluster),
    metrics,
    metadata: {
      sourceClusterId: cluster.id,
      coherenceScore: cluster.coherenceScore,
      generatedBy: provider ? "llm" : "heuristic",
    },
  };

  return skill;
}

/** Infer a stable action signature for a cluster. */
function inferSignature(cluster: DiscoveredCluster): string[] {
  // Walk the transition graph from the most common start node to find a representative path.
  const starts = Object.entries(cluster.transitionGraph.nodes)
    .filter(([key]) => !Object.keys(cluster.transitionGraph.edges).some((edge) => edge.endsWith(`->${key}`)))
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name]) => name);

  const start = starts[0] ?? Object.keys(cluster.transitionGraph.nodes)[0];
  if (!start) return [];

  const path: string[] = [start];
  let current = start;
  const visited = new Set<string>([start]);

  for (;;) {
    const outgoing = Object.entries(cluster.transitionGraph.edges)
      .filter(([key]) => key.startsWith(`${current}->`))
      .map(([key, value]) => ({ next: key.split("->")[1], ...value }))
      .filter(({ next }) => !visited.has(next))
      .sort((a, b) => b.count - a.count);

    if (outgoing.length === 0) break;
    const winner = outgoing[0];
    path.push(winner.next);
    visited.add(winner.next);
    current = winner.next;
  }

  return path;
}

/** Convert a signature into workflow steps. */
function signatureToWorkflow(signature: string[]): Skill["workflow"] {
  return signature.map((action, index) => ({
    id: String(index + 1),
    instruction: `Execute \`${action}\``,
    action,
  }));
}

/** Infer preconditions from common first actions. */
function inferPreconditions(cluster: DiscoveredCluster): Skill["preconditions"] {
  const firstActions = cluster.exemplars
    .map((episode) => episode.signature[0])
    .filter(Boolean);
  const unique = [...new Set(firstActions)];
  return unique.length > 0 ? [`${unique.join(" / ")} is available`] : [];
}

/** Infer triggers from cluster intents and signature. */
function inferTriggers(cluster: DiscoveredCluster, override?: Skill["triggers"]): Skill["triggers"] {
  if (override && override.length > 0) return override;

  const intentPatterns = cluster.exemplars
    .map((episode) => {
      const tokens = episode.intent.split(/\s+/).slice(0, 6);
      return tokens.join(" ").replace(/\{[^}]*\}/g, "{arg}");
    })
    .filter(Boolean);

  const deduped = [...new Set(intentPatterns)].slice(0, 3);
  if (deduped.length === 0) {
    deduped.push(`Run ${cluster.name}`);
  }

  return deduped.map((pattern) => ({ pattern }));
}

/** Infer validation rules from cluster outcomes. */
function inferValidation(cluster: DiscoveredCluster, workflow: Skill["workflow"]): Skill["validation"] {
  const rules: Skill["validation"] = [];
  const lastStep = workflow[workflow.length - 1];
  if (lastStep?.expectedOutcome) {
    rules.push({ description: lastStep.expectedOutcome, severity: "error" });
  }
  if (cluster.coherenceScore < 0.5) {
    rules.push({ description: "Verify workflow steps match the user's specific request.", severity: "warning" });
  }
  return rules;
}

/** Infer examples from the best-performing exemplars. */
function inferExamples(cluster: DiscoveredCluster): Skill["examples"] {
  return cluster.exemplars
    .filter((episode) => episode.outcome === "success")
    .slice(0, 2)
    .map((episode) => ({
      prompt: episode.intent,
      plan: `Follow the ${cluster.name} workflow`,
    }));
}

/** Infer tags from intent words, signature, and project goals. */
function inferTags(cluster: DiscoveredCluster, goals: string[]): string[] {
  const words = cluster.exemplars.flatMap((episode) => episode.intent.toLowerCase().split(/\W+/));
  const stopWords = new Set(["the", "a", "an", "for", "to", "in", "on", "of", "and", "or", "with", "from"]);
  const candidates = words.filter((word) => word.length > 2 && !stopWords.has(word));
  const counts = new Map<string, number>();
  for (const word of candidates) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word]) => word);

  const goalTags = goals
    .flatMap((goal) => goal.toLowerCase().split(/\W+/))
    .filter((word) => word.length > 3 && !stopWords.has(word));

  return dedupe([...top, ...goalTags]);
}

/** Simple deterministic LLM provider that does not call an external model. */
export class FallbackGenerationProvider implements SkillGenerationProvider {
  generateSkill(summary: ClusterSummary): Promise<Partial<Skill>> {
    return Promise.resolve({
      name: toTitleCase(summary.name.replace(/-/g, " ")),
      description: summary.description,
      workflow: summary.actionSignature.map((action, index) => ({
        id: String(index + 1),
        instruction: `Execute \`${action}\` and confirm the result.`,
        action,
      })),
      preconditions: [`${summary.actionSignature[0] ?? "the first tool"} is available`],
    });
  }
}

/** Prefer stable catalog names ("cloud-security") over path-derived cluster slugs. */
function inferSkillId(cluster: DiscoveredCluster, fallbackName: string): string {
  for (const episode of cluster.exemplars) {
    const match = episode.intent.match(/^Existing skill:\s*(.+)$/i);
    if (match?.[1]) {
      return canonicalSkillKey(match[1]);
    }
  }
  return kebabCase(fallbackName);
}

/** Convert a string to kebab-case. */
function kebabCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Convert a string to Title Case. */
function toTitleCase(input: string): string {
  return input
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Deduplicate an array preserving order. */
function dedupe<T>(array: T[]): T[] {
  return [...new Set(array)];
}
