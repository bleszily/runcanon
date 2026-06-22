import { z } from "zod";

/** Supported AI harnesses. */
export const harnessSchema = z.enum([
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
]);

/** Skill lifecycle status. */
export const skillStatusSchema = z.enum(["active", "draft", "proposed", "retired", "deprecated"]);

/** Execution outcome. */
export const outcomeSchema = z.enum(["success", "partial", "failure", "aborted", "unknown"]);

/** Autonomy level. */
export const autonomyLevelSchema = z.enum(["suggest", "ask", "doAndShow", "doAndDigest"]);

/** Skill trigger schema. */
export const skillTriggerSchema = z.object({
  pattern: z.string().min(1),
  globs: z.array(z.string()).optional(),
  alwaysApply: z.boolean().optional(),
});

/** Workflow step schema. */
export const workflowStepSchema = z.object({
  id: z.string().optional(),
  instruction: z.string().min(1),
  action: z.string().optional(),
  preconditions: z.array(z.string()).optional(),
  expectedOutcome: z.string().optional(),
  requiresApproval: z.boolean().optional(),
});

/** Validation rule schema. */
export const validationRuleSchema = z.object({
  description: z.string().min(1),
  severity: z.enum(["error", "warning"]),
  check: z.string().optional(),
});

/** Skill example schema. */
export const skillExampleSchema = z.object({
  prompt: z.string().min(1),
  plan: z.string().min(1),
  output: z.string().optional(),
});

/** Skill metrics schema. */
export const skillMetricsSchema = z.object({
  frequency: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  approvalRate: z.number().min(0).max(1).optional(),
  failureRate: z.number().min(0).max(1).optional(),
  weaknessScore: z.number().min(0).max(1),
  stalenessScore: z.number().min(0).max(1),
  importanceScore: z.number().min(0).max(1),
  lastUsed: z.string().datetime().optional(),
  generatedAt: z.string().datetime(),
  sampleSize: z.number().int().nonnegative(),
});

/** Invocation settings schema. */
export const invocationSchema = z.object({
  disableModelInvocation: z.boolean().optional(),
  userInvocable: z.boolean().optional(),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  argumentHint: z.string().optional(),
  model: z.string().optional(),
  effort: z.enum(["low", "medium", "high", "max"]).optional(),
});

/** Canonical skill schema. */
export const skillSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  version: z.number().int().positive(),
  status: skillStatusSchema,
  scope: z.array(z.string().min(1)).min(1),
  harnesses: z.array(harnessSchema).min(1),
  tags: z.array(z.string().min(1)),
  triggers: z.array(skillTriggerSchema).min(1),
  invocation: invocationSchema.optional(),
  preconditions: z.array(z.string().min(1)),
  workflow: z.array(workflowStepSchema).min(1),
  validation: z.array(validationRuleSchema),
  examples: z.array(skillExampleSchema),
  metrics: skillMetricsSchema,
  metadata: z.record(z.unknown()).optional(),
});

/** Project context schema. */
export const projectContextSchema = z.object({
  project: z.string().min(1),
  workspace: z.string().optional(),
  branch: z.string().optional(),
  files: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
});

/** Trajectory event schema. */
export const trajectoryEventSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  actor: z.enum(["user", "agent", "tool"]),
  type: z.enum(["message", "tool_call", "tool_result", "prompt_invoke", "prompt_result", "outcome", "boundary"]),
  action: z.string().optional(),
  intent: z.string().optional(),
  args: z.record(z.unknown()).optional(),
  outcome: outcomeSchema.optional(),
  outcomeSignal: z.union([z.number(), z.string()]).optional(),
  projectContext: projectContextSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** Episode schema. */
export const episodeSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  intent: z.string().min(1),
  events: z.array(trajectoryEventSchema).min(1),
  signature: z.array(z.string()),
  projectContext: projectContextSchema.optional(),
  outcome: outcomeSchema,
  segmentationConfidence: z.number().min(0).max(1),
});

/** Transition graph schema. */
export const transitionGraphSchema = z.object({
  nodes: z.record(
    z.object({
      count: z.number().int().nonnegative(),
      successCount: z.number().int().nonnegative(),
    })
  ),
  edges: z.record(
    z.object({
      count: z.number().int().nonnegative(),
      successCount: z.number().int().nonnegative(),
    })
  ),
});

/** Discovered cluster schema. */
export const discoveredClusterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  exemplars: z.array(episodeSchema).min(1),
  transitionGraph: transitionGraphSchema,
  coherenceScore: z.number().min(0).max(1),
  size: z.number().int().nonnegative(),
});

/** Skill proposal schema. */
export const skillProposalSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["create", "update", "merge", "retire", "reactivate"]),
  skillId: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  payload: skillSchema,
  previous: skillSchema.optional(),
});

/** Skill registry index schema. */
export const skillRegistryIndexSchema = z.object({
  schemaVersion: z.string().min(1),
  generatedAt: z.string().datetime(),
  active: z.array(z.string().min(1)),
  draft: z.array(z.string().min(1)),
  retired: z.array(z.string().min(1)),
  skills: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      status: skillStatusSchema,
      harnesses: z.array(harnessSchema),
      tags: z.array(z.string().min(1)),
      metrics: skillMetricsSchema,
    })
  ),
  goalAlignment: z.number().min(0).max(1).optional(),
});

/** Type alias helpers for schema-driven code. */
export type SkillFromSchema = z.infer<typeof skillSchema>;
