import { existsSync } from 'node:fs';
import { type Env, parseEnv, testSchemaFor } from '../../src/config/env.js';

/**
 * Environment for integration/e2e tests: the developer's .env with DB_SCHEMA
 * switched to <DB_SCHEMA>_test, so tests can never touch working data.
 */
export function loadTestEnv(): Env {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const base = parseEnv(process.env);
  const env = { ...base, NODE_ENV: 'test' as const, DB_SCHEMA: testSchemaFor(base.DB_SCHEMA) };
  if (!env.DB_SCHEMA.endsWith('_test')) {
    throw new Error(`Refusing to run tests against non-test schema ${env.DB_SCHEMA}`);
  }
  return env;
}
