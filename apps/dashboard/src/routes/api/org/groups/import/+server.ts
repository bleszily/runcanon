import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { findUserByEmail, importGroupMembershipsFromCsv } from "@runcanon/platform";
import { requireCurator } from "$lib/server/auth.js";

function parseCsv(text: string): Array<{ email: string; groupSlug: string }> {
  const rows: Array<{ email: string; groupSlug: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [email, groupSlug] = trimmed.split(",").map((c) => c.trim());
    if (email && groupSlug) rows.push({ email, groupSlug });
  }
  return rows;
}

/** CSV bulk import: POST body { csv: "email,groupSlug\\n..." } */
export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as { csv?: string };
  if (!body.csv?.trim()) throw error(400, "csv field is required");

  const result = await importGroupMembershipsFromCsv({
    rows: parseCsv(body.csv),
    actor: auth.actor,
    findUserByEmail,
  });

  return json({ success: true, ...result });
};

/** Minimal SCIM Users list stub for IdP integration testing. */
export const GET: RequestHandler = async ({ locals, url }) => {
  requireCurator(locals.auth);
  const format = url.searchParams.get("format");
  if (format !== "scim") {
    return json({
      message: "Use POST with CSV or GET ?format=scim for SCIM Users stub",
      endpoints: {
        csvImport: "POST /api/org/groups/import { csv }",
        scimUsers: "GET /api/org/groups/import?format=scim",
      },
    });
  }

  const { listUsers } = await import("@runcanon/platform");
  const users = await listUsers();
  return json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: users.length,
    Resources: users.map((u) => ({
      id: u.id,
      userName: u.email,
      active: true,
      name: { formatted: u.name ?? u.email },
      emails: [{ value: u.email, primary: true }],
    })),
  });
};
