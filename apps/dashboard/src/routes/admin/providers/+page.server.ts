import { listProviders, PROVIDER_CATALOG, resolveActiveLlmConfig } from "@runcanon/platform";
import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.auth.role !== "admin") {
    throw redirect(303, "/guide");
  }
  const [providers, activeLlm] = await Promise.all([listProviders(), resolveActiveLlmConfig()]);
  return {
    providers,
    catalog: PROVIDER_CATALOG,
    activeLlm: activeLlm ? { provider: activeLlm.provider, model: activeLlm.model } : null,
  };
};
