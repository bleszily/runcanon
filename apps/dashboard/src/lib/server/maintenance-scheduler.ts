import { runAllWorkspacesPrune } from "./cleanup.js";

let started = false;
let running = false;

/** Periodic org-wide duplicate cleanup for all workspaces (runs inside the dashboard container). */
export function startMaintenanceScheduler(): void {
  if (started || process.env.RUNCANON_MAINTENANCE_ENABLED === "false") {
    return;
  }
  started = true;

  const intervalMs = Number(process.env.RUNCANON_MAINTENANCE_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
  const initialDelayMs = Number(process.env.RUNCANON_MAINTENANCE_INITIAL_DELAY_MS ?? 2 * 60 * 1000);

  const run = async () => {
    if (running) {
      console.log("[runcanon:maintenance] skip — previous run still in progress");
      return;
    }
    running = true;
    try {
      const report = await runAllWorkspacesPrune("system:scheduler");
      const t = report.totals;
      console.log(
        `[runcanon:maintenance] pruned ${report.workspaces} workspace(s): ` +
          `pending=${t.removedPending} proposedMd=${t.removedProposedMd} trajectories=${t.dedupedTrajectories}`
      );
    } catch (error) {
      console.error("[runcanon:maintenance] prune failed:", error);
    } finally {
      running = false;
    }
  };

  console.log(
    `[runcanon:maintenance] scheduler enabled — first run in ${Math.round(initialDelayMs / 1000)}s, then every ${Math.round(intervalMs / 1000 / 60)}min`
  );
  setTimeout(run, initialDelayMs);
  setInterval(run, intervalMs);
}
