import type { UserRole } from "@runcanon/platform";
import {
  bootstrapPlatform,
  getActiveWorkspaceForUser,
  resolveActiveLlmConfig,
  resolveAuthToken,
  resolveWorkspaceRoot,
} from "@runcanon/platform";

let bootstrapped = false;

export async function ensurePlatformBootstrapped(): Promise<void> {
  if (bootstrapped) return;
  await bootstrapPlatform();
  bootstrapped = true;
}

export async function resolveActiveProjectRoot(): Promise<string> {
  await ensurePlatformBootstrapped();
  return resolveWorkspaceRoot();
}

export async function resolveActiveWorkspace(userId?: string, isAdmin = false) {
  await ensurePlatformBootstrapped();
  return getActiveWorkspaceForUser(userId, isAdmin);
}

export { resolveActiveLlmConfig, resolveAuthToken };

export function mapRoleToLegacy(role: UserRole): "admin" | "approver" | "viewer" {
  if (role === "admin") return "admin";
  if (role === "engineer") return "approver";
  return "viewer";
}
