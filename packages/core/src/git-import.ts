import { z } from "zod";

import {
  githubAuthHeaders,
  importFromGitHubArchive,
  isGitHubRateLimitError,
  resolveGitHubToken,
} from "./github-archive-import.js";
import { isPrimarySkillMarkdownPath } from "./import-normalize.js";

export type GitProvider = "github" | "bitbucket";

const SLUG = /^[a-zA-Z0-9._-]+$/;

export const gitImportRequestSchema = z.object({
  provider: z.enum(["github", "bitbucket"]),
  owner: z.string().regex(SLUG).max(128),
  repo: z.string().regex(SLUG).max(128),
  branch: z.string().regex(/^[a-zA-Z0-9._/-]+$/).max(256).default("main"),
  pathPrefix: z.string().max(512).optional(),
  token: z.string().max(512).optional(),
});

export type GitImportRequest = z.infer<typeof gitImportRequestSchema>;

export interface GitSkillFile {
  path: string;
  content: string;
}

export interface GitImportResult {
  provider: GitProvider;
  owner: string;
  repo: string;
  branch: string;
  files: GitSkillFile[];
  source: "archive" | "api";
}

const MAX_SKILL_FILES = 50;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TREE_ENTRIES = 5000;

function isSkillCandidatePath(path: string): boolean {
  return isPrimarySkillMarkdownPath(path);
}

function bitbucketAuthHeaders(token?: string): Record<string, string> {
  if (!token) return { Accept: "application/json" };
  if (token.includes(":")) {
    const encoded = Buffer.from(token, "utf-8").toString("base64");
    return { Authorization: `Basic ${encoded}`, Accept: "application/json" };
  }
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  if (!url.startsWith("https://api.github.com/") && !url.startsWith("https://api.bitbucket.org/")) {
    throw new Error("Refusing request to non-allowed host");
  }

  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Git API failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  if (!url.startsWith("https://api.github.com/") && !url.startsWith("https://api.bitbucket.org/")) {
    throw new Error("Refusing request to non-allowed host");
  }

  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Git fetch failed (${res.status}) for ${url}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) {
    throw new Error(`File exceeds maximum size: ${url}`);
  }
  return new TextDecoder().decode(buf);
}

async function importFromGitHubApi(input: GitImportRequest, token?: string): Promise<GitSkillFile[]> {
  const headers = githubAuthHeaders(token);
  const branch = input.branch || "main";
  const treeUrl = `https://api.github.com/repos/${input.owner}/${input.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const tree = await fetchJson<{ tree: Array<{ path: string; type: string }> }>(treeUrl, headers);

  let candidates = tree.tree
    .filter((entry) => entry.type === "blob" && isSkillCandidatePath(entry.path))
    .map((entry) => entry.path);

  if (input.pathPrefix) {
    const prefix = input.pathPrefix.replace(/^\/|\/$/g, "");
    candidates = candidates.filter((p) => p.startsWith(prefix));
  }

  candidates = candidates.slice(0, MAX_SKILL_FILES);
  const files: GitSkillFile[] = [];

  for (const path of candidates) {
    const contentUrl = `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;
    const body = await fetchJson<{ content?: string; encoding?: string; size?: number }>(contentUrl, headers);
    if (body.size && body.size > MAX_FILE_BYTES) continue;
    if (!body.content) continue;
    const content =
      body.encoding === "base64"
        ? Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf-8")
        : body.content;
    if (content.length > MAX_FILE_BYTES) continue;
    files.push({ path, content });
  }

  return files;
}

async function importFromGitHub(input: GitImportRequest): Promise<{ files: GitSkillFile[]; source: "archive" | "api" }> {
  const token = resolveGitHubToken(input.token);
  const withToken: GitImportRequest = { ...input, token };

  const archiveErrors: string[] = [];

  try {
    const files = await importFromGitHubArchive(withToken);
    if (files.length > 0) {
      return { files, source: "archive" };
    }
    archiveErrors.push("Archive contained no SKILL.md files");
  } catch (err) {
    archiveErrors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    const files = await importFromGitHubApi(withToken, token);
    return { files, source: "api" };
  } catch (err) {
    const apiMessage = err instanceof Error ? err.message : String(err);

    if (isGitHubRateLimitError(apiMessage)) {
      throw new Error(
        token
          ? `GitHub API rate limit exceeded even with a token. ${archiveErrors.join(" ")}`
          : `GitHub API rate limit exceeded for this server. Public repos are fetched via archive first; add a GitHub personal access token (read-only repo scope) in the import dialog, or set RUNCANON_GITHUB_TOKEN on the server. Archive attempt: ${archiveErrors.join(" ")}`
      );
    }

    if (archiveErrors.length > 0) {
      throw new Error(`${apiMessage}. Archive attempt: ${archiveErrors.join(" ")}`);
    }
    throw err instanceof Error ? err : new Error(apiMessage);
  }
}

