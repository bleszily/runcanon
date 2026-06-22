import { randomUUID } from "node:crypto";

import type { Episode, Outcome, TrajectoryEvent } from "@runcanon/spec";

/** Options for segmenting a trajectory into skill episodes. */
export interface SegmentationOptions {
  /** Minimum idle time in milliseconds to force a boundary. */
  idleBoundaryMs?: number;
  /** Event types that always start a new episode. */
  boundaryEventTypes?: TrajectoryEvent["type"][];
  /** Function to extract primary intent from an event or sequence. */
  intentExtractor?: (events: TrajectoryEvent[]) => string;
}

const DEFAULT_BOUNDARY_TYPES: TrajectoryEvent["type"][] = ["boundary", "prompt_invoke"];

/**
 * Segment a flat trajectory of events into contiguous skill episodes.
 *
 * Boundaries are detected at:
 * - explicit `boundary` events
 * - `prompt_invoke` events (user switches to a new guided workflow)
 * - user messages whose intent differs from the running episode
 * - idle gaps exceeding the threshold
 */
export function segmentTrajectory(
  events: TrajectoryEvent[],
  options: SegmentationOptions = {}
): Episode[] {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const { idleBoundaryMs = 120_000, boundaryEventTypes = DEFAULT_BOUNDARY_TYPES } = options;

  const episodes: Episode[] = [];
  let current: TrajectoryEvent[] = [];
  let lastTimestamp = sorted[0].timestamp;

  const flush = (forceOutcome?: Outcome) => {
    if (current.length === 0) return;
    const outcome = forceOutcome ?? inferEpisodeOutcome(current);
    const signature = extractSignature(current);
    const intent = options.intentExtractor?.(current) ?? inferIntent(current);

    episodes.push({
      id: randomUUID(),
      sessionId: current[0].sessionId,
      intent,
      events: current,
      signature,
      projectContext: current[current.length - 1].projectContext,
      outcome,
      segmentationConfidence: 0.8,
    });
    current = [];
  };

  for (const event of sorted) {
    const isBoundary = boundaryEventTypes.includes(event.type);
    const idle = new Date(event.timestamp).getTime() - new Date(lastTimestamp).getTime() > idleBoundaryMs;
    const userSwitch = event.actor === "user" && event.type === "message" && current.length > 0;

    if (isBoundary || idle || userSwitch) {
      flush();
    }

    current.push(event);
    lastTimestamp = event.timestamp;
  }

  flush();
  return episodes;
}

/** Derive episode outcome from terminal events. */
export function inferEpisodeOutcome(events: TrajectoryEvent[]): Outcome {
  const outcomes = events
    .map((event) => event.outcome)
    .filter((outcome): outcome is Outcome => Boolean(outcome) && outcome !== "unknown");

  if (outcomes.length === 0) return "unknown";

  const counts = new Map<Outcome, number>();
  for (const outcome of outcomes) {
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  }

  // Terminal outcome wins; otherwise majority.
  const last = outcomes[outcomes.length - 1];
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return last === "success" || last === "failure" ? last : majority;
}

/** Extract ordered action signature (tool/prompt names) from events. */
export function extractSignature(events: TrajectoryEvent[]): string[] {
  const signature: string[] = [];
  for (const event of events) {
    if (!event.action) continue;
    // Collapse consecutive identical actions.
    if (signature[signature.length - 1] === event.action) continue;
    signature.push(event.action);
  }
  return signature;
}

/** Infer a concise intent label from the first user message or prompt invocation. */
function inferIntent(events: TrajectoryEvent[]): string {
  const trigger = events.find((event) => event.actor === "user" || event.type === "prompt_invoke");
  if (trigger?.intent) return trigger.intent;
  if (trigger?.action) return trigger.action;
  return "unknown-episode";
}
