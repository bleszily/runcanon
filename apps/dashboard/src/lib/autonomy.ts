import type { AutonomyLevel as SpecAutonomy } from "@runcanon/spec";
import type { AutonomyLevel } from "$lib/types";

export const SPEC_TO_DASH: Record<SpecAutonomy, AutonomyLevel> = {
  suggest: "show",
  ask: "ask",
  doAndShow: "do-show",
  doAndDigest: "do-tell",
};

export const SPEC_FROM_DASH: Record<AutonomyLevel, SpecAutonomy> = {
  show: "suggest",
  ask: "ask",
  "do-show": "doAndShow",
  "do-tell": "doAndDigest",
};
