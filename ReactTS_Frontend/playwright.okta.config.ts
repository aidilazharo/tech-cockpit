import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Signs in through the REAL Okta dev tenant (no mocks): backend + frontend + Okta.
// Needs:
//   NestJS_Backend/.env      SAML_IDP_METADATA_URL set, APP_BASE_URL=http://localhost:5173
//   .env.e2e.local           test users' emails and passwords (git-ignored; see .env.e2e.example)
// Tests skip themselves when their user's credentials are missing.
if (existsSync('.env.e2e.local')) {
  process.loadEnvFile('.env.e2e.local')
}

const channel = process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined)

export default defineConfig({
  testDir: './e2e-okta',
  // One Okta org, real sessions: run one at a time.
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: 'test-results/okta',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/okta' }]],
  use: {
    // Must equal the backend's APP_BASE_URL: Okta returns users there after sign-in.
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'okta', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: [
    {
      command: 'npm --prefix ../NestJS_Backend run start',
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
