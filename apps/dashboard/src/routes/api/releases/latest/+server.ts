import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { detectPlatformId, readReleaseManifest } from "$lib/server/releases.js";
import { publicServerUrl } from "$lib/server/public-url.js";

/** Public release manifest for CLI installers (no auth). */
export const GET: RequestHandler = async ({ url }) => {
  const version = url.searchParams.get("version") ?? undefined;
  const manifest = await readReleaseManifest(version);

  if (!manifest) {
    return json(
      {
        error: "No CLI release published yet. Ask your admin to run scripts/build-cli-release.sh",
      },
      { status: 404 }
    );
  }

  const serverUrl = publicServerUrl(url);
  const platform = url.searchParams.get("platform") ?? detectPlatformId();
  const artifact =
    manifest.artifacts.find((a) => a.id === platform) ?? manifest.artifacts[0];

  return json({
    serverUrl,
    platform,
    recommended: artifact,
    manifest,
  });
};
