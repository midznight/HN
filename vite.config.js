import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { outDir: "dist", assetsDir: "assets", sourcemap: false, emptyOutDir: true },
  server: { host: "0.0.0.0" }
});
