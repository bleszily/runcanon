import { serializeSkill } from "@runcanon/spec";
import { formatSkillDisplayName, labelSourcePath } from "@runcanon/core";
import type { Skill as SpecSkill, SkillProposal as SpecProposal } from "@runcanon/spec";
import type { Episode } from "@runcanon/core";
import { formatHarnessLabel, harnessToIconCategory } from "$lib/harness-labels.js";
import type { AuditEntry } from "./audit.js";
import type { DashboardProposalRecord } from "./proposals.js";
import type { Proposal, ProposalStatus, Skill, Trajectory } from "$lib/types";

export function mapSpecStatus(status: SpecSkill["status"]): Skill["status"] {
  if (status === "active") return "active";
  if (status === "retired") return "retired";
  if (status === "deprecated") return "deprecated";
  return "proposed";
}

export function toDashboardSkill(skill: SpecSkill): Skill {
  return {
    id: skill.id,
    name: formatSkillDisplayName(skill.name),
    description: skill.description,
    status: mapSpecStatus(skill.status),
    markdown: serializeSkill(skill),
    tags: skill.tags,
    harnesses: skill.harnesses.map((harness) => ({
      id: harness,
      label: formatHarnessLabel(harness),
      type: harnessToIconCategory(harness),
      count: skill.metrics.frequency,
    })),
    usage: {
      calls7d: skill.metrics.frequency,
      calls30d: skill.metrics.frequency,
      successRate: skill.metrics.successRate,
    },
    createdAt: skill.metrics.generatedAt,
    updatedAt: skill.metrics.lastUsed ?? skill.metrics.generatedAt,
  };
}

function mapAuditActor(actor: string, fallbackEmail?: string | null): string {
  if (actor === "anonymous" && fallbackEmail) return fallbackEmail;
  if (actor === "anonymous") return "System";
  return actor;
}

function mapAuditEntry(entry: AuditEntry, fallbackEmail?: string | null) {
  return {
    id: entry.id,
    action: entry.action,
    actor: mapAuditActor(entry.actor, fallbackEmail),
    timestamp: entry.timestamp,
    note: entry.note,
  };
}

export function toDashboardProposal(
  proposal: SpecProposal | DashboardProposalRecord,
  status: ProposalStatus = "pending",
  audit: AuditEntry[] = [],
  options: { actorFallbackEmail?: string | null } = {}
): Proposal {
  const resolvedStatus = "status" in proposal ? proposal.status : status;
  const resolvedAt =
    "resolvedAt" in proposal && proposal.resolvedAt
      ? proposal.resolvedAt
      : (proposal.metadata?.appliedAt as string | undefined) ??
        (proposal.metadata?.rejectedAt as string | undefined);

  const auditLog = audit
    .filter(
      (entry) =>
        entry.resourceId === proposal.id ||
        entry.resourceId === proposal.skillId ||
        entry.note?.includes(proposal.id) ||
        (proposal.skillId != null && entry.note?.includes(proposal.skillId))
    )
    .map((entry) => mapAuditEntry(entry, options.actorFallbackEmail));

  return {
    id: proposal.id,
    type: proposal.action,
    status: resolvedStatus,
    skillId: proposal.skillId,
    skillName: formatSkillDisplayName(proposal.payload.name),
    confidence: proposal.confidence,
    reason: proposal.reason,
    sampleSize: proposal.payload.metrics.sampleSize,
    oldMarkdown:
      "previous" in proposal && proposal.previous
        ? serializeSkill(proposal.previous)
        : proposal.previous
          ? serializeSkill(proposal.previous)
          : undefined,
    newMarkdown: serializeSkill(proposal.payload),
    createdAt: proposal.payload.metrics.generatedAt,
    updatedAt: resolvedAt ?? new Date().toISOString(),
    auditLog,
  };
}

function trajectoryProjectLabel(episode: Episode, workspaceName?: string): string {
  const ctx = episode.projectContext?.project;
  if (ctx && ctx !== "unknown") return ctx;

  for (const event of episode.events) {
    if (event.metadata?.sourceKind === "skill") {
      const intent = event.intent?.replace(/^Existing skill:\s*/i, "").trim();
      if (intent) return intent;
    }
    const source = event.metadata?.sourceFile;
    if (typeof source === "string" && source.trim()) {
      return labelSourcePath(source);
    }
  }

  return workspaceName ?? "Workspace";
}

function trajectorySourceKind(episode: Episode): Trajectory["sourceKind"] {
  const kinds = new Set(episode.events.map((event) => event.metadata?.sourceKind).filter(Boolean));
  if (kinds.has("trajectory")) return "session";
  if (kinds.has("skill")) return "catalog";
  if (kinds.has("document")) return "document";
  return "session";
}

function trajectorySessionLabel(episode: Episode, sourceKind: Trajectory["sourceKind"]): string {
  if (sourceKind === "catalog") return "Skill catalog";
  if (sourceKind === "document") return "Reference doc";
  const sessionId = episode.events[0]?.sessionId;
  if (sessionId?.startsWith("skill-")) return "Skill catalog";
  if (sessionId) return sessionId.length > 24 ? `${sessionId.slice(0, 21)}…` : sessionId;
  return "Agent session";
}

function trajectorySignature(episode: Episode): string {
  return episode.signature
    .map((step) => (step.includes("/") || step.includes("\\") ? labelSourcePath(step) : step))
    .join(", ");
}

function trajectoryIntent(intent: string): string {
  return intent.replace(/^#\s*/, "").trim();
}

function trajectoryOutcome(episode: Episode): Trajectory["outcome"] {
  if (episode.outcome !== "unknown") return episode.outcome;
  const fromDocument = episode.events.some((event) => event.metadata?.sourceFile);
  return fromDocument ? "success" : "unknown";
}

function trajectoryDurationMs(episode: Episode, sourceKind: Trajectory["sourceKind"]): number | null {
  if (sourceKind === "catalog" || sourceKind === "document") return null;
  const firstEvent = episode.events[0];
  const lastEvent = episode.events[episode.events.length - 1];
  const startedAt = firstEvent?.timestamp ?? new Date().toISOString();
  const endedAt = lastEvent?.timestamp ?? startedAt;
  const elapsed = Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
  if (elapsed > 0) return elapsed;
  if (episode.events.length <= 1) return null;
  return Math.max(250, episode.events.length * 250);
}

export function toDashboardTrajectory(episode: Episode, workspaceName?: string): Trajectory {
  const firstEvent = episode.events[0];
  const lastEvent = episode.events[episode.events.length - 1];
  const startedAt = firstEvent?.timestamp ?? new Date().toISOString();
  const sourceKind = trajectorySourceKind(episode);

  const signatureSteps = episode.signature.map((step) =>
    step.includes("/") || step.includes("\\") ? labelSourcePath(step) : step
  );

  return {
    id: episode.id,
    project: trajectoryProjectLabel(episode, workspaceName),
    intent: trajectoryIntent(episode.intent),
    signature: trajectorySignature(episode),
    signatureSteps,
    sessionId: episode.sessionId,
    outcome: trajectoryOutcome(episode),
    durationMs: trajectoryDurationMs(episode, sourceKind),
    episodeCount: 1,
    startedAt,
    sourceKind,
    sessionLabel: trajectorySessionLabel(episode, sourceKind),
    events: episode.events.map((event) => ({
      id: event.id,
      step: event.sequence,
      type: event.type,
      description:
        event.action && (event.action.includes("/") || event.action.includes("\\"))
          ? labelSourcePath(String(event.action))
          : (event.action ?? event.intent ?? event.type),
      timestamp: event.timestamp,
    })),
  };
}
