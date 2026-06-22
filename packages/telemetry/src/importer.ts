import { randomUUID } from "node:crypto";

import type { Outcome, ProjectContext, TrajectoryEvent } from "@runcanon/spec";

/** Shape of a single message inside a Claude Code conversation export. */
export interface ClaudeCodeMessage {
  /** Message role. */
  role: string;
  /** Text content (may be a string or an array of content parts). */
  content?: unknown;
  /** Optional ISO 8601 timestamp. */
  timestamp?: string;
  /** Optional tool calls emitted by the assistant. */
  tool_calls?: Array<{
    id?: string;
    name?: string;
    function?: { name?: string; arguments?: string | Record<string, unknown> };
    arguments?: string | Record<string, unknown>;
  }>;
  /** Optional tool results. */
  tool_results?: Array<{
    tool_call_id?: string;
    name?: string;
    content?: unknown;
    output?: unknown;
  }>;
}

/** Root shape of a Claude Code conversation export. */
export interface ClaudeCodeConversation {
  /** Conversation identifier. */
  id?: string;
  /** Optional project context. */
  projectContext?: ProjectContext;
  /** Ordered messages. */
  messages?: ClaudeCodeMessage[];
}

/**
 * Read a Claude Code conversation export JSON object and convert it into canonical
 * {@link TrajectoryEvent} records.
 *
 * Boundaries are inserted whenever a new user message follows an assistant message,
 * producing a `boundary` event that downstream segmentation can use to split episodes.
 */
export function importClaudeCodeLogs(
  conversation: ClaudeCodeConversation,
  options: {
    sessionId?: string;
    projectContext?: ProjectContext;
    defaultOutcome?: Outcome;
  } = {}
): TrajectoryEvent[] {
  const sessionId = options.sessionId ?? conversation.id ?? randomUUID();
  const baseContext = options.projectContext ?? conversation.projectContext;
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];

  const events: TrajectoryEvent[] = [];
  let sequence = 0;
  let lastRole: string | undefined;

  const now = new Date().toISOString();

  for (const message of messages) {
    const role = normalizeRole(message.role);
    const timestamp = toIsoTimestamp(message.timestamp) ?? now;

    // Boundary: a new user turn after any non-user message starts a new episode.
    if (role === "user" && lastRole && lastRole !== "user") {
      events.push({
        id: randomUUID(),
        sessionId,
        sequence: sequence++,
        timestamp,
        actor: "user",
        type: "boundary",
        intent: "new-turn",
        projectContext: baseContext,
      });
    }

    // Main message event.
    const text = extractTextContent(message.content);
    events.push({
      id: randomUUID(),
      sessionId,
      sequence: sequence++,
      timestamp,
      actor: role === "user" ? "user" : "agent",
      type: "message",
      action: undefined,
      intent: text ? text.slice(0, 120) : undefined,
      args: text ? { content: text } : undefined,
      projectContext: baseContext,
    });

    // Tool calls emitted by the assistant.
    for (const toolCall of message.tool_calls ?? []) {
      const toolName = toolCall.name ?? toolCall.function?.name ?? "unknown-tool";
      const toolArgs = parseToolArguments(toolCall.arguments ?? toolCall.function?.arguments);
      events.push({
        id: randomUUID(),
        sessionId,
        sequence: sequence++,
        timestamp,
        actor: "agent",
        type: "tool_call",
        action: toolName,
        args: toolArgs,
        projectContext: baseContext,
      });
    }

    // Tool results following the calls.
    for (const result of message.tool_results ?? []) {
      events.push({
        id: randomUUID(),
        sessionId,
        sequence: sequence++,
        timestamp,
        actor: "tool",
        type: "tool_result",
        action: result.name ?? "unknown-tool",
        args: result.content !== undefined ? { content: result.content } : result.output !== undefined ? { output: result.output } : undefined,
        outcome: inferOutcome(result),
        projectContext: baseContext,
      });
    }

    lastRole = role;
  }

  if (options.defaultOutcome && events.length > 0) {
    const finalEvent = events[events.length - 1];
    finalEvent.outcome ??= options.defaultOutcome;
  }

  return events;
}

function normalizeRole(role: string | undefined): string {
  if (!role) return "unknown";
  const lower = role.toLowerCase();
  if (lower === "user" || lower === "human") return "user";
  if (lower === "assistant" || lower === "agent" || lower === "model") return "assistant";
  return lower;
}

function extractTextContent(content?: unknown): string | undefined {
  if (content === undefined || content === null) return undefined;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : (part as { text?: string }).text ?? ""))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object") return undefined;
  return String(content);
}

function parseToolArguments(raw?: string | Record<string, unknown>): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw ? { raw } : undefined;
  }
}

function toIsoTimestamp(value?: string | number | Date): string | undefined {
  if (value === undefined) return undefined;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function inferOutcome(result: { content?: unknown; output?: unknown }): Outcome | undefined {
  const payload = JSON.stringify(result.content ?? result.output ?? "");
  if (/error|fail|exception|timed out/i.test(payload)) return "failure";
  if (/success|ok|done|completed/i.test(payload)) return "success";
  return undefined;
}
