import { randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "./crypto.js";
import { mutateStore, readStore } from "./store.js";
import type { AdminUserView, PublicUser, User, UserRole } from "./types.js";

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustResetPassword: user.mustResetPassword ?? false,
  };
}

function toAdminUserView(user: User): AdminUserView {
  return {
    ...toPublicUser(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const store = await readStore();
  return store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export async function findUserById(id: string): Promise<User | undefined> {
  const store = await readStore();
  return store.users.find((u) => u.id === id);
}

export async function listUsers(): Promise<PublicUser[]> {
  const store = await readStore();
  return store.users.map(toPublicUser);
}

export async function listAdminUsers(): Promise<AdminUserView[]> {
  const store = await readStore();
  return store.users.map(toAdminUserView);
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  mustResetPassword?: boolean;
}): Promise<PublicUser> {
  const now = new Date().toISOString();
  const user: User = {
    id: randomUUID(),
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    role: input.role,
    passwordHash: hashPassword(input.password),
    mustResetPassword: input.mustResetPassword ?? false,
    createdAt: now,
    updatedAt: now,
  };

  return mutateStore((store) => {
    if (store.users.some((u) => u.email === user.email)) {
      throw new Error("User with this email already exists");
    }
    store.users.push(user);
    return toPublicUser(user);
  });
}

export async function verifyUserCredentials(email: string, password: string): Promise<PublicUser | undefined> {
  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return undefined;
  }
  return toPublicUser(user);
}

export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user) return false;
  return verifyPassword(password, user.passwordHash);
}

export async function updateUserRole(userId: string, role: UserRole): Promise<PublicUser> {
  return mutateStore((store) => {
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new Error("User not found");
    user.role = role;
    user.updatedAt = new Date().toISOString();
    return toPublicUser(user);
  });
}

export async function updateUserName(userId: string, name: string): Promise<PublicUser> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");

  return mutateStore((store) => {
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new Error("User not found");
    user.name = trimmed;
    user.updatedAt = new Date().toISOString();
    return toPublicUser(user);
  });
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  await mutateStore((store) => {
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new Error("User not found");
    user.passwordHash = hashPassword(newPassword);
    user.mustResetPassword = false;
    user.updatedAt = new Date().toISOString();
  });
}

export async function requirePasswordReset(userId: string): Promise<void> {
  await mutateStore((store) => {
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new Error("User not found");
    user.mustResetPassword = true;
    user.updatedAt = new Date().toISOString();
  });
}

export async function deleteUser(userId: string, actorUserId: string): Promise<void> {
  if (userId === actorUserId) {
    throw new Error("Cannot delete your own account");
  }

  await mutateStore((store) => {
    const idx = store.users.findIndex((u) => u.id === userId);
    if (idx < 0) throw new Error("User not found");
    store.users.splice(idx, 1);
    store.sessions = store.sessions.filter((s) => s.userId !== userId);
    store.apiTokens = store.apiTokens.filter((t) => t.userId !== userId);
    store.userPreferences = store.userPreferences.filter((p) => p.userId !== userId);
  });
}
