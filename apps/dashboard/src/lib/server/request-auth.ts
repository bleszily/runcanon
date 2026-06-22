import { getRequestEvent } from "$app/server";

import { getRequestContext } from "@runcanon/platform";

import type { AuthContext } from "./auth.js";

/** Read auth from the current SvelteKit request (preferred over AsyncLocalStorage). */
export function readRequestAuth(): AuthContext | undefined {
  try {
    const { locals } = getRequestEvent();
    return locals.auth;
  } catch {
    return undefined;
  }
}

/** Resolve the signed-in user id for workspace scoping. */
export function resolveRequestUserId(): { userId?: string; isAdmin: boolean } {
  const auth = readRequestAuth();
  if (auth?.user?.id) {
    return { userId: auth.user.id, isAdmin: auth.role === "admin" };
  }

  const ctx = getRequestContext();
  return { userId: ctx.userId, isAdmin: ctx.isAdmin ?? false };
}
