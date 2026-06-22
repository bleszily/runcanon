import { describe, expect, it } from "vitest";

import { importClaudeCodeLogs } from "./importer.js";

describe("importClaudeCodeLogs", () => {
  it("converts messages into trajectory events and detects boundaries", () => {
    const conversation = {
      id: "conv-1",
      projectContext: { project: "demo", branch: "main" },
      messages: [
        { role: "user", content: "Find the largest file", timestamp: "2026-06-21T00:00:00Z" },
        {
          role: "assistant",
          content: "I'll search for files.",
          timestamp: "2026-06-21T00:00:05Z",
          tool_calls: [{ name: "list_files", arguments: { path: "/tmp" } }],
        },
        { role: "tool", content: "done", timestamp: "2026-06-21T00:00:06Z" },
        { role: "user", content: "Now sort them", timestamp: "2026-06-21T00:00:10Z" },
      ],
    };

    const events = importClaudeCodeLogs(conversation);
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events[0].actor).toBe("user");
    expect(events[0].type).toBe("message");

    const boundary = events.find((e) => e.type === "boundary");
    expect(boundary).toBeDefined();
    expect(boundary?.actor).toBe("user");
    expect(boundary?.projectContext?.project).toBe("demo");
  });

  it("parses tool call arguments from JSON strings", () => {
    const conversation = {
      messages: [
        {
          role: "assistant",
          content: "Running tool",
          tool_calls: [{ function: { name: "do_thing", arguments: '{"x":1}' } }],
        },
      ],
    };

    const events = importClaudeCodeLogs(conversation);
    const toolCall = events.find((e) => e.type === "tool_call");
    expect(toolCall).toBeDefined();
    expect(toolCall?.action).toBe("do_thing");
    expect(toolCall?.args).toEqual({ x: 1 });
  });

  it("returns an empty array for missing messages", () => {
    expect(importClaudeCodeLogs({})).toEqual([]);
    expect(importClaudeCodeLogs({ messages: undefined })).toEqual([]);
  });
});
