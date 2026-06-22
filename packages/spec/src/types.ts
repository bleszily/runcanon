/**
 * Core type definitions for the RunCanon portable skill spec.
 *
 * A Skill is the canonical representation of a reusable AI workflow.
 * Harness transformers render this spec into harness-native files.
 */

/** Supported AI harnesses (canonical ids; aliases like `openai` resolve via registry). */
export const KNOWN_HARNESSES = [
  "claude",
  "cursor",
  "copilot",
  "continue",
  "windsurf",
  "codex",
  "openai",
  "aider",
  "antigravity",
  "browser",
  "coworker",
  "browseros",
  "gemini",
  "cline",
  "roo",
  "amazon-q",
  "jetbrains",
  "zed",
] as const;

export type KnownHarness = (typeof KNOWN_HARNESSES)[number];

/** Harness identifier - known values plus extensible custom ids. */
export type Harness = KnownHarness | (string & {});

/** Lifecycle status of a skill. */
export type SkillStatus = "active" | "draft" | "proposed" | "retired" | "deprecated";

/** Outcome of executing a skill episode. */
export type Outcome = "success" | "partial" | "failure" | "aborted" | "unknown";

/** Autonomy level for applying skill changes. */
export type AutonomyLevel = "suggest" | "ask" | "doAndShow" | "doAndDigest";

/** A trigger that can activate a skill. */
export interface SkillTrigger {
  /** Human-readable intent pattern, e.g. "triage CVEs for {repo}". */
  pattern: string;
  /** Optional glob patterns for path-scoped activation. */
  globs?: string[];
  /** Whether this trigger should always be included in context. */
  alwaysApply?: boolean;
}

/** A single step in a skill workflow. */
export interface WorkflowStep {
  /** Step number or identifier. */
  id?: string;
  /** Human-readable instruction. */
  instruction: string;
  /** Optional tool/prompt/action to invoke. */
  action?: string;
  /** Conditions that must hold before this step. */
  preconditions?: string[];
  /** Expected observable result. */
  expectedOutcome?: string;
  /** Whether this step requires explicit user approval. */
  requiresApproval?: boolean;
}

/** Validation rules that must hold after skill execution. */
export interface ValidationRule {
  /** Description of what must be true. */
  description: string;
  /** Severity if violated. */
  severity: "error" | "warning";
  /** Optional automated check expression. */
  check?: string;
}

/** Example invocation of the skill. */
export interface SkillExample {
  /** Natural-language user request. */
  prompt: string;
  /** Expected high-level response plan. */
  plan: string;
  /** Optional output snippet. */
  output?: string;
}

/** Skill quality and usage metrics. */
export interface SkillMetrics {
  /** How many times this skill was observed in trajectories. */
  frequency: number;
  /** Fraction of executions ending in success (0–1). */
  successRate: number;
  /** Human/expert approval rate (0–1). */
  approvalRate?: number;
  /** Fraction of executions ending in failure (0–1). */
  failureRate?: number;
  /** Estimated weakness score, higher is weaker (0–1). */
  weaknessScore: number;
  /** Staleness score, higher is staler (0–1). */
  stalenessScore: number;
  /** Composite importance score (0–1). */
  importanceScore: number;
  /** Date of last observed usage (ISO 8601). */
  lastUsed?: string;
  /** Date this skill version was generated (ISO 8601). */
  generatedAt: string;
  /** Number of trajectories supporting this skill. */
  sampleSize: number;
}

/** Project context captured from a trajectory. */
export interface ProjectContext {
  /** Repository or project name. */
  project: string;
  /** Workspace or organization identifier. */
  workspace?: string;
  /** Branch or version. */
  branch?: string;
  /** Files referenced during the episode. */
  files?: string[];
  /** Extracted project goals/keywords. */
  goals?: string[];
}

/** A trajectory event emitted by an agent or tool. */
export interface TrajectoryEvent {
  /** Unique event identifier. */
  id: string;
  /** Session identifier. */
  sessionId: string;
  /** Monotonic event index within the session. */
  sequence: number;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Who emitted the event. */
  actor: "user" | "agent" | "tool";
  /** Event type. */
  type: "message" | "tool_call" | "tool_result" | "prompt_invoke" | "prompt_result" | "outcome" | "boundary";
  /** Normalized action name (tool or prompt name). */
  action?: string;
  /** Human-readable intent inferred from the surrounding context. */
  intent?: string;
  /** Sanitized argument summary. */
  args?: Record<string, unknown>;
  /** Outcome tag. */
  outcome?: Outcome;
  /** Free-form outcome signal, e.g. approval rating. */
  outcomeSignal?: number | string;
  /** Project context at event time. */
  projectContext?: ProjectContext;
  /** Raw metadata for extensibility. */
  metadata?: Record<string, unknown>;
}

