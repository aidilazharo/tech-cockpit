import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MikroORM } from '@mikro-orm/postgresql';
import type { Env } from '../config/env.js';
import { buildOrmConfig, MIGRATIONS_DIR, SNAPSHOT_NAME } from './orm-config.js';
import type { Migrator } from './techcockpit-migrator.js';
import {
  dropTestSchemaSql,
  extractMigrationSql,
  findSchemaQualifiedNames,
  prepareSchemaSql,
  restrictMigrationTableSql,
} from './schema-admin.js';

async function withMigrationOrm<T>(
  env: Env,
  schema: string | null,
  run: (orm: MikroORM) => Promise<T>,
  migrationsDir = MIGRATIONS_DIR,
): Promise<T> {
  const orm = await MikroORM.init(
    buildOrmConfig(env, { login: 'migration', schema, migrationsDir }),
  );
  try {
    return await run(orm);
  } finally {
    await orm.close(true);
  }
}

async function executeAll(orm: MikroORM, statements: string[]): Promise<void> {
  const connection = orm.em.getConnection();
  for (const statement of statements) {
    await connection.execute(statement);
  }
}

/** Who the app acts as: the role it switches to as it connects (DB_APP_ROLE), else its login. */
const appRole = (env: Env): string => env.DB_APP_ROLE ?? env.DB_APP_USER;

/** Creates the schema if allowed and grants the app login data access. Idempotent. */
export async function prepareSchema(env: Env, schema: string): Promise<void> {
  await withMigrationOrm(env, null, (orm) =>
    executeAll(orm, prepareSchemaSql(schema, appRole(env))),
  );
}

/** Applies pending migrations to the given schema. Returns the names applied. */
export async function migrateUp(env: Env, schema: string): Promise<string[]> {
  await prepareSchema(env, schema);
  return withMigrationOrm(env, schema, async (orm) => {
    const applied = await orm.migrator.up({ schema });
    const restrict = restrictMigrationTableSql(schema, appRole(env), env.DB_MIGRATION_USER);
    if (restrict) {
      await executeAll(orm, [restrict]);
    }
    return applied.map((migration) => migration.name);
  });
}

export async function migrateDown(env: Env, schema: string): Promise<string[]> {
  return withMigrationOrm(env, schema, async (orm) => {
    const reverted = await orm.migrator.down({ schema });
    return reverted.map((migration) => migration.name);
  });
}

export async function pendingMigrations(
  env: Env,
  schema: string,
): Promise<string[]> {
  return withMigrationOrm(env, schema, async (orm) => {
    const pending = await orm.migrator.getPending({ schema });
    return pending.map((migration) => migration.name);
  });
}

/** Drops and recreates a `_test` schema, then migrates it. */
export async function resetTestSchema(env: Env, schema: string): Promise<void> {
  await withMigrationOrm(env, null, (orm) =>
    executeAll(orm, [dropTestSchemaSql(schema)]),
  );
  await migrateUp(env, schema);
}

const EMPTY_SNAPSHOT = JSON.stringify(
  { name: 'public', namespaces: [], tables: [], views: [], nativeEnums: {} },
  null,
  2,
);

/** Puts the snapshot back as it was before a rejected generation (absent = delete). */
export function restoreSnapshot(snapshotFile: string, previous: string | null): void {
  if (previous === null) {
    rmSync(snapshotFile, { force: true });
  } else {
    writeFileSync(snapshotFile, previous);
  }
}

export class QualifiedMigrationError extends Error {
  constructor(file: string, names: string[]) {
    super(
      `Generated migration ${file} contains schema-qualified names (${names.join(', ')}). ` +
        'Migrations must be schema-agnostic; the file was deleted.',
    );
    this.name = 'QualifiedMigrationError';
  }
}

/**
 * Generates a migration from entity changes (diffed against the committed snapshot),
 * with no schema set so the SQL applies to any schema. Returns the file name, or
 * null when there is nothing to migrate.
 */
export async function createMigration(
  env: Env,
  name: string,
  migrationsDir = MIGRATIONS_DIR,
): Promise<string | null> {
  const snapshotFile = join(migrationsDir, `${SNAPSHOT_NAME}.json`);
  const previousSnapshot = existsSync(snapshotFile)
    ? readFileSync(snapshotFile, 'utf8')
    : null;

  // No snapshot yet: start from an empty one so generation runs offline from entity
  // metadata. Diffing against the live database would pick up other developers' schemas.
  if (previousSnapshot === null) {
    writeFileSync(snapshotFile, EMPTY_SNAPSHOT);
  }

  return withMigrationOrm(env, null, async (orm) => {
    const result = await orm.migrator.create(undefined, false, false, name);
    if (!result.fileName) {
      return null;
    }
    const file = join(migrationsDir, result.fileName);
    const sql = extractMigrationSql(readFileSync(file, 'utf8')).join('\n');
    const qualified = findSchemaQualifiedNames(sql);
    if (qualified.length > 0) {
      rmSync(file);
      restoreSnapshot(snapshotFile, previousSnapshot);
      throw new QualifiedMigrationError(result.fileName, qualified);
    }
    return result.fileName;
  }, migrationsDir);
}

/** True when entities match the committed snapshot (no migration missing). */
export async function entitiesMatchSnapshot(env: Env, migrationsDir = MIGRATIONS_DIR): Promise<boolean> {
  return withMigrationOrm(
    env,
    null,
    async (orm) =>
      !(await (orm.migrator as Migrator).hasPendingEntityChanges()),
    migrationsDir,
  );
}
