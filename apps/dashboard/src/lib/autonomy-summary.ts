import type { AutonomyLevel } from "$lib/types.js";

export function autonomousLadderCount(
  ladders: Array<{ level: AutonomyLevel }>,
  globalEnabled: boolean,
  emergencyStop: boolean
): number {
  if (!globalEnabled || emergencyStop) return 0;
  return ladders.filter((l) => l.level === "do-show" || l.level === "do-tell").length;
}

export function formatAutonomyRiskSummary(input: {
  globalEnabled: boolean;
  emergencyStop: boolean;
  autonomousCount: number;
  ladderCount: number;
  undoWindowMinutes: number;
}): string {
  const mode = input.globalEnabled ? "enabled" : "disabled";
  const stopNote = input.emergencyStop ? " Emergency stop is active." : "";
  return `Global autonomy is ${mode}.${stopNote} ${input.autonomousCount} of ${input.ladderCount} task types can execute without explicit confirmation. Undo window is ${input.undoWindowMinutes} minutes.`;
}
