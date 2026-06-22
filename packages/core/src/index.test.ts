import { describe, expect, it } from "vitest";

import { mineSkills, segmentTrajectory } from "./index.js";

import type { TrajectoryEvent } from "@runcanon/spec";


function makeEvent(
  sequence: number,
  type: TrajectoryEvent["type"],
  actor: TrajectoryEvent["actor"],
  action?: string,
  intent?: string,
  outcome?: TrajectoryEvent["outcome"]
): TrajectoryEvent {
  return {
    id: `e-${String(sequence)}`,
    sessionId: "s1",
    sequence,
    timestamp: new Date(2026, 0, 1, 0, 0, sequence).toISOString(),
    actor,
    type,
    action,
    intent,
    outcome,
  };
}

describe("segmentTrajectory", () => {
  it("splits on prompt_invoke boundaries", () => {
    const events: TrajectoryEvent[] = [
      makeEvent(0, "message", "user", undefined, "triage CVEs"),
      makeEvent(1, "tool_call", "agent", "fetch_apiiro_risks"),
      makeEvent(2, "prompt_invoke", "agent", "triage"),
      makeEvent(3, "tool_call", "agent", "triage_vulnerability"),
      makeEvent(4, "outcome", "agent", undefined, undefined, "success"),
    ];

    const episodes = segmentTrajectory(events);
    expect(episodes.length).toBeGreaterThanOrEqual(1);
    expect(episodes[0].signature).toContain("fetch_apiiro_risks");
  });
});

describe("mineSkills", () => {
  it("discovers a recurring workflow", async () => {
    const events: TrajectoryEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push(makeEvent(i * 3, "message", "user", undefined, "triage CVEs"));
      events.push(makeEvent(i * 3 + 1, "tool_call", "agent", "fetch_apiiro_risks"));
      events.push(makeEvent(i * 3 + 2, "tool_call", "agent", "triage_vulnerability", undefined, "success"));
    }

    const result = await mineSkills(events, [], {
      clustering: { distanceThreshold: 0.6, minClusterSize: 2 },
    });

    expect(result.episodes.length).toBeGreaterThanOrEqual(2);
    expect(result.clusters.length).toBeGreaterThanOrEqual(1);
    expect(result.proposals.length).toBeGreaterThanOrEqual(1);
  });
});
