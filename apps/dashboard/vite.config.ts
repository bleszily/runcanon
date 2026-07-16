import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    // esbuild 0.28.1 fails to transform destructuring for the safari14
    // baseline in Vite's default target list (upstream regression, no
    // fixed esbuild release yet). Target modern evergreen browsers instead.
    target: "es2022",
  },
});
