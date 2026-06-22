import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";

import { Collector, sanitizeArgs } from "./collector.js";

describe("Collector", () => {
  let dir: string;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes JSONL records to a session-scoped file", () => {
    dir = mkdtempSync(join(tmpdir(), "telemetry-"));
    const collector = new Collector({ storagePath: dir, sessionId: "s1" });

    collector.emit({
      actor: "user",
      type: "message",
      timestamp: "2026-06-21T00:00:00.000Z",
      intent: "hello",
    });

    collector.emit({
      actor: "agent",
      type: "tool_call",
      timestamp: "2026-06-21T00:00:01.000Z",
      action: "search",
      args: { query: "example" },
    });

    collector.close();

    const lines = readFileSync(join(dir, "s1.jsonl"), "utf-8")
      .trim()
      .split("\n");
    expect(lines.length).toBe(2);

    const first = JSON.parse(lines[0]);
    expect(first.sessionId).toBe("s1");
    expect(first.sequence).toBe(0);
    expect(first.type).toBe("message");

    const second = JSON.parse(lines[1]);
    expect(second.sequence).toBe(1);
    expect(second.action).toBe("search");
  });

  it("redacts secret-looking argument values", () => {
    dir = mkdtempSync(join(tmpdir(), "telemetry-"));
    const collector = new Collector({ storagePath: dir, sessionId: "s2" });

    collector.emit({
      actor: "agent",
      type: "tool_call",
      timestamp: "2026-06-21T00:00:00.000Z",
      action: "auth",
      args: { apiKey: "super-secret", user: "alice" },
    });

    collector.close();

    const line = readFileSync(join(dir, "s2.jsonl"), "utf-8").trim();
    const event = JSON.parse(line);
    expect(event.args.apiKey).toBe("[redacted]");
    expect(event.args.user).toBe("alice");
  });

  it("starts a new session by flushing the previous file", () => {
    dir = mkdtempSync(join(tmpdir(), "telemetry-"));
    const collector = new Collector({ storagePath: dir, sessionId: "old" });

    collector.emit({ actor: "user", type: "message", timestamp: "2026-06-21T00:00:00.000Z" });
    collector.startSession("new");
    collector.emit({ actor: "user", type: "message", timestamp: "2026-06-21T00:00:01.000Z" });
    collector.close();

    const oldLines = readFileSync(join(dir, "old.jsonl"), "utf-8").trim().split("\n");
    const newLines = readFileSync(join(dir, "new.jsonl"), "utf-8").trim().split("\n");
    expect(oldLines.length).toBe(1);
    expect(newLines.length).toBe(1);
    expect(JSON.parse(newLines[0]).sequence).toBe(0);
  });
});

describe("sanitizeArgs", () => {
  it("recursively redacts nested secret keys", () => {
    const input = {
      token: "abc",
      user: {
        password: "hunter2",
        name: "alice",
        apiKey: "xyz",
      },
      items: [{ secret: "hidden", value: "visible" }],
    };

    const result = sanitizeArgs(input);
    expect(result).toEqual({
      token: "[redacted]",
      user: {
        password: "[redacted]",
        name: "alice",
        apiKey: "[redacted]",
      },
      items: [{ secret: "[redacted]", value: "visible" }],
    });
  });

  it("returns undefined when args are undefined", () => {
    expect(sanitizeArgs(undefined)).toBeUndefined();
  });
});
