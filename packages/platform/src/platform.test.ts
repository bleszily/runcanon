import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { encryptSecret, decryptSecret, hashPassword, verifyPassword } from "./crypto.js";
import { bootstrapPlatform } from "./bootstrap.js";
import { createUser, verifyUserCredentials } from "./users.js";
import { createSession, resolveSession } from "./sessions.js";
import { upsertProvider, getProviderSecret, listProviders } from "./providers.js";
import {
  assertSafeSlug,
  approveOrgPromotion,
  createOrgGroup,
  createSkillAssignment,
  deleteOrgSkill,
  getOrgSkillRecord,
  listOrgPromotions,
  publishOrgSkill,
  readOrgSkillMarkdown,
  resolveUserOrgSkillIds,
  submitOrgPromotion,
  addGroupMember,
} from "./org.js";

describe("platform crypto", () => {
  it("hashes and verifies passwords", () => {
    const hash = hashPassword("secret-password");
    expect(verifyPassword("secret-password", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("encrypts and decrypts secrets", () => {
    const encrypted = encryptSecret("sk-test-key");
    expect(decryptSecret(encrypted)).toBe("sk-test-key");
  });
});

describe("platform bootstrap", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = join(tmpdir(), `skillsmith-platform-${randomUUID()}`);
    process.env.RUNCANON_DATA_DIR = dataDir;
    process.env.RUNCANON_ADMIN_EMAIL = "admin@example.com";
    process.env.RUNCANON_ADMIN_PASSWORD = "test-password-123";
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    delete process.env.RUNCANON_DATA_DIR;
    delete process.env.RUNCANON_ADMIN_EMAIL;
    delete process.env.RUNCANON_ADMIN_PASSWORD;
    await rm(dataDir, { recursive: true, force: true });
  });

  it("creates admin user and provider catalog", async () => {
    await bootstrapPlatform();
    const user = await verifyUserCredentials("admin@example.com", "test-password-123");
    expect(user?.role).toBe("admin");
    expect(user?.mustResetPassword).toBe(true);
    const providers = await listProviders();
    expect(providers.length).toBeGreaterThanOrEqual(5);
  });

  it("stores encrypted provider secrets", async () => {
    await bootstrapPlatform();
    const admin = await verifyUserCredentials("admin@example.com", "test-password-123");
    expect(admin).toBeTruthy();
    await upsertProvider("anthropic", {
      enabled: true,
      model: "claude-sonnet-4-20250514",
      secret: "sk-ant-test",
      updatedBy: admin!.email,
    });
    expect(await getProviderSecret("anthropic")).toBe("sk-ant-test");
  });

  it("creates sessions", async () => {
    await bootstrapPlatform();
    const user = await createUser({
      email: "engineer@example.com",
      name: "Engineer",
      password: "eng-pass-123",
      role: "engineer",
    });
    const session = await createSession(user.id);
    const resolved = await resolveSession(session.token);
    expect(resolved?.email).toBe("engineer@example.com");
  });

  it("rejects path traversal in org skill ids", () => {
    expect(() => assertSafeSlug("../etc/passwd")).toThrow();
    expect(assertSafeSlug("cloud-security")).toBe("cloud-security");
  });

  it("resolves org skill entitlements via group assignment", async () => {
    await bootstrapPlatform();
    const admin = await verifyUserCredentials("admin@example.com", "test-password-123");
    const engineer = await createUser({
      email: "eng2@example.com",
      name: "Eng2",
      password: "eng-pass-456",
      role: "engineer",
    });

    await publishOrgSkill({
      skillId: "audit-deps",
      name: "Audit Dependencies",
      markdown: "---\nname: Audit\n---\n# Audit",
      publishedBy: admin!.email,
    });

    const group = await createOrgGroup({ name: "AppSec", actor: admin!.email });
    await addGroupMember({ groupId: group.id, userId: engineer.id, actor: admin!.email });
    await createSkillAssignment({
      skillId: "audit-deps",
      targetType: "group",
      targetId: group.id,
      mandatory: true,
      actor: admin!.email,
    });

    const entitled = await resolveUserOrgSkillIds(engineer.id);
    expect(entitled).toContain("audit-deps");
  });

  it("queues and approves org promotion", async () => {
    await bootstrapPlatform();
    const admin = await verifyUserCredentials("admin@example.com", "test-password-123");

    await submitOrgPromotion({
      skillId: "new-skill",
      name: "New Skill",
      markdown: "---\nname: New\n---\n# New",
      source: "manual",
      submittedBy: admin!.email,
    });

    const pending = await listOrgPromotions("pending");
    expect(pending).toHaveLength(1);

    const record = await approveOrgPromotion({
      promotionId: pending[0]!.id,
      reviewer: admin!.email,
    });
    expect(record.id).toBe("new-skill");
  });

  it("permanently deletes an org skill and its markdown", async () => {
    await bootstrapPlatform();
    const admin = await verifyUserCredentials("admin@example.com", "test-password-123");

    await publishOrgSkill({
      skillId: "temp-skill",
      name: "Temp Skill",
      markdown: "---\nname: Temp\n---\n# Temp",
      publishedBy: admin!.email,
    });

    expect(await getOrgSkillRecord("temp-skill")).toBeDefined();
    expect(await readOrgSkillMarkdown("temp-skill")).toContain("Temp");

    await deleteOrgSkill("temp-skill", admin!.email);

    expect(await getOrgSkillRecord("temp-skill")).toBeUndefined();
    expect(await readOrgSkillMarkdown("temp-skill")).toBeUndefined();
  });
});
