import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ProjectContext, TrajectoryEvent } from "@runcanon/spec";

/** Options for creating a {@link Collector}. */
export interface CollectorOptions {
  /** Directory or file path where JSONL trajectory files are written. */
  storagePath: string;
  /** Optional default project context attached to every emitted event. */
  projectContext?: ProjectContext;
  /** Optional session identifier override. */
  sessionId?: string;
}

const SECRET_KEY_PATTERNS = /token|key|password|secret|apiKey/i;

/**
 * Trajectory event collector that writes sanitized JSONL records to a storage path.
 *
 * Events are buffered in memory and flushed to a session-scoped JSONL file. When
 * `storagePath` is a directory, the file is `${storagePath}/${sessionId}.jsonl`;
 * when it points to a `.jsonl` file, that file is used directly.
 */
export class Collector {
  readonly storagePath: string;
  private readonly projectContext?: ProjectContext;
  private sessionId: string;
  private sequence = 0;
  private buffer: TrajectoryEvent[] = [];
  private closed = false;

  constructor(options: CollectorOptions) {
    this.storagePath = options.storagePath;
    this.projectContext = options.projectContext;
    this.sessionId = options.sessionId ?? randomUUID();
  }

  /** Start (or restart) a new session. buffered events are flushed to the previous file first. */
  startSession(sessionId: string): void {
    if (this.closed) {
      throw new Error("Collector is closed");
    }
    this.flush();
    this.sessionId = sessionId;
    this.sequence = 0;
  }

  /** Emit a trajectory event. The event is merged with the current session and sanitized. */
  emit(event: Omit<TrajectoryEvent, "id" | "sessionId" | "sequence"> & Partial<Pick<TrajectoryEvent, "id">>): void {
    if (this.closed) {
      throw new Error("Collector is closed");
    }

    const sanitized: TrajectoryEvent = {
      ...event,
      id: event.id ?? randomUUID(),
      sessionId: this.sessionId,
      sequence: this.sequence++,
      timestamp: event.timestamp,
      args: sanitizeArgs(event.args),
      projectContext: event.projectContext ?? this.projectContext,
    };

    this.buffer.push(sanitized);
  }

  /** Flush buffered events to the JSONL file. */
  flush(): void {
    if (this.buffer.length === 0) return;
    const path = this.resolveFilePath();
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const lines = this.buffer.map((event) => JSON.stringify(event)).join("\n");
    appendFileSync(path, `${lines}\n`, "utf-8");
    this.buffer = [];
  }

  /** Flush remaining events and close the collector. */
  close(): void {
    if (this.closed) return;
    this.flush();
    this.closed = true;
  }

  private resolveFilePath(): string {
    if (this.storagePath.endsWith(".jsonl")) {
      return this.storagePath;
    }
    return join(this.storagePath, `${this.sessionId}.jsonl`);
  }
}

/**
 * Recursively sanitize argument values for keys that look like secrets.
 *
 * Matching scalar values are replaced with `[redacted]`. Objects and arrays are
 * traversed; non-matching keys preserve their values.
 */
export function sanitizeArgs(args?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!args || typeof args !== "object") return args;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "object" && value !== null) {
      result[key] = Array.isArray(value)
        ? value.map((item): unknown =>
            typeof item === "object" && item !== null ? sanitizeArgs(item as Record<string, unknown>) : item
          )
        : sanitizeArgs(value as Record<string, unknown>);
    } else if (SECRET_KEY_PATTERNS.test(key) && typeof value !== "object") {
      result[key] = "[redacted]";
    } else {
      result[key] = value;
    }
  }
  return result;
}
