import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireAuth } from "$lib/server/auth.js";
import { exportSkills } from "$lib/server/export.js";

export const POST: RequestHandler = async ({ request, locals }) => {
  const auth = requireAuth(locals.auth, "approver");
  const body = (await request.json()) as {
    harness?: string;
    projectPath?: string;
    prune?: boolean;
  };

  const harness = body.harness ?? "all";
  const result = await exportSkills(auth, harness, {
    projectPath: body.projectPath,
    prune: body.prune,
  });

  if (result.skillCount === 0) {
    return json({ success: true, message: "No entitled skills to export", ...result });
  }

  return json({ success: true, ...result });
};