async function listBitbucketDir(input: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token?: string;
  collected: string[];
  depth: number;
}): Promise<void> {
  if (input.collected.length >= MAX_TREE_ENTRIES || input.depth > 12) return;

  const pathSegment = input.path ? `/${input.path.split("/").map(encodeURIComponent).join("/")}` : "";
  let url: string | undefined =
    `https://api.bitbucket.org/2.0/repositories/${input.owner}/${input.repo}/src/${encodeURIComponent(input.branch)}${pathSegment}?pagelen=100`;

  while (url) {
    const page: {
      values?: Array<{ path: string; type: string }>;
      next?: string;
    } = await fetchJson(url, bitbucketAuthHeaders(input.token));

    for (const entry of page.values ?? []) {
      if (entry.type === "commit_file" && isSkillCandidatePath(entry.path)) {
        input.collected.push(entry.path);
        if (input.collected.length >= MAX_SKILL_FILES) return;
      }
      if (entry.type === "commit_directory" && !entry.path.includes(".git")) {
        await listBitbucketDir({
          ...input,
          path: entry.path,
          depth: input.depth + 1,
        });
      }
    }

    url = page.next;
    if (input.collected.length >= MAX_SKILL_FILES) return;
  }
}

async function importFromBitbucket(input: GitImportRequest): Promise<GitSkillFile[]> {
  const branch = input.branch || "main";
  const paths: string[] = [];
  await listBitbucketDir({
    owner: input.owner,
    repo: input.repo,
    branch,
    path: input.pathPrefix?.replace(/^\/|\/$/g, "") ?? "",
    token: input.token,
    collected: paths,
    depth: 0,
  });

  const files: GitSkillFile[] = [];
  const headers = bitbucketAuthHeaders(input.token);

  for (const path of paths.slice(0, MAX_SKILL_FILES)) {
    const url = `https://api.bitbucket.org/2.0/repositories/${input.owner}/${input.repo}/src/${encodeURIComponent(branch)}/${path.split("/").map(encodeURIComponent).join("/")}`;
    try {
      const content = await fetchText(url, headers);
      files.push({ path, content });
    } catch {
      continue;
    }
  }

  return files;
}

/** Parse a git remote URL or owner/repo shorthand into a structured ref. */
export function parseGitRepoUrl(input: string, provider?: GitProvider): GitImportRequest {
  const trimmed = input.trim();

  const githubMatch = trimmed.match(
    /^https?:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)(?:\/tree\/([^/]+)(?:\/(.*))?)?\/?$/i
  );
  if (githubMatch) {
    return gitImportRequestSchema.parse({
      provider: "github",
      owner: githubMatch[1],
      repo: githubMatch[2].replace(/\.git$/, ""),
      branch: githubMatch[3] ?? "main",
      pathPrefix: githubMatch[4],
    });
  }

  const bitbucketMatch = trimmed.match(
    /^https?:\/\/bitbucket\.org\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)(?:\/src\/([^/]+)(?:\/(.*))?)?\/?$/i
  );
  if (bitbucketMatch) {
    return gitImportRequestSchema.parse({
      provider: "bitbucket",
      owner: bitbucketMatch[1],
      repo: bitbucketMatch[2].replace(/\.git$/, ""),
      branch: bitbucketMatch[3] ?? "main",
      pathPrefix: bitbucketMatch[4],
    });
  }

  if (provider && trimmed.includes("/")) {
    const [owner, repo] = trimmed.split("/");
    return gitImportRequestSchema.parse({ provider, owner, repo: repo.replace(/\.git$/, ""), branch: "main" });
  }

  throw new Error("Unrecognized git repository URL. Use GitHub or Bitbucket HTTPS URLs.");
}

/** Fetch SKILL.md files from a GitHub or Bitbucket repository. */
export async function fetchSkillsFromGitRepo(input: GitImportRequest): Promise<GitImportResult> {
  const parsed = gitImportRequestSchema.parse({
    ...input,
    token: resolveGitHubToken(input.token),
  });

  if (parsed.provider === "github") {
    const { files, source } = await importFromGitHub(parsed);
    return {
      provider: parsed.provider,
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch,
      files,
      source,
    };
  }

  const files = await importFromBitbucket(parsed);
  return {
    provider: parsed.provider,
    owner: parsed.owner,
    repo: parsed.repo,
    branch: parsed.branch,
    files,
    source: "api",
  };
}
