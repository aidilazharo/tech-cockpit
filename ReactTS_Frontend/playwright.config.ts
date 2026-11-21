import { defineConfig, devices } from "@playwright/test";

// Browser per machine:
//   Windows company laptop -> installed Microsoft Edge (Playwright must not download browsers there)
//   Other platforms (CI)   -> Playwright's bundled Chromium
// PLAYWRIGHT_CHANNEL overrides both (e.g. "chrome" to use an installed Google Chrome).
const channel =
  process.env.PLAYWRIGHT_CHANNEL ??
  (process.platform === "win32" ? "msedge" : undefined);

const PORT = 5174;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Local runs: the long SAD journeys take 10–20 s alone on the Windows laptop and pass 30 s with 4 browsers at once.
  workers: CI ? undefined : 2,
  timeout: CI ? 30_000 : 60_000,
  expect: { timeout: CI ? 5_000 : 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        channel,
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        channel,
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
