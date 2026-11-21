import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Same-origin API calls in development; the backend listens on 3000.
    proxy: { "/api": "http://localhost:3000" },
    // Transforms the app and its imports as the server starts, so the first page (and Playwright's first journeys) is not a cold one.
    // Not under Vitest: there it compiles the whole app alongside the first, longest test files.
    warmup: process.env.VITEST
      ? undefined
      : { clientFiles: ["./src/main.tsx"] },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries in their own chunks: they change rarely, so browsers keep them cached
        // across releases, and no single chunk grows past Vite's size warning.
        // Feature pages are split further by lazy routes (src/routes.tsx).
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              priority: 3,
            },
            {
              name: "base-ui",
              test: /node_modules[\\/](@base-ui|@floating-ui)[\\/]/,
              priority: 2,
            },
            // The rich-text editor (SAD answers): only the SAD editor page loads it.
            {
              name: "editor",
              test: /node_modules[\\/](@tiptap|prosemirror-[a-z-]+|linkifyjs|orderedmap|rope-sequence|w3c-keyname)[\\/]/,
              priority: 2,
            },
            // The diagram canvas (SAD diagrams) with its d3 helpers and its own zustand copy: only SAD pages load it.
            {
              name: "diagrams",
              test: /node_modules[\\/](@xyflow|d3-[a-z]+|classcat)[\\/]/,
              priority: 2,
            },
            { name: "vendor", test: /node_modules[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    // Long user journeys (rule editor, diagram editor) take 1–2 s alone but several times that when every
    // file runs in parallel under coverage, and more on the slower Windows laptop.
    testTimeout: 15_000,
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        // Process entry point: mounts <App /> into index.html (covered by Playwright e2e)
        "src/main.tsx",
        "src/**/*.d.ts",
      ],
      thresholds: { lines: 99, branches: 99, functions: 99, statements: 99 },
      reporter: ["text-summary", "html", "lcov"],
    },
  },
});
