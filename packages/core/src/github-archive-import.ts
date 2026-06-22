import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import * as tar from "tar";

import type { GitImportRequest, GitSkillFile } from "./git-import.js";
import { isPrimarySkillMarkdownPath } from "./import-normalize.js";

const MAX_SKILL_FILES = 50;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

export function resolveGitHubToken(token?: string): string | undefined {
  const trimmed = token?.trim();
  if (trimmed) return trimmed;
  return process.env.RUNCANON_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || undefined;
}

export function githubAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RunCanon-Git-Import/1.0",
  };
  if (!token) return headers;

  if (token.startsWith("Bearer ") || token.startsWith("token ")) {
    headers.Authorization = token;
    return headers;
  }
  if (token.startsWith("ghp_") || token.startsWith("github_pat_")) {
    headers.Authorization = `token ${token}`;
    return headers;
  }
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function isGitHubRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("rate limit") || lower.includes("api rate limit exceeded");
}

function stripArchiveRootPrefix(entryPath: string): string {
  const normalized = entryPath.replace(/\\/g, "/");
  const slash = normalized.indexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function archiveUrl(input: GitImportRequest): string {
  const branch = encodeURIComponent(input.branch || "main");
  return `https://codeload.github.com/${input.owner}/${input.repo}/tar.gz/${branch}`;
}

async function readEntryBody(entry: tar.ReadEntry, maxBytes: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of entry) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) return null;
    chunks.push(buf);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

/** Download a public/private GitHub repo tarball and extract SKILL.md files (no REST API quota). */
export async function importFromGitHubArchive(input: GitImportRequest): Promise<GitSkillFile[]> {
  const token = resolveGitHubToken(input.token);
  const url = archiveUrl(input);
  const prefix = input.pathPrefix?.replace(/^\/|\/$/g, "");

  const res = await fetch(url, {
    headers: githubAuthHeaders(token),
    redirect: "follow",
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 404) {
      throw new Error(
        `GitHub archive not found (${res.status}). Check owner, repo, and branch "${input.branch || "main"}".`
      );
    }
    throw new Error(`GitHub archive download failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error(`Repository archive exceeds maximum size (${MAX_ARCHIVE_BYTES} bytes)`);
  }

  const files: GitSkillFile[] = [];
  let limitReached = false;

  await new Promise<void>((resolve, reject) => {
    const parser = tar.t({
      onReadEntry: (entry) => {
        void (async () => {
          try {
            if (limitReached) {
              entry.resume();
              return;
            }

            const normalizedPath = stripArchiveRootPrefix(entry.path);
            if (prefix && !normalizedPath.startsWith(prefix)) {
              entry.resume();
              return;
            }
            if (!isPrimarySkillMarkdownPath(normalizedPath)) {
              entry.resume();
              return;
            }

            const content = await readEntryBody(entry, MAX_FILE_BYTES);
            if (!content) return;

            files.push({ path: normalizedPath, content });
            if (files.length >= MAX_SKILL_FILES) {
              limitReached = true;
            }
          } catch (err) {
            reject(err);
          }
        })();
      },
    });

    parser.on("error", reject);
    parser.on("end", resolve);

    Readable.from(buf).pipe(createGunzip()).pipe(parser);
  });

  return files;
}
