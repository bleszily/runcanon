import { readStore, writeStore } from "./store.js";
import { createUser, findUserByEmail } from "./users.js";
import { ensureUserWorkspace } from "./workspaces.js";
import { ensureOrgStore } from "./org.js";
import { PROVIDER_CATALOG, type LlmProviderId } from "./types.js";
import type { ProviderConfig } from "./types.js";

/** Ensure platform store is initialized with admin user and default providers. */
export async function bootstrapPlatform(): Promise<void> {
  const store = await readStore();

  if (store.users.length === 0) {
    const email = process.env.RUNCANON_ADMIN_EMAIL ?? "admin@runcanon.ai";
    const password = process.env.RUNCANON_ADMIN_PASSWORD ?? "KeyBoard@2021";
    const name = process.env.RUNCANON_ADMIN_NAME ?? "Platform Admin";

    await createUser({
      email,
      name,
      password,
      role: "admin",
      mustResetPassword: true,
    });
  }

  const refreshed = await readStore();

  if (refreshed.providers.length === 0) {
    const now = new Date(0).toISOString();
    refreshed.providers = (Object.keys(PROVIDER_CATALOG) as LlmProviderId[]).map(
      (id): ProviderConfig => ({
        id,
        label: PROVIDER_CATALOG[id].label,
        enabled: false,
        model: PROVIDER_CATALOG[id].defaultModel,
        baseUrl: PROVIDER_CATALOG[id].defaultBaseUrl,
        encryptedSecret: "",
        updatedAt: now,
        updatedBy: "system",
      })
    );
    await writeStore(refreshed);
  }

  const afterUsers = await readStore();
  const admin =
    afterUsers.users.find((u) => u.role === "admin") ??
    afterUsers.users[0] ??
    (await findUserByEmail(process.env.RUNCANON_ADMIN_EMAIL ?? ""));

  if (admin) {
    await ensureUserWorkspace(admin.id, admin.name, admin.email);
  }

  await ensureOrgStore();
}
