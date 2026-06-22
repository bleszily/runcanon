import { randomUUID } from "node:crypto";

import { generateSessionToken, generateToken, hashToken } from "./crypto.js";
import { mutateStore, readStore } from "./store.js";
import type { ApiToken, PublicUser, Session } from "./types.js";
import { findUserById, toPublicUser } from "./users.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const API_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function purgeExpired(store: { sessions: Session[]; apiTokens: ApiToken[] }): void {
  const now = Date.now();
  store.sessions = store.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
  store.apiTokens = store.apiTokens.filter((t) => !t.expiresAt || new Date(t.expiresAt).getTime() > now);
}

export async function createSession(userId: string, userAgent?: string): Promise<{ token: string; expiresAt: string }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const session: Session = {
    id: randomUUID(),
    userId,
    token,
    expiresAt,
    createdAt: new Date().toISOString(),
    userAgent,
  };

  await mutateStore((store) => {
    purgeExpired(store);
    store.sessions.push(session);
  });

  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  await mutateStore((store) => {
    store.sessions = store.sessions.filter((s) => s.token !== token);
  });
}

export async function resolveSession(token: string): Promise<PublicUser | undefined> {
  const store = await readStore();
  purgeExpired(store);
  const session = store.sessions.find((s) => s.token === token);
  if (!session) return undefined;
  const user = store.users.find((u) => u.id === session.userId);
  return user ? toPublicUser(user) : undefined;
}

export async function createApiToken(
  userId: string,
  name: string
): Promise<{ token: string; prefix: string; expiresAt: string }> {
  const token = `ss_${generateToken()}`;
  const prefix = token.slice(0, 8);
  const expiresAt = new Date(Date.now() + API_TOKEN_TTL_MS).toISOString();
  const record: ApiToken = {
    id: randomUUID(),
    userId,
    name,
    tokenHash: hashToken(token),
    prefix,
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  await mutateStore((store) => {
    purgeExpired(store);
    store.apiTokens.push(record);
  });

  return { token, prefix, expiresAt };
}

export async function resolveApiToken(token: string): Promise<PublicUser | undefined> {
  if (!token.startsWith("ss_")) return undefined;
  const store = await readStore();
  purgeExpired(store);
  const hashed = hashToken(token);
  const record = store.apiTokens.find((t) => t.tokenHash === hashed);
  if (!record) return undefined;

  const user = store.users.find((u) => u.id === record.userId);
  if (!user) return undefined;

  record.lastUsedAt = new Date().toISOString();
  await mutateStore((s) => {
    const idx = s.apiTokens.findIndex((t) => t.id === record.id);
    if (idx >= 0 && record.lastUsedAt) {
      s.apiTokens[idx] = { ...s.apiTokens[idx], lastUsedAt: record.lastUsedAt };
    }
  });

  return toPublicUser(user);
}

export async function listApiTokens(userId: string): Promise<Array<Omit<ApiToken, "tokenHash">>> {
  const store = await readStore();
  return store.apiTokens
    .filter((t) => t.userId === userId)
    .map(({ tokenHash: _tokenHash, ...rest }) => rest);
}

export async function revokeApiToken(tokenId: string, userId: string): Promise<void> {
  await mutateStore((store) => {
    store.apiTokens = store.apiTokens.filter((t) => !(t.id === tokenId && t.userId === userId));
  });
}

export async function resolveAuthToken(token: string): Promise<PublicUser | undefined> {
  if (token.startsWith("ss_")) {
    return resolveApiToken(token);
  }
  return resolveSession(token);
}

export { findUserById };
