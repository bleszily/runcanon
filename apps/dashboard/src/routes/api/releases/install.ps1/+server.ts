import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RequestHandler } from "./$types";

import { publicServerUrl } from "$lib/server/public-url.js";

function scriptRoot(): string {
  return process.env.RUNCANON_SCRIPTS_DIR ?? join(process.cwd(), "scripts");
}

async function loadInstallScript(name: string, serverUrl: string): Promise<string> {
  const raw = await readFile(join(scriptRoot(), name), "utf-8");
  return raw.replaceAll("{{SERVER_URL}}", serverUrl);
}

export const GET: RequestHandler = async ({ url }) => {
  const serverUrl = publicServerUrl(url);
  const body = await loadInstallScript("install-runcanon.ps1", serverUrl);
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
