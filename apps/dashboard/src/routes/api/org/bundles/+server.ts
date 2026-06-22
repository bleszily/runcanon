import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { createSignedSkillBundle } from "@runcanon/platform";
import { DEFAULT_SYNC_HARNESSES } from "@runcanon/core";
import { requireCurator } from "$lib/server/auth.js";
import { collectEntitledSkills, loadOrgMarkdownMap } from "$lib/server/skill-export.js";

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as {
    harnesses?: string[];
    orgOnly?: boolean;
  };

  const entitled = await collectEntitledSkills(auth);
  const skillIds = entitled.skills.map((s) => s.id);
  if (skillIds.length === 0) {
    throw error(400, "No entitled skills to bundle");
  }

  const orgIds = entitled.orgSkills.map((s) => s.id);
  const markdownFiles = body.orgOnly
    ? await loadOrgMarkdownMap(orgIds)
    : await loadOrgMarkdownMap(orgIds).then(async (org) => {
        const { serializeSkill } = await import("@runcanon/spec");
        const files = { ...org };
        for (const skill of entitled.workspaceSkills) {
          if (!files[skill.id]) files[skill.id] = serializeSkill(skill);
        }
        return files;
      });

  const harnesses = body.harnesses?.length ? body.harnesses : [...DEFAULT_SYNC_HARNESSES];

  try {
    const bundle = await createSignedSkillBundle({
      skillIds: Object.keys(markdownFiles),
      harnesses,
      createdBy: auth.actor,
      markdownFiles,
    });
    return json({
      success: true,
      bundleId: bundle.bundleId,
      manifest: bundle.manifest,
      skillCount: bundle.manifest.skillIds.length,
    });
  } catch (err) {
    throw error(
      500,
      err instanceof Error ? err.message : "Bundle creation failed — set RUNCANON_ENCRYPTION_KEY"
    );
  }
};
