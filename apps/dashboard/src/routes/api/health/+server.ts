import { json } from "@sveltejs/kit";
import { RUNCANON_VERSION } from "@runcanon/core";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  return json({
    status: "ok",
    service: "runcanon-dashboard",
    version: RUNCANON_VERSION,
  });
};
