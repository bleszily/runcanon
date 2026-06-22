import { error, json } from "@sveltejs/kit";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { RequestHandler } from "./$types";

import type { TrajectoryEvent } from "@runcanon/spec";

import { requireAuth } from "$lib/server/auth.js";
import { appendAudit } from "$lib/server/audit.js";
import { paginate, parsePagination } from "$lib/server/pagination.js";
import { resolveSkillPaths } from "$lib/server/registry.js";
import { loadRecentEpisodes } from "$lib/server/trajectories.js";

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return base.endsWith(".jsonl") ? base : `${base}.jsonl`;
}

export const GET: RequestHandler = async ({ url }) => {
  const paths = await resolveSkillPaths();
  const episodes = await loadRecentEpisodes(paths.trajectoriesDir);
  const { limit, offset } = parsePagination(url, 50);
  return json(paginate(episodes, limit, offset));
};

/** Upload trajectory JSONL into the active workspace (CLI sync). */
export const POST: RequestHandler = async ({ request, locals }) => {
  const auth = requireAuth(locals.auth, "approver");
  const paths = await resolveSkillPaths();
  const trajDir = paths.trajectoriesDir;
  await mkdir(trajDir, { recursive: true });

  const body = (await request.json()) as {
    filename?: string;
    content?: string;
    events?: TrajectoryEvent[];
  };

  let content = body.content;
  if (body.events?.length) {
    content = `${body.events.map((event) => JSON.stringify(event)).join("\n")}\n`;
  }

  if (!content?.trim()) {
    throw error(400, "content or events is required");
  }

  const filename = sanitizeFilename(body.filename ?? `upload-${Date.now()}.jsonl`);
  const filePath = join(trajDir, filename);
  await writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf-8");

  const lineCount = content.split("\n").filter((line) => line.trim()).length;

  await appendAudit(paths, {
    action: "trajectories.upload",
    actor: auth.actor,
    resourceType: "trajectory",
    note: `${filename} (${lineCount} events)`,
  });

  return json({
    success: true,
    filename,
    path: filePath,
    eventCount: lineCount,
  });
};
