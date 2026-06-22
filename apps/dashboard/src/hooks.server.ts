import type { Handle, HandleFetch } from "@sveltejs/kit";
import { error, redirect } from "@sveltejs/kit";

import { runWithRequestContext } from "@runcanon/platform";
import { authRequired, redirectToLogin, resolveAuth } from "$lib/server/auth.js";
import { ensurePlatformBootstrapped } from "$lib/server/platform.js";
import { startMaintenanceScheduler } from "$lib/server/maintenance-scheduler.js";

let maintenanceStarted = false;

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/api/health",
  "/api/releases/",
  "/downloads/",
];
const PASSWORD_RESET_PREFIXES = ["/account/reset-password", "/api/auth/change-password", "/api/auth/logout"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function isPasswordResetPath(pathname: string): boolean {
  return PASSWORD_RESET_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export const handle: Handle = async ({ event, resolve }) => {
  await ensurePlatformBootstrapped();
  if (!maintenanceStarted) {
    maintenanceStarted = true;
    startMaintenanceScheduler();
  }

  const sessionToken = event.cookies.get("runcanon_session");
  event.locals.auth = await resolveAuth(event.request, sessionToken);

  const { pathname } = event.url;

  if (!isPublicPath(pathname) && authRequired() && !event.locals.auth.authenticated) {
    if (pathname.startsWith("/api/")) {
      throw error(401, "Unauthorized");
    }
    redirectToLogin(pathname);
  }

  if (
    event.locals.auth.authenticated &&
    event.locals.auth.user?.mustResetPassword &&
    !isPasswordResetPath(pathname) &&
    !isPublicPath(pathname)
  ) {
    if (pathname.startsWith("/api/")) {
      throw error(403, "Password reset required");
    }
    throw redirect(303, "/account/reset-password");
  }

  const started = performance.now();
  const response = await runWithRequestContext(
    {
      userId: event.locals.auth.user?.id,
      isAdmin: event.locals.auth.role === "admin",
    },
    () => resolve(event)
  );
  const ms = Math.round(performance.now() - started);

  if (sessionToken && event.locals.auth.user) {
    response.headers.set("X-RunCanon-User", event.locals.auth.user.email);
  }

  const user = event.locals.auth.user?.email ?? (isPublicPath(pathname) ? "—" : "anonymous");
  console.log(`[runcanon] ${event.request.method} ${pathname} ${response.status} ${ms}ms user=${user}`);

  return response;
};

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  if (event.locals.auth.authenticated && event.cookies.get("runcanon_session")) {
    request.headers.set("cookie", event.request.headers.get("cookie") ?? "");
  }
  return fetch(request);
};
