import { describe, expect, it } from "vitest";

import { IMPORT_BULK_LLM_THRESHOLD, shouldUseLlmForImport } from "./skill-import.js";

describe("shouldUseLlmForImport", () => {
  it("skips LLM when enrich is off", () => {
    expect(shouldUseLlmForImport(3, false)).toEqual({ useLlm: false });
  });

  it("allows LLM for small batches", () => {
    expect(shouldUseLlmForImport(IMPORT_BULK_LLM_THRESHOLD, true)).toEqual({ useLlm: true });
  });

  it("skips LLM for bulk imports", () => {
    const plan = shouldUseLlmForImport(34, true);
    expect(plan.useLlm).toBe(false);
    expect(plan.skippedReason).toContain("34 skills");
  });
});
