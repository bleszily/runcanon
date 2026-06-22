import { randomUUID } from "node:crypto";

import type { Outcome, ProjectContext, TrajectoryEvent } from "@runcanon/spec";

/**
 * Import Aider chat history markdown (`.aider.chat.history.md`) into trajectory events.
 * Each `####` heading block becomes a user/agent message pair.
 */
export function importAiderHistory(
  markdown: string,
  options: { sessionId?: string; projectContext?: ProjectContext; defaultOutcome?: Outcome } = {}
): TrajectoryEvent[] {
  const sessionId = options.sessionId ?? randomUUID();
  const events: TrajectoryEvent[] = [];
  let sequence = 0;
  const now = new Date().toISOString();

  const blocks = markdown.split(/^#### /m).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    const header = lines[0]?.trim() ?? "";
    const body = lines.slice(1).join("\n").trim();
    if (!body) continue;

    const isUser = /user|human/i.test(header);
    events.push({
      id: randomUUID(),
      sessionId,
      sequence: sequence++,
      timestamp: now,
      actor: isUser ? "user" : "agent",
      type: "message",
      intent: body.slice(0, 200),
      outcome: isUser ? undefined : (options.defaultOutcome ?? "success"),
      projectContext: options.projectContext,
    });
  }

  return events;
}
