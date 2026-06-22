import { error } from "@sveltejs/kit";
import { readFile } from "node:fs/promises";
import type { RequestHandler } from "./$types";

import { resolveReleaseFile } from "$lib/server/releases.js";

const MIME: Record<string, string> = {
  ".json": "application/json",
  ".tar.gz": "application/gzip",
  ".zip": "application/zip",
  ".asc": "text/plain",
  ".sums": "text/plain",
};

function contentType(filename: string): string {
  if (filename.endsWith(".tar.gz")) return "application/gzip";
  if (filename.endsWith(".json")) return "application/json";
  const ext = filename.slice(filename.lastIndexOf("."));
  return MIME[ext] ?? "application/octet-stream";
}

/** Serve CLI release artifacts from RUNCANON_RELEASES_DIR. */
export const GET: RequestHandler = async ({ params }) => {
  const parts = params.path;
  const relative = Array.isArray(parts) ? parts.join("/") : parts;
  if (!relative || relative.includes("..")) {
    throw error(400, "Invalid path");
  }

  const filePath = resolveReleaseFile(relative);
  try {
    const body = await readFile(filePath);
    return new Response(body, {
      headers: {
        "Content-Type": contentType(relative),
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    throw error(404, "Release file not found");
  }
};
