import { randomUUID } from "node:crypto";

import type { Outcome, ProjectContext, TrajectoryEvent } from "@runcanon/spec";

/** Codex CLI session JSONL record (simplified). */
export interface CodexSessionRecord {
  type?: string;
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  timestamp?: string;
  tool_name?: string;
  tool_call_id?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
}

/**
 * Import OpenAI Codex CLI session JSONL lines into canonical trajectory events.
 * Supports ~/.codex/sessions/*.jsonl format.
 */
export function importCodexLogs(
  records: CodexSessionRecord[],
  options: { sessionId?: string; projectContext?: ProjectContext; defaultOutcome?: Outcome } = {}
): TrajectoryEvent[] {
  const sessionId = options.sessionId ?? randomUUID();
  const events: TrajectoryEvent[] = [];
  let sequence = 0;
  const now = new Date().toISOString();

  for (const record of records) {
    const timestamp = record.timestamp ?? now;
    const role = record.role?.toLowerCase();

    if (record.type === "tool_call" || record.tool_name) {
      events.push({
        id: randomUUID(),
        sessionId,
        sequence: sequence++,
        timestamp,
        actor: "agent",
        type: "tool_call",
        action: record.tool_name ?? "tool",
        args: record.arguments,
        projectContext: options.projectContext,
      });
      continue;
    }

    if (record.type === "tool_result" || record.result !== undefined) {
      events.push({
        id: randomUUID(),
        sessionId,
        sequence: sequence++,
        timestamp,
        actor: "tool",
        type: "tool_result",
        action: record.tool_name ?? "tool",
        outcome: options.defaultOutcome ?? "success",
        projectContext: options.projectContext,
      });
      continue;
    }

    const text =
      typeof record.content === "string"
        ? record.content
        : Array.isArray(record.content)
          ? record.content.map((p) => p.text ?? "").join("\n")
          : "";

    if (!text && !role) continue;

    events.push({
      id: randomUUID(),
      sessionId,
      sequence: sequence++,
      timestamp,
      actor: role === "user" ? "user" : "agent",
      type: "message",
      intent: text.slice(0, 200),
      projectContext: options.projectContext,
    });
  }

  return events;
}
