import base, { mergeConfig } from "@runcanon/vitest-config";

export default mergeConfig(base, {
  test: {
    name: "@runcanon/dashboard",
  },
});
