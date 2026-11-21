import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, describe, expect, it } from 'vitest';
import {
  createMigration,
  entitiesMatchSnapshot,
  migrateDown,
  migrateUp,
  pendingMigrations,
  QualifiedMigrationError,
  resetTestSchema,
  restoreSnapshot,
} from '../../src/database/database-admin.js';
import { buildOrmConfig, MIGRATIONS_DIR, SNAPSHOT_NAME } from '../../src/database/orm-config.js';
import { dropTestSchemaSql, extractMigrationSql, findSchemaQualifiedNames } from '../../src/database/schema-admin.js';
import { loadTestEnv } from '../setup/test-env.js';

const env = loadTestEnv();
const snapshotName = `${SNAPSHOT_NAME}.json`;
const temps: string[] = [];

function tempDir(withCurrentMigrations: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'tc-migrations-'));
  temps.push(dir);
  if (withCurrentMigrations) {
    for (const file of readdirSync(MIGRATIONS_DIR)) copyFileSync(join(MIGRATIONS_DIR, file), join(dir, file));
  }
  return dir;
}

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe('migration generation', () => {
  it('creates nothing when entities match the snapshot', async () => {
    const dir = tempDir(true);
    expect(await createMigration(env, 'noop', dir)).toBeNull();
    expect(await entitiesMatchSnapshot(env, dir)).toBe(true);
  });

  it('builds a schema-agnostic initial migration offline when there is no snapshot yet', async () => {
    const dir = tempDir(false);
    const file = await createMigration(env, 'initial', dir);
    expect(file).toMatch(/_initial\.ts$/);
    const sql = extractMigrationSql(readFileSync(join(dir, file!), 'utf8')).join('\n');
    expect(sql).toContain('create table "app_user"');
    expect(findSchemaQualifiedNames(sql)).toEqual([]);
    expect(existsSync(join(dir, snapshotName))).toBe(true);
  });

  it('rejects a migration with schema names, deletes it and restores the previous snapshot', async () => {
    const dir = tempDir(true);
    const snapshotPath = join(dir, snapshotName);
    // A snapshot that (wrongly) records tables under a named schema makes the diff
    // produce schema-qualified statements: exactly what the guard must stop.
    const polluted = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    for (const table of polluted.tables) table.schema = 'tc_someone';
    const pollutedText = JSON.stringify(polluted, null, 2);
    writeFileSync(snapshotPath, pollutedText);
    const before = readdirSync(dir).sort();

    await expect(createMigration(env, 'bad', dir)).rejects.toThrow(QualifiedMigrationError);
    expect(readdirSync(dir).sort()).toEqual(before);
    expect(readFileSync(snapshotPath, 'utf8')).toBe(pollutedText);
  });

  it('restores the snapshot state after a rejected generation (previous content or no file)', () => {
    const dir = tempDir(false);
    const snapshotPath = join(dir, snapshotName);
    writeFileSync(snapshotPath, 'generated');
    restoreSnapshot(snapshotPath, 'previous');
    expect(readFileSync(snapshotPath, 'utf8')).toBe('previous');
    restoreSnapshot(snapshotPath, null);
    expect(existsSync(snapshotPath)).toBe(false);
  });
});

describe('migrate down and up', () => {
  const schema = env.DB_SCHEMA.replace(/_test$/, '_down_test');

  afterAll(async () => {
    const orm = await MikroORM.init(buildOrmConfig(env, { login: 'migration', schema: null }));
    await orm.em.getConnection().execute(dropTestSchemaSql(schema));
    await orm.close(true);
  });

  it('reverts the last migration and re-applies it', async () => {
    await resetTestSchema(env, schema);
    const reverted = await migrateDown(env, schema);
    expect(reverted).toHaveLength(1);
    expect(await pendingMigrations(env, schema)).toEqual(reverted);
    expect(await migrateUp(env, schema)).toEqual(reverted);
    expect(await pendingMigrations(env, schema)).toEqual([]);
  });
});
