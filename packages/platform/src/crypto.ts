import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string, salt?: string): string {
  const saltBuf = salt ? Buffer.from(salt, "hex") : randomBytes(16);
  const hash = scryptSync(password, saltBuf, 64, SCRYPT_PARAMS);
  return `${saltBuf.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 64, SCRYPT_PARAMS);
  const expected = Buffer.from(hashHex, "hex");
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

function encryptionKey(): Buffer {
  const raw = process.env.RUNCANON_ENCRYPTION_KEY ?? process.env.SKILLSMITH_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RUNCANON_ENCRYPTION_KEY is required in production");
    }
    return scryptSync("runcanon-dev-key", "salt", 32);
  }
  const buf = Buffer.from(raw, raw.length === 64 ? "hex" : "utf-8");
  if (buf.length < 32) {
    return scryptSync(raw, "runcanon", 32);
  }
  return buf.subarray(0, 32);
}

/** Encrypt a secret for at-rest storage (AES-256-GCM). */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) return "";
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function hashToken(token: string): string {
  return scryptSync(token, "skillsmith-api-token", 32).toString("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateSessionToken(): string {
  return randomBytes(48).toString("base64url");
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}
