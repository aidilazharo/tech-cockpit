import { resetTestSchema } from '../../src/database/database-admin.js';
import { loadTestEnv } from './test-env.js';

/** Runs once per integration/e2e run: fresh <DB_SCHEMA>_test with all migrations. */
export default async function setup(): Promise<void> {
  const env = loadTestEnv();
  await resetTestSchema(env, env.DB_SCHEMA);
}