/** A contiguous skill episode segmented from a trajectory. */
export interface Episode {
  /** Unique episode identifier. */
  id: string;
  /** Session identifier. */
  sessionId: string;
  /** Inferred primary intent. */
  intent: string;
  /** Ordered sequence of events. */
  events: TrajectoryEvent[];
  /** Tool/prompt action signature. */
  signature: string[];
  /** Project context. */
  projectContext?: ProjectContext;
  /** Episode-level outcome. */
  outcome: Outcome;
  /** Confidence of segmentation (0–1). */
  segmentationConfidence: number;
}

/** A discovered cluster of episodes representing a candidate skill. */
export interface DiscoveredCluster {
  /** Cluster identifier. */
  id: string;
  /** Inferred skill name. */
  name: string;
  /** Inferred skill description. */
  description: string;
  /** Representative episodes. */
  exemplars: Episode[];
  /** Tool/prompt transition graph. */
  transitionGraph: TransitionGraph;
  /** Cluster quality score (0–1). */
  coherenceScore: number;
  /** Size of the cluster. */
  size: number;
}

/** A directed transition graph between actions. */
export interface TransitionGraph {
  /** Nodes indexed by action name. */
  nodes: Record<string, { count: number; successCount: number }>;
  /** Edges indexed as "from->to". */
  edges: Record<string, { count: number; successCount: number }>;
}

/** Proposed lifecycle action for a skill. */
export interface SkillProposal {
  /** Proposal identifier. */
  id: string;
  /** Action to take. */
  action: "create" | "update" | "merge" | "retire" | "reactivate";
  /** Skill being affected. */
  skillId: string;
  /** Reasoning for the proposal. */
  reason: string;
  /** Confidence score (0–1). */
  confidence: number;
  /** Diff or new skill definition. */
  payload: Skill;
  /** Existing skill before change (for updates/merges). */
  previous?: Skill;
}

/** Canonical skill definition. */
export interface Skill {
  /** Stable unique identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description of when to use the skill. */
  description: string;
  /** Version number. */
  version: number;
  /** Lifecycle status. */
  status: SkillStatus;
  /** Which projects/workspaces this skill applies to. */
  scope: string[];
  /** Which harnesses this skill should be exported to. */
  harnesses: Harness[];
  /** Tags for search and filtering. */
  tags: string[];
  /** Triggers that activate this skill. */
  triggers: SkillTrigger[];
  /** Invocation settings. */
  invocation?: {
    /** Whether the skill can only be invoked by the user, not auto-invoked. */
    disableModelInvocation?: boolean;
    /** Whether the skill is visible in command menus. */
    userInvocable?: boolean;
    /** Tools allowed while this skill is active. */
    allowedTools?: string[];
    /** Tools disallowed while this skill is active. */
    disallowedTools?: string[];
    /** Argument hint shown in command palette. */
    argumentHint?: string;
    /** Model override. */
    model?: string;
    /** Effort level override. */
    effort?: "low" | "medium" | "high" | "max";
  };
  /** Preconditions that must hold before executing. */
  preconditions: string[];
  /** Ordered workflow steps. */
  workflow: WorkflowStep[];
  /** Validation rules to verify after execution. */
  validation: ValidationRule[];
  /** Example invocations. */
  examples: SkillExample[];
  /** Metrics. */
  metrics: SkillMetrics;
  /** Free-form metadata. */
  metadata?: Record<string, unknown>;
}

/** Skill registry index. */
export interface SkillRegistryIndex {
  /** Schema version. */
  schemaVersion: string;
  /** Registry generation timestamp. */
  generatedAt: string;
  /** Active skills. */
  active: string[];
  /** Draft/proposed skills. */
  draft: string[];
  /** Retired skill IDs. */
  retired: string[];
  /** Skill summaries. */
  skills: Array<{
    id: string;
    name: string;
    status: SkillStatus;
    harnesses: Harness[];
    tags: string[];
    metrics: SkillMetrics;
  }>;
  /** Goal alignment score for the corpus, if computed. */
  goalAlignment?: number;
}

/** Output of rendering a skill for a harness. */
export interface HarnessRenderResult {
  /** Relative file path. */
  path: string;
  /** File content. */
  content: string;
  /** Whether this file should be overwritten on export. */
  overwrite: boolean;
}
