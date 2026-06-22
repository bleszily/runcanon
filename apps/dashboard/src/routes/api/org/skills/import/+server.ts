import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireCurator } from "$lib/server/auth.js";
import { importSkillsFromGit } from "$lib/server/skill-import.js";

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as {
    repoUrl?: string;
    provider?: "github" | "bitbucket";
    owner?: string;
    repo?: string;
    branch?: string;
    pathPrefix?: string;
    token?: string;
    destination?: "workspace" | "org" | "proposal";
    enrich?: boolean;
    autoPublishOrg?: boolean;
  };

  try {
    console.log(
      `[runcanon:import] start user=${auth.actor} repo=${body.repoUrl ?? `${body.owner}/${body.repo}`} enrich=${body.enrich !== false}`
    );
    const result = await importSkillsFromGit({
      auth,
      repoUrl: body.repoUrl,
      provider: body.provider,
      owner: body.owner,
      repo: body.repo,
      branch: body.branch,
      pathPrefix: body.pathPrefix,
      token: body.token,
      destination: body.destination ?? "workspace",
      enrich: body.enrich,
      autoPublishOrg: body.autoPublishOrg,
    });

    if (result.imported.length === 0 && result.skipped.length > 0) {
      const sample = result.skipped.slice(0, 3).map((s) => `${s.path}: ${s.reason}`).join("; ");
      const suffix = result.skipped.length > 3 ? ` (+${result.skipped.length - 3} more)` : "";
      throw error(
        400,
        `No skills imported (${result.skipped.length} file(s) skipped). ${sample}${suffix}`
      );
    }

    return json({ success: true, ...result });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) throw err;
    throw error(400, err instanceof Error ? err.message : "Import failed");
  }
};
