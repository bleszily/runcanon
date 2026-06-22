import { randomUUID } from "node:crypto";

import { generateToken, hashToken } from "./crypto.js";
import { createApiToken } from "./sessions.js";
import { mutateStore, readStore } from "./store.js";
import type { CliAuthChallenge } from "./types.js";
import { toPublicUser } from "./users.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function purgeExpired(challenges: CliAuthChallenge[]): CliAuthChallenge[] {
  const now = Date.now();
  return challenges.filter((c) => new Date(c.expiresAt).getTime() > now);
}

function assertLocalRedirectUri(redirectUri: string): void {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    throw new Error("Invalid redirect URI");
  }
  if (url.protocol !== "http:") {
    throw new Error("redirect_uri must use http");
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("redirect_uri must target localhost");
  }
}

export async function createCliAuthChallenge(redirectUri: string): Promise<{ state: string }> {
  assertLocalRedirectUri(redirectUri);
  const state = generateToken();
  const challenge: CliAuthChallenge = {
    id: randomUUID(),
    state,
    redirectUri,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  };

  await mutateStore((store) => {
    store.cliAuthChallenges = purgeExpired(store.cliAuthChallenges ?? []);
    store.cliAuthChallenges.push(challenge);
  });

  return { state };
}

export async function getCliAuthChallenge(state: string): Promise<CliAuthChallenge | undefined> {
  const store = await readStore();
  const challenges = purgeExpired(store.cliAuthChallenges ?? []);
  return challenges.find((c) => c.state === state);
}

export async function approveCliAuthChallenge(
  state: string,
  userId: string
): Promise<{ redirectUri: string; code: string }> {
  const cliToken = await createApiToken(userId, "CLI browser login");
  const code = generateToken();

  const redirectUri = await mutateStore((store) => {
    store.cliAuthChallenges = purgeExpired(store.cliAuthChallenges ?? []);
    const idx = store.cliAuthChallenges.findIndex((c) => c.state === state);
    if (idx < 0) {
      throw new Error("Invalid or expired authorization request");
    }
    const challenge = store.cliAuthChallenges[idx];
    if (challenge.userId) {
      throw new Error("Authorization request already completed");
    }
    challenge.userId = userId;
    challenge.exchangeCodeHash = hashToken(code);
    challenge.cliToken = cliToken;
    return challenge.redirectUri;
  });

  return { redirectUri, code };
}

export async function exchangeCliAuthChallenge(
  state: string,
  code: string
): Promise<{ token: string; prefix: string; expiresAt: string; email: string }> {
  return mutateStore((store) => {
    store.cliAuthChallenges = purgeExpired(store.cliAuthChallenges ?? []);
    const idx = store.cliAuthChallenges.findIndex((c) => c.state === state);
    if (idx < 0) {
      throw new Error("Invalid or expired authorization request");
    }
    const challenge = store.cliAuthChallenges[idx];
    if (!challenge.userId || !challenge.exchangeCodeHash || !challenge.cliToken) {
      throw new Error("Authorization not completed");
    }
    if (challenge.exchangeCodeHash !== hashToken(code)) {
      throw new Error("Invalid authorization code");
    }

    const user = store.users.find((u) => u.id === challenge.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const { token, prefix, expiresAt } = challenge.cliToken;
    store.cliAuthChallenges.splice(idx, 1);

    return { token, prefix, expiresAt, email: toPublicUser(user).email };
  });
}
