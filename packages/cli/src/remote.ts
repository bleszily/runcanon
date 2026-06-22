import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Agent, type Dispatcher } from "undici";

import { LEGACY_USER_CONFIG_DIR, USER_CONFIG_DIR } from "@runcanon/core";

/** Default client timeout for API calls (5 minutes). */
export const DEFAULT_API_TIMEOUT_MS = 300_000;
/** Mining and LLM-heavy endpoints can run much longer on the server. */
export const LONG_RUNNING_API_TIMEOUT_MS = 30 * 60 * 1000;

export interface CliCredentials {
  server: string;
  token: string;
  email?: string;
  prefix?: string;
  savedAt: string;
}

function credentialsPath(): string {
  const dir = process.env.RUNCANON_CONFIG_DIR ?? join(homedir(), USER_CONFIG_DIR);
  return join(dir, "credentials.json");
}

async function legacyCredentialsPath(): Promise<string | undefined> {
  const legacy = join(homedir(), LEGACY_USER_CONFIG_DIR, "credentials.json");
  try {
    await access(legacy);
    return legacy;
  } catch {
    return undefined;
  }
}

export async function loadCredentials(): Promise<CliCredentials | undefined> {
  try {
    const raw = await readFile(credentialsPath(), "utf-8");
    return JSON.parse(raw) as CliCredentials;
  } catch {
    const legacy = await legacyCredentialsPath();
    if (!legacy) return undefined;
    try {
      const raw = await readFile(legacy, "utf-8");
      return JSON.parse(raw) as CliCredentials;
    } catch {
      return undefined;
    }
  }
}

export async function saveCredentials(credentials: CliCredentials): Promise<void> {
  const path = credentialsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(credentials, null, 2), "utf-8");
  try {
    await import("node:fs/promises").then((fs) => fs.chmod(path, 0o600));
  } catch {
    // Windows may not support chmod.
  }
}

export async function clearCredentials(): Promise<void> {
  try {
    await import("node:fs/promises").then((fs) => fs.unlink(credentialsPath()));
  } catch {
    // ignore
  }
}

export async function loginToServer(input: {
  server: string;
  email: string;
  password: string;
}): Promise<CliCredentials> {
  const server = input.server.replace(/\/$/, "");
  const res = await fetch(`${server}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password, createCliToken: true }),
  });
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as {
    user: { email: string };
    cliToken?: { token: string; prefix: string; expiresAt: string };
  };
  if (!body.cliToken?.token) {
    throw new Error("Server did not return a CLI token");
  }
  const credentials: CliCredentials = {
    server,
    token: body.cliToken.token,
    email: body.user.email,
    prefix: body.cliToken.prefix,
    savedAt: new Date().toISOString(),
  };
  await saveCredentials(credentials);
  return credentials;
}

export async function fetchServerHealth(server: string): Promise<boolean> {
  try {
    const res = await fetch(`${server.replace(/\/$/, "")}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function whoami(): Promise<{ server: string; email?: string; prefix?: string } | undefined> {
  const creds = await loadCredentials();
  if (!creds) return undefined;
  const res = await fetch(`${creds.server}/api/auth/me`, {
    headers: { Authorization: `Bearer ${creds.token}` },
  });
  if (!res.ok) {
    throw new Error(`Session invalid (${res.status})`);
  }
  const body = (await res.json()) as { user: { email: string } };
  return { server: creds.server, email: body.user.email, prefix: creds.prefix };
}

export interface ApiRequestOptions {
  timeoutMs?: number;
}

function createDispatcher(timeoutMs: number): Dispatcher {
  return new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    connectTimeout: 60_000,
  });
}

export async function apiRequest(
  creds: CliCredentials,
  method: string,
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const url = `${creds.server.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const dispatcher = createDispatcher(timeoutMs);

  try {
    return await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${creds.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      dispatcher,
    });
  } finally {
    await dispatcher.close();
  }
}
