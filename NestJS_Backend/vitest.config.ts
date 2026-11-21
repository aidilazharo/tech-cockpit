import { defineConfig } from 'vitest/config';

// Three projects:
//   unit         src/**/*.spec.ts          no database
//   integration  test/integration/**      real PostgreSQL, <DB_SCHEMA>_test
//   e2e          test/e2e/**              full Nest app over HTTP, <DB_SCHEMA>_test
// Coverage is measured across all three and must stay at or above 95%.
export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json. Requires Vite 8.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    projects: [
      {
        extends: true,
        // The PDF render tests take 0.3 s alone but passed Vitest's 5 s default under coverage with every file in parallel on the Windows laptop.
        test: { name: 'unit', include: ['src/**/*.spec.ts'], testTimeout: 15_000 },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.int-spec.ts'],
          globalSetup: ['test/setup/global-db.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          globalSetup: ['test/setup/global-db.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        // Generated migration files: verified by applying them in integration tests
        'src/database/migrations/**',
        // Process entry points (thin wiring, exercised by the e2e app bootstrap)
        'src/main.ts',
        'src/database/cli/**',
        'src/scripts/**',
      ],
      thresholds: { lines: 99, branches: 99, functions: 99, statements: 99 },
      reporter: ['text-summary', 'html', 'lcov'],
    },
  },
});
