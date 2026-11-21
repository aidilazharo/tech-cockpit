/**
 * Database CLI. Development: `npm run db -- <command>` (runs with tsx).
 * Deployed: `node dist/database/cli/db.js migrate`.
 *
 *   prepare           create DB_SCHEMA if allowed and grant the app login
 *   migrate           apply pending migrations to DB_SCHEMA
 *   down              revert the last migration in DB_SCHEMA
 *   pending           list pending migrations for DB_SCHEMA
 *   create <name>     generate a schema-agnostic migration from entity changes
 *   check             exit 1 if entities changed without a migration
 */
import { existsSync } from 'node:fs';
import { parseEnv } from '../../config/env.js';
import {
  createMigration,
  entitiesMatchSnapshot,
  migrateDown,
  migrateUp,
  pendingMigrations,
  prepareSchema,
} from '../database-admin.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const env = parseEnv(process.env);
const [command, argument] = process.argv.slice(2);
const schema = env.DB_SCHEMA;

function print(label: string, items: string[]): void {
  console.log(items.length === 0 ? `${label}: none` : `${label}:\n  ${items.join('\n  ')}`);
}

switch (command) {
  case 'prepare':
    await prepareSchema(env, schema);
    console.log(`Schema "${schema}" is ready.`);
    break;
  case 'migrate':
    print(`Applied to "${schema}"`, await migrateUp(env, schema));
    break;
  case 'down':
    print(`Reverted in "${schema}"`, await migrateDown(env, schema));
    break;
  case 'pending':
    print(`Pending for "${schema}"`, await pendingMigrations(env, schema));
    break;
  case 'create': {
    if (!argument || !/^[a-z][a-z0-9-]*$/.test(argument)) {
      console.error('Usage: create <kebab-case-name>');
      process.exit(2);
    }
    const file = await createMigration(env, argument);
    console.log(file ? `Created ${file}` : 'No entity changes; nothing created.');
    break;
  }
  case 'check':
    if (!(await entitiesMatchSnapshot(env))) {
      console.error('Entities changed without a migration. Run: npm run db -- create <name>');
      process.exit(1);
    }
    console.log('Entities match the migration snapshot.');
    break;
  default:
    console.error('Commands: prepare | migrate | down | pending | create <name> | check');
    process.exit(2);
}
