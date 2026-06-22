import type { CollectSourcesSummary } from "@runcanon/core";
import { filterClusteringEvents } from "@runcanon/core";
import type { TrajectoryEvent } from "@runcanon/spec";

export const NO_WORKFLOW_TRAJECTORIES_MESSAGE =
  "No agent workflow trajectories found. RunCanon discovers skills from ordered agent sessions (tool_call / prompt_invoke sequences) in .runcanon/trajectories/*.jsonl — not from bulk-uploading every file in a directory. Record real sessions via MCP telemetry or append JSONL from your agent runs, then mine again.";

export function printCollectionSummary(summary: CollectSourcesSummary): void {
  if (summary.autoDiscoveredSkillDirs.length > 0) {
    console.log(
      `Auto-included ${summary.autoDiscoveredSkillDirs.length} skill catalog(s): ${summary.autoDiscoveredSkillDirs.join(", ")}`
    );
  }

  if (summary.skippedPaths.length > 0) {
    console.warn(
      `Skipped ${summary.skippedPaths.length} generic directory path(s): ${summary.skippedPaths.join(", ")}`
    );
    console.warn(
      "  Tip: pass explicit files (manifesto.md) or trajectories/ or skills/ folders — not whole doc trees."
    );
  }

  console.log(
    `Collected ${summary.trajectoryFiles} trajectory file(s), ${summary.skillFiles} skill file(s), ${summary.documentFiles} reference doc(s).`
  );
  console.log(
    `Workflow events: ${summary.workflowEventCount} (mined) · Reference events: ${summary.referenceEventCount} (context only).`
  );

  if (summary.trajectoryFiles === 0 && summary.skillFiles > 0) {
    console.warn(
      "No trajectory JSONL in .runcanon/trajectories — existing skills loaded as context only. Record agent sessions (MCP telemetry or JSONL export) to discover new skill proposals."
    );
  }
}

export function assertClusteringSources(summary: CollectSourcesSummary, events: TrajectoryEvent[]): void {
  if (filterClusteringEvents(events).length > 0) return;

  if (summary.skillFiles > 0 || summary.trajectoryFiles === 0) {
    throw new Error(
      "No agent session JSONL for mining.\n\n" +
        "Catalog SKILL.md files are context only — they do not create proposals.\n\n" +
        "Record real agent work first:\n" +
        "  • In Cursor: use RunCanon MCP → runcanon_emit_event (tool_call / outcome sequences)\n" +
        "  • Or append JSONL under .runcanon/trajectories/*.jsonl\n\n" +
        "Then run: runcanon mine"
    );
  }

  assertWorkflowEvents(summary);
}

export function assertWorkflowEvents(summary: CollectSourcesSummary): void {
  if (summary.workflowEventCount > 0) return;

  if (summary.referenceEventCount > 0) {
    throw new Error(
      `${NO_WORKFLOW_TRAJECTORIES_MESSAGE}\n\n` +
        `Found ${summary.skillFiles} existing skill(s) and ${summary.documentFiles} reference doc(s), but no agent session JSONL. ` +
        `Catalog skills are context only — add ordered tool/prompt sequences under .runcanon/trajectories/*.jsonl, then mine again.`
    );
  }

  const skillHint =
    summary.autoDiscoveredSkillDirs.length === 0
      ? "Point --source at a skills/ folder with SKILL.md files, or pass explicit document paths."
      : "No SKILL.md or JSONL found even after scanning the project.";

  throw new Error(
    "No mining sources found.\n\n" +
      "RunCanon mines from:\n" +
      "  • .runcanon/trajectories/*.jsonl — agent sessions (primary signal for new skill proposals)\n" +
      "  • skills/ folders — existing SKILL.md catalogs (context; pair with trajectories for discovery)\n\n" +
      `${skillHint}\n\n` +
      "Example:\n" +
      "  runcanon mine --source .runcanon/trajectories --source uc-claude-marketplace-security/plugins/uc-security-skills/skills"
  );
}
