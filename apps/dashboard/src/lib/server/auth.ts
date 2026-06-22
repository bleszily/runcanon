import { error, redirect } from "@sveltejs/kit";

import type { PublicUser, UserRole } from "@runcanon/platform";
import { resolveAuthToken } from "@runcanon/platform";

export type LegacyRole = "viewer" | "approver" | "curator" | "admin";

export interface AuthContext {
  authenticated: boolean;
  role: LegacyRole;
  actor: string;
  user?: PublicUser;
  platformRole?: UserRole;
}

const ROLE_RANK: Record<LegacyRole, number> = { viewer: 1, approver: 2, curator: 3, admin: 4 };

function mapRole(role: UserRole): LegacyRole {
  if (role === "admin") return "admin";
  if (role === "curator") return "curator";
  if (role === "engineer") return "approver";
  return "viewer";
}

export function authRequired(): boolean {
  if (process.env.RUNCANON_REQUIRE_AUTH === "false") return false;
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.RUNCANON_ADMIN_EMAIL) return true;
  return process.env.RUNCANON_REQUIRE_AUTH === "true";
}

/** Resolve auth from session cookie, bearer token, or legacy API key. */
export async function resolveAuth(request: Request, sessionToken?: string): Promise<AuthContext> {
  if (sessionToken) {
    const user = await resolveAuthToken(sessionToken);
    if (user) {
      return {
        authenticated: true,
        role: mapRole(user.role),
        actor: user.email,
        user,
        platformRole: user.role,
      };
    }
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const user = await resolveAuthToken(bearer);
    if (user) {
      return {
        authenticated: true,
        role: mapRole(user.role),
        actor: user.email,
        user,
        platformRole: user.role,
      };
    }
  }

  const legacyKey = process.env.RUNCANON_API_KEY;
  if (legacyKey) {
    const headerKey =
      request.headers.get("x-runcanon-api-key") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (headerKey && headerKey === legacyKey) {
      const roleHeader = request.headers.get("x-runcanon-role") as LegacyRole | null;
      const role = roleHeader && roleHeader in ROLE_RANK ? roleHeader : "approver";
      return { authenticated: true, role, actor: request.headers.get("x-runcanon-actor") ?? "api-key" };
    }
  }

  if (!authRequired()) {
    return { authenticated: true, role: "admin", actor: "local-dev", platformRole: "admin" };
  }

  return { authenticated: false, role: "viewer", actor: "anonymous" };
}

export function requireAuth(auth: AuthContext, minRole: LegacyRole = "viewer"): AuthContext {
  if (!auth.authenticated) {
    throw error(401, "Unauthorized - sign in or provide a valid API token");
  }
  if (ROLE_RANK[auth.role] < ROLE_RANK[minRole]) {
    throw error(403, `Forbidden - requires ${minRole} role`);
  }
  return auth;
}

export function requireAdmin(auth: AuthContext): AuthContext {
  return requireAuth(auth, "admin");
}

export function requireCurator(auth: AuthContext): AuthContext {
  return requireAuth(auth, "curator");
}

export function isOrgAdmin(auth: AuthContext): boolean {
  return auth.role === "admin" || auth.role === "curator";
}

export function redirectToLogin(pathname: string): never {
  throw redirect(303, `/login?redirect=${encodeURIComponent(pathname)}`);
}
