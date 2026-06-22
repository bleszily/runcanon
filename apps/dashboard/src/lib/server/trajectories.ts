import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { filterClusteringEvents, segmentTrajectory } from "@runcanon/core";
import type { Episode } from "@runcanon/core";
import type { TrajectoryEvent } from "@runcanon/spec";

/** Read all JSONL trajectory files from a directory. */
export async function readTrajectoryEvents(trajectoryDir: string): Promise<TrajectoryEvent[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(trajectoryDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const allEvents: TrajectoryEvent[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".jsonl"))) {
    try {
      const content = await readFile(join(trajectoryDir, entry), "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      for (const line of lines) {
        try {
          allEvents.push(JSON.parse(line) as TrajectoryEvent);
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  return allEvents;
}

/** Segment trajectory events into episodes. */
export function segmentTrajectoryEvents(events: TrajectoryEvent[]): Episode[] {
  return segmentTrajectory(events);
}

/** Load segmented episodes from live agent JSONL only (excludes catalog SKILL.md imports). */
export async function loadSessionEpisodes(trajectoryDir: string): Promise<Episode[]> {
  const events = filterClusteringEvents(await readTrajectoryEvents(trajectoryDir));
  return segmentTrajectoryEvents(events);
}

/** @deprecated Prefer loadSessionEpisodes — kept as alias for session-only episodes. */
export async function loadAllEpisodes(trajectoryDir: string): Promise<Episode[]> {
  return loadSessionEpisodes(trajectoryDir);
}

/** Load recent episodes from the project's trajectory storage. */
export async function loadRecentEpisodes(trajectoryDir: string): Promise<Episode[]> {
  const episodes = await loadAllEpisodes(trajectoryDir);
  return dedupeEpisodesForDisplay(episodes);
}

function dedupeEpisodesForDisplay(episodes: Episode[]): Episode[] {
  const byKey = new Map<string, Episode>();
  for (const episode of episodes) {
    const key = episode.sessionId || episode.id;
    const existing = byKey.get(key);
    if (!existing || episode.events.length > existing.events.length) {
      byKey.set(key, episode);
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      new Date(b.events.at(-1)?.timestamp ?? 0).getTime() -
      new Date(a.events.at(-1)?.timestamp ?? 0).getTime()
  );
}
