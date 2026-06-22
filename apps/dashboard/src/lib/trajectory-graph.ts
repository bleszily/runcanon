import type { Trajectory } from "$lib/types";

export interface WorkflowGraphNode {
  id: string;
  label: string;
  lane: number;
  step: number;
  kind: "start" | "tool" | "outcome" | "catalog";
  sourceKind: Trajectory["sourceKind"];
  sessionId: string;
  outcome: Trajectory["outcome"];
}

export interface WorkflowGraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  weight: number;
  sessionId?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  lanes: Array<{ sessionId: string; label: string; sourceKind: Trajectory["sourceKind"] }>;
  transitions: Array<{ from: string; to: string; count: number }>;
}

export function graphDimensions(
  laneCount: number,
  maxSteps: number
): { width: number; height: number; stepX: number; laneY: number } {
  const stepX = 130;
  const laneY = 88;
  return {
    width: Math.max(720, 120 + maxSteps * stepX),
    height: Math.max(280, 80 + laneCount * laneY),
    stepX,
    laneY,
  };
}

export function nodePosition(
  node: WorkflowGraphNode,
  dims: ReturnType<typeof graphDimensions>
): { x: number; y: number } {
  return {
    x: 80 + node.step * dims.stepX,
    y: 56 + node.lane * dims.laneY,
  };
}

function nodeKind(step: string, index: number, total: number): WorkflowGraphNode["kind"] {
  if (index === 0) return "start";
  if (index === total - 1) return "outcome";
  return "tool";
}

/** Build a directed multi-lane workflow graph from live session trajectories. */
export function buildWorkflowGraph(trajectories: Trajectory[]): WorkflowGraph {
  const ordered = trajectories.filter((t) => t.sourceKind === "session");

  const nodes: WorkflowGraphNode[] = [];
  const edges: WorkflowGraphEdge[] = [];
  const lanes: WorkflowGraph["lanes"] = [];
  const transitionCounts = new Map<string, number>();

  ordered.forEach((trajectory, laneIndex) => {
    lanes.push({
      sessionId: trajectory.sessionId,
      label: trajectory.sessionLabel,
      sourceKind: trajectory.sourceKind,
    });

    const steps =
      trajectory.signatureSteps.length > 0
        ? trajectory.signatureSteps
        : trajectory.events.map((event) => event.description);

    steps.forEach((step, stepIndex) => {
      const nodeId = `${trajectory.sessionId}:${stepIndex}:${step}`;
      nodes.push({
        id: nodeId,
        label: step,
        lane: laneIndex,
        step: stepIndex,
        kind: trajectory.sourceKind === "catalog" ? "catalog" : nodeKind(step, stepIndex, steps.length),
        sourceKind: trajectory.sourceKind,
        sessionId: trajectory.sessionId,
        outcome: trajectory.outcome,
      });

      if (stepIndex > 0) {
        const prevStep = steps[stepIndex - 1]!;
        const prevId = `${trajectory.sessionId}:${stepIndex - 1}:${prevStep}`;
        edges.push({
          id: `${prevId}->${nodeId}`,
          from: prevId,
          to: nodeId,
          label: String(stepIndex),
          weight: 1,
          sessionId: trajectory.sessionId,
        });
        const transitionKey = `${prevStep}→${step}`;
        transitionCounts.set(transitionKey, (transitionCounts.get(transitionKey) ?? 0) + 1);
      }
    });
  });

  const transitions = [...transitionCounts.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split("→");
      return { from: from ?? key, to: to ?? "", count };
    })
    .sort((a, b) => b.count - a.count);

  return { nodes, edges, lanes, transitions };
}
