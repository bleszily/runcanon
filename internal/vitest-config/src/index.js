import { defineConfig, mergeConfig } from "vitest/config";

/** @type {import('vitest/config').UserConfig} */
const base = {
  test: {
    globals: false,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: ["node_modules/", "dist/", "**/*.d.ts", "**/*.config.*", "**/tests/**"],
    },
    passWithNoTests: true,
    pool: "forks",
    reporters: ["default"],
  },
};

export { defineConfig, mergeConfig };
export default base;
