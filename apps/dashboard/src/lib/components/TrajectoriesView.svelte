<script lang="ts">
  import Icon from "./Icon.svelte";
  import Badge from "./Badge.svelte";
  import TrajectoryDrawer from "./TrajectoryDrawer.svelte";
  import type { Trajectory } from "$lib/types";
  import type { WorkflowGraph } from "$lib/trajectory-graph";
  import { graphDimensions, nodePosition } from "$lib/trajectory-graph";

  interface Props {
    trajectories: Trajectory[];
    workflowGraph: WorkflowGraph;
    allTrajectories?: Trajectory[];
    loading?: boolean;
  }

  let { trajectories, workflowGraph, allTrajectories = [], loading = false }: Props = $props();

  let selectedTrajectory = $state<Trajectory | null>(null);
  let hoverNodeId = $state<string | null>(null);

  const lookup = $derived(new Map([...trajectories, ...allTrajectories].map((t) => [t.id, t])));

  const outcomeVariant = (outcome: Trajectory["outcome"]) => {
    switch (outcome) {
      case "success":
        return "success";
      case "failure":
        return "danger";
      case "partial":
        return "warning";
      default:
        return "muted";
    }
  };

  function formatDuration(ms: number | null) {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return `${minutes}m ${rem}s`;
  }

  const sourceVariant = (source: Trajectory["sourceKind"]) => {
    switch (source) {
      case "session":
        return "success";
      case "catalog":
        return "warning";
      default:
        return "muted";
    }
  };

  const maxSteps = $derived(
    workflowGraph.nodes.reduce((max, node) => Math.max(max, node.step + 1), 0)
  );
  const dims = $derived(graphDimensions(workflowGraph.lanes.length || 1, maxSteps || 1));

  const nodeFill = (node: (typeof workflowGraph.nodes)[number]) => {
    if (node.sourceKind === "catalog") return "hsl(var(--warning))";
    if (node.kind === "start") return "hsl(var(--primary))";
    if (node.kind === "outcome") {
      return node.outcome === "success" ? "hsl(var(--success))" : "hsl(var(--destructive))";
    }
    return "hsl(210 80% 45%)";
  };

  function selectBySession(sessionId: string) {
    const match = [...lookup.values()].find((t) => t.sessionId === sessionId);
    if (match) selectedTrajectory = match;
  }

  function truncate(label: string, max = 16): string {
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
  }

  function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
    const dx = to.x - from.x;
    const c1x = from.x + dx * 0.35;
    const c2x = to.x - dx * 0.35;
    return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
  }
</script>

