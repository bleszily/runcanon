import { describe, expect, it } from "vitest";

import { formatHarnessLabel, harnessToIconCategory } from "./harness-labels.js";

describe("formatHarnessLabel", () => {
  it("maps known harness ids to display names", () => {
    expect(formatHarnessLabel("claude")).toBe("Claude Code");
    expect(formatHarnessLabel("cursor")).toBe("Cursor");
    expect(formatHarnessLabel("copilot")).toBe("GitHub Copilot");
    expect(formatHarnessLabel("codex")).toBe("OpenAI Codex");
  });

  it("title-cases unknown harness ids", () => {
    expect(formatHarnessLabel("custom-agent")).toBe("Custom Agent");
  });
});

describe("harnessToIconCategory", () => {
  it("groups harness ids into icon categories", () => {
    expect(harnessToIconCategory("claude")).toBe("code");
    expect(harnessToIconCategory("codex")).toBe("cli");
    expect(harnessToIconCategory("browser")).toBe("browser");
  });
});
