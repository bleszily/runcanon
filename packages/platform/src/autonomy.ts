import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

import { LEGACY_PROJECT_DATA_DIRNAME, PROJECT_DATA_DIRNAME } from "@runcanon/core";

export interface AutonomyLadder {
  taskType: string;
  level: "show" | "ask" | "do-show" | "do-tell";
  description: string;
}

export interface WorkspaceAutonomy {
  globalEnabled: boolean;
  emergencyStop: boolean;
  undoWindowMinutes: number;
  ladders: AutonomyLadder[];
}

const DEFAULT_AUTONOMY: WorkspaceAutonomy = {
  globalEnabled: false,
  emergencyStop: false,
  undoWindowMinutes: 5,
  ladders: [
    {
      taskType: "Skill proposals",
      level: "ask",
      description: "How RunCanon applies mined skill changes",
    },
    {
      taskType: "Skill export",
      level: "ask",
      description: "Exporting skills to harness formats",
    },
  ],
};

async function resolveAutonomyPath(workspaceRoot: string): Promise<string> {
  for (const dir of [PROJECT_DATA_DIRNAME, LEGACY_PROJECT_DATA_DIRNAME]) {
    const path = join(workspaceRoot, dir, "autonomy.json");
    try {
      await access(path);
      return path;
    } catch {
      // try next
    }
  }
  return join(workspaceRoot, PROJECT_DATA_DIRNAME, "autonomy.json");
}

export async function readWorkspaceAutonomy(workspaceRoot: string): Promise<WorkspaceAutonomy> {
  try {
    const raw = await readFile(await resolveAutonomyPath(workspaceRoot), "utf-8");
    return { ...DEFAULT_AUTONOMY, ...(JSON.parse(raw) as WorkspaceAutonomy) };
  } catch {
    return { ...DEFAULT_AUTONOMY, ladders: DEFAULT_AUTONOMY.ladders.map((l) => ({ ...l })) };
  }
}

export async function writeWorkspaceAutonomy(workspaceRoot: string, settings: WorkspaceAutonomy): Promise<void> {
  const path = join(workspaceRoot, PROJECT_DATA_DIRNAME, "autonomy.json");
  await mkdir(join(workspaceRoot, PROJECT_DATA_DIRNAME), { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2), "utf-8");
}

export function autonomyToSpecLevel(settings: WorkspaceAutonomy): "suggest" | "ask" | "doAndShow" | "doAndDigest" {
  if (!settings.globalEnabled || settings.emergencyStop) {
    return "suggest";
  }
  const primary = settings.ladders[0]?.level ?? "ask";
  switch (primary) {
    case "show":
      return "suggest";
    case "ask":
      return "ask";
    case "do-show":
      return "doAndShow";
    case "do-tell":
      return "doAndDigest";
    default:
      return "ask";
  }
}