<div class="space-y-6">
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
    <div class="card p-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold">Workflow Path Map</h3>
          <p class="text-xs text-[hsl(var(--muted-foreground))]">
            Directed lanes per session · arrows show tool order · catalog imports excluded
          </p>
        </div>
        <div class="flex flex-wrap gap-2 text-xs">
          <span class="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] px-2 py-1">
            <span class="h-2 w-2 rounded-full bg-[hsl(var(--primary))]"></span> start
          </span>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] px-2 py-1">
            <span class="h-2 w-2 rounded-full bg-[hsl(210_80%_45%)]"></span> tool
          </span>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] px-2 py-1">
            <span class="h-2 w-2 rounded-full bg-[hsl(var(--success))]"></span> outcome
          </span>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] px-2 py-1">
            <span class="h-2 w-2 rounded-full bg-[hsl(var(--warning))]"></span> catalog
          </span>
        </div>
      </div>

      {#if loading}
        <div class="skeleton h-72 w-full"></div>
      {:else if workflowGraph.nodes.length === 0}
        <p class="text-sm text-[hsl(var(--muted-foreground))]">No trajectories to visualize.</p>
      {:else}
        <div class="overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10 p-4">
          <svg width={dims.width} height={dims.height} class="min-w-full">
            <defs>
              <marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="hsl(var(--muted-foreground))" />
              </marker>
              <marker id="flow-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="hsl(var(--primary))" />
              </marker>
            </defs>

            {#each workflowGraph.lanes as lane, laneIndex}
              <text
                x="12"
                y={56 + laneIndex * dims.laneY + 4}
                fill="hsl(var(--muted-foreground))"
                font-size="10"
                font-weight="600"
              >
                {truncate(lane.label, 14)}
              </text>
              <line
                x1="72"
                y1={56 + laneIndex * dims.laneY}
                x2={dims.width - 24}
                y2={56 + laneIndex * dims.laneY}
                stroke="hsl(var(--border))"
                stroke-width="1"
                stroke-dasharray="4 4"
                opacity="0.5"
              />
            {/each}

            {#each workflowGraph.edges as edge}
              {@const fromNode = workflowGraph.nodes.find((n) => n.id === edge.from)}
              {@const toNode = workflowGraph.nodes.find((n) => n.id === edge.to)}
              {#if fromNode && toNode}
                {@const from = nodePosition(fromNode, dims)}
                {@const to = nodePosition(toNode, dims)}
                {@const active = hoverNodeId === edge.from || hoverNodeId === edge.to}
                <path
                  d={edgePath(
                    { x: from.x + 22, y: from.y },
                    { x: to.x - 22, y: to.y }
                  )}
                  fill="none"
                  stroke={active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                  stroke-width={active ? 2.5 : 1.5}
                  marker-end={active ? "url(#flow-arrow-active)" : "url(#flow-arrow)"}
                  opacity={active ? 1 : 0.65}
                />
              {/if}
            {/each}

            {#each workflowGraph.nodes as node}
              {@const pos = nodePosition(node, dims)}
              <g
                role="button"
                tabindex="0"
                class="cursor-pointer"
                onmouseenter={() => (hoverNodeId = node.id)}
                onmouseleave={() => (hoverNodeId = null)}
                onclick={() => selectBySession(node.sessionId)}
                onkeydown={(e) => e.key === "Enter" && selectBySession(node.sessionId)}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={hoverNodeId === node.id ? 22 : 18}
                  fill={nodeFill(node)}
                  stroke={hoverNodeId === node.id ? "hsl(var(--foreground))" : "transparent"}
                  stroke-width="2"
                  class="transition-all duration-150"
                />
                <text x={pos.x} y={pos.y + 4} text-anchor="middle" fill="white" font-size="10" font-weight="700">
                  {node.step + 1}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 34}
                  text-anchor="middle"
                  fill="hsl(var(--foreground))"
                  font-size="10"
                  font-weight="500"
                >
                  {truncate(node.label)}
                </text>
              </g>
            {/each}
          </svg>
        </div>
      {/if}
    </div>

    <div class="card p-5">
      <h4 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        Hot Transitions
      </h4>
      {#if workflowGraph.transitions.length === 0}
        <p class="text-xs text-[hsl(var(--muted-foreground))]">No repeated paths yet.</p>
      {:else}
        <ul class="space-y-2">
          {#each workflowGraph.transitions.slice(0, 8) as transition}
            <li class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 px-3 py-2 text-xs">
              <div class="font-mono text-[hsl(var(--foreground))]">
                {truncate(transition.from, 12)} → {truncate(transition.to, 12)}
              </div>
              <div class="mt-1 text-[hsl(var(--muted-foreground))]">{transition.count} session(s)</div>
            </li>
          {/each}
        </ul>
      {/if}

      <h4 class="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
        Session Lanes
      </h4>
      <ul class="space-y-1.5 text-xs">
        {#each workflowGraph.lanes as lane}
          <li class="flex items-center justify-between gap-2">
            <button class="truncate text-left hover:underline" onclick={() => selectBySession(lane.sessionId)}>
              {lane.label}
            </button>
            <Badge variant={sourceVariant(lane.sourceKind)}>{lane.sourceKind === "session" ? "live" : "catalog"}</Badge>
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <div class="card overflow-hidden">
    <h3 class="p-5 text-lg font-semibold">Episode Table</h3>
    {#if loading}
      <div class="space-y-2 p-5">
        {#each Array(4) as _, i}
          <div class="skeleton h-12 w-full"></div>
        {/each}
      </div>
    {:else if trajectories.length === 0}
      <div class="flex flex-col items-center justify-center py-12 text-[hsl(var(--muted-foreground))]">
        <Icon name="trajectories" size={40} class="mb-2 opacity-40" />
        <p class="text-sm">No trajectories recorded.</p>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 text-left">
            <tr>
              <th class="px-5 py-3 font-medium">Session</th>
              <th class="px-5 py-3 font-medium">Intent</th>
              <th class="px-5 py-3 font-medium">Path</th>
              <th class="px-5 py-3 font-medium">Source</th>
              <th class="px-5 py-3 font-medium">Outcome</th>
              <th class="px-5 py-3 font-medium">Duration</th>
              <th class="px-5 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[hsl(var(--border))]">
            {#each trajectories as trajectory}
              <tr class="hover:bg-[hsl(var(--muted))]/30">
                <td class="px-5 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">{trajectory.sessionLabel}</td>
                <td class="px-5 py-3 max-w-xs truncate font-medium" title={trajectory.intent}>{trajectory.intent}</td>
                <td class="px-5 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))] max-w-sm truncate" title={trajectory.signature}>
                  {trajectory.signatureSteps.join(" → ")}
                </td>
                <td class="px-5 py-3">
                  <Badge variant={sourceVariant(trajectory.sourceKind)}>
                    {trajectory.sourceKind === "session" ? "live session" : trajectory.sourceKind}
                  </Badge>
                </td>
                <td class="px-5 py-3">
                  <Badge variant={outcomeVariant(trajectory.outcome)}>{trajectory.outcome}</Badge>
                </td>
                <td class="px-5 py-3">{formatDuration(trajectory.durationMs)}</td>
                <td class="px-5 py-3 text-right">
                  <button class="btn btn-ghost h-7 px-2 text-xs" onclick={() => (selectedTrajectory = trajectory)}>
                    Details
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<TrajectoryDrawer trajectory={selectedTrajectory} onClose={() => (selectedTrajectory = null)} />
