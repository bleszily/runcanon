import { basename, relative } from "node:path";

/** Human-readable label for a source file (relative to project when possible). */
export function labelSourcePath(filePath: string, projectRoot?: string): string {
  if (projectRoot) {
    try {
      const rel = relative(projectRoot, filePath);
      if (rel && !rel.startsWith("..") && !rel.startsWith("/")) {
        return rel;
      }
    } catch {
      // fall through
    }
  }
  return basename(filePath);
}

/** True when a token looks like a filesystem path fragment, not a skill keyword. */
export function isPathLikeFragment(token: string): boolean {
  if (!token) return true;
  if (token.includes("/") || token.includes("\\")) return true;
  if (/^[a-z]:$/i.test(token)) return true;
  if (/^users$/i.test(token) || /^documents$/i.test(token) || /^home$/i.test(token)) return true;
  if (/\.(md|txt|jsonl|ts|tsx|js|jsx|yaml|yml|json)$/i.test(token)) return true;
  if (/^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(token)) return true;
  return false;
}

/** Normalize action/signature values that may contain absolute paths. */
export function sanitizeActionLabel(action: string, projectRoot?: string): string {
  if (action.includes("/") || action.includes("\\")) {
    return labelSourcePath(action, projectRoot);
  }
  return action;
}

/** Stable slug for a skill title or intent (e.g. "Existing skill: cloud-security" → "cloud-security"). */
export function canonicalSkillKey(raw: string): string {
  let value = raw.trim();
  for (let i = 0; i < 6; i++) {
    const next = value
      .replace(/^existing[-\s]*skill:?[-\s]*/gi, "")
      .replace(/^#+\s*/, "")
      .trim();
    if (next === value) break;
    value = next;
  }
  value = value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  const stopWords = new Set(["for", "the", "a", "an", "and", "or", "to", "in", "on", "of", "with"]);
  const parts = value.split("-").filter(Boolean).filter((part) => !stopWords.has(part));
  const deduped: string[] = [];
  for (const part of parts) {
    if (deduped.at(-1) !== part) deduped.push(part);
  }
  return deduped.join("-") || "untitled-skill";
}

/** Strip embedded paths and noise from mined skill names for display. */
export function formatSkillDisplayName(raw: string): string {
  let name = raw.trim();
  for (let i = 0; i < 6; i++) {
    const next = name.replace(/^existing[-\s]*skill:?[-\s]*/gi, "").trim();
    if (next === name) break;
    name = next;
  }
  name = name.replace(/\/Users\/[^\s]+/gi, "");
  name = name.replace(/\/home\/[^\s]+/gi, "");
  name = name.replace(/[a-z]:\\[^\s]+/gi, "");
  name = name.replace(/-users-[a-z0-9._-]+-documents-[^\s-]*/gi, "");
  name = name.replace(/:-+/g, ": ");
  name = name.replace(/-+/g, " ").replace(/\s+/g, " ").trim();

  const words: string[] = [];
  for (const word of name.split(/\s+/).filter(Boolean)) {
    if (words.at(-1)?.toLowerCase() !== word.toLowerCase()) words.push(word);
  }
  name = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  if (name.length > 72) {
    name = `${name.slice(0, 69)}…`;
  }
  return name || "Untitled skill";
}

const SKILL_DEDUP_ANCHORS = new Set([
  "audit",
  "cve",
  "cves",
  "triage",
  "security",
  "vulnerability",
  "vulnerabilities",
  "depend",
  "dependencies",
  "dependency",
]);

function skillKeyTokens(key: string): Set<string> {
  return new Set(
    canonicalSkillKey(key)
      .split("-")
      .filter(Boolean)
  );
}

/**
 * True when a proposed skill key likely duplicates an active skill (shared domain tokens).
 * Catches near-duplicates with different slugs, e.g. audit-core-package-dependencies vs audit-dependencies-known-cves.
 */
export function isNearDuplicateSkillKey(proposedKey: string, activeKey: string): boolean {
  const proposed = canonicalSkillKey(proposedKey);
  const active = canonicalSkillKey(activeKey);
  if (proposed === active) return true;

  const proposedTokens = skillKeyTokens(proposed);
  const activeTokens = skillKeyTokens(active);
  let shared = 0;
  let hasAnchor = false;
  for (const token of proposedTokens) {
    if (activeTokens.has(token)) {
      shared++;
      if (SKILL_DEDUP_ANCHORS.has(token)) hasAnchor = true;
    }
  }
  return shared >= 2 && hasAnchor;
}

/** True when proposedKey is an exact or near-duplicate of any active key. */
export function matchesAnyActiveSkillKey(proposedKey: string, activeKeys: Iterable<string>): boolean {
  for (const activeKey of activeKeys) {
    if (isNearDuplicateSkillKey(proposedKey, activeKey)) return true;
  }
  return false;
}

/** True when a skill id/name is a noisy catalog re-import artifact. */
export function isNoiseSkillIdentity(value: string): boolean {
  const raw = value.toLowerCase();
  if (/^existing-skill[-:]/i.test(raw)) return true;
  const key = canonicalSkillKey(value);
  if (raw.includes("existing-skill") && raw.split("existing").length > 2) return true;
  if (/existing-skill.*existing-skill/.test(raw)) return true;
  if (/-thr$|-clou$|-secu$|-revi$/.test(key)) return true;
  if (key.split("-").length > 6) return true;
  return false;
}
