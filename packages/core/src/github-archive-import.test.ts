import { describe, expect, it } from "vitest";

import {
  githubAuthHeaders,
  isGitHubRateLimitError,
  resolveGitHubToken,
} from "./github-archive-import.js";

describe("githubAuthHeaders", () => {
  it("adds classic PAT as token scheme", () => {
    expect(githubAuthHeaders("ghp_abc123").Authorization).toBe("token ghp_abc123");
  });

  it("preserves Bearer prefix", () => {
    expect(githubAuthHeaders("Bearer xyz").Authorization).toBe("Bearer xyz");
  });

  it("omits auth when no token", () => {
    expect(githubAuthHeaders(undefined).Authorization).toBeUndefined();
  });
});

describe("isGitHubRateLimitError", () => {
  it("detects rate limit messages", () => {
    expect(isGitHubRateLimitError('Git API failed (403): {"message":"API rate limit exceeded"}')).toBe(true);
  });
});

describe("resolveGitHubToken", () => {
  it("prefers explicit token", () => {
    expect(resolveGitHubToken(" user-token ")).toBe("user-token");
  });
});
