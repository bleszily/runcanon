import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: {
    resolve: true,
    tsconfigPath: "./tsconfig.json",
  },
  clean: true,
  sourcemap: true,
  splitting: true,
  treeshake: true,
  outDir: "dist",
});
