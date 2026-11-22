// ATGV Custom Stack scans the repository root before nested application folders.
// Reuse the real frontend configuration; do not change NestJS or production API settings.
// ATGV's temporary mock overlay disables the frontend's /api proxy during mock preview.
import { defineConfig, mergeConfig } from "vite";
import frontendConfig from "./ReactTS_Frontend/vite.config.ts";

export default defineConfig(async (environment) => {
  const source =
    typeof frontendConfig === "function"
      ? await frontendConfig(environment)
      : frontendConfig;
  return mergeConfig(source, { root: "ReactTS_Frontend" });
});
