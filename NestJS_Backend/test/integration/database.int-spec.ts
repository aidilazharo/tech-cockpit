import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  entitiesMatchSnapshot,
  migrateUp,
  pendingMigrations,
  resetTestSchema,
} from '../../src/database/database-admin.js';
import { withDbUserContext } from '../../src/database/db-user-context.js';
import { buildOrmConfig } from '../../src/database/orm-config.js';
import { dropTestSchemaSql, quoteIdent } from '../../src/database/schema-admin.js';
import { loadTestEnv } from '../setup/test-env.js';

const env = loadTestEnv();
const schema = env.DB_SCHEMA;
const altSchema = schema.replace(/_test$/, '_alt_test');
const appRole = env.DB_APP_ROLE ?? env.DB_APP_USER;

let appOrm: MikroORM;
let ownerOrm: MikroORM;

beforeAll(async () => {
  appOrm = await MikroORM.init(buildOrmConfig(env, { login: 'app', schema }));
  ownerOrm = await MikroORM.init(
    buildOrmConfig(env, { login: 'migration', schema }),
  );
});

afterAll(async () => {
  await ownerOrm.em.getConnection().execute(dropTestSchemaSql(altSchema));
  await appOrm.close(true);
  await ownerOrm.close(true);
});

async function tablesIn(target: string): Promise<string[]> {
  const rows = await ownerOrm.em
    .getConnection()
    .execute<{ table_name: string }[]>(
      'select table_name from information_schema.tables where table_schema = ? order by table_name',
      [target],
    );
  return rows.map((row) => row.table_name);
}

describe('schema-per-developer migrations', () => {
  it('leaves no pending migrations in the test schema', async () => {
    expect(await pendingMigrations(env, schema)).toEqual([]);
  });

  it('applies the same migration files to a second schema', async () => {
    await resetTestSchema(env, altSchema);

    expect(await tablesIn(altSchema)).toEqual(await tablesIn(schema));
    expect(await tablesIn(altSchema)).toContain('app_user');
  });

  it('is idempotent when migrating an up-to-date schema', async () => {
    expect(await migrateUp(env, schema)).toEqual([]);
  });

  it('has a snapshot that matches the entity definitions', async () => {
    expect(await entitiesMatchSnapshot(env)).toBe(true);
  });
});

describe('app login privileges', () => {
  it('can read and write data tables', async () => {
    const result = await appOrm.em
      .getConnection()
      .execute<{ n: string }[]>('select count(*) as n from app_user');
    expect(Number(result[0].n)).toBeGreaterThanOrEqual(0);
  });

});

describe('row-level security with per-request user context', () => {
  const alice = randomUUID();
  const bob = randomUUID();

  beforeAll(async () => {
    const owner = ownerOrm.em.getConnection();
    await owner.execute(`create table rls_probe (owner_id uuid not null, secret text not null)`);
    await owner.execute(`alter table rls_probe enable row level security`);
    await owner.execute(`alter table rls_probe force row level security`);
    await owner.execute(
      `create policy rls_probe_owner on rls_probe using (owner_id = nullif(current_setting('app.user_id', true), '')::uuid)`,
    );
    await owner.execute(
      `grant select, insert on rls_probe to ${quoteIdent(appRole)}`,
    );
    for (const [owner_id, secret] of [
      [alice, 'alice-budget'],
      [bob, 'bob-budget'],
    ]) {
      await withDbUserContext(appOrm.em.fork(), { userId: owner_id }, (em) =>
        em.execute('insert into rls_probe values (?, ?)', [owner_id, secret]),
      );
    }
  });

  afterAll(async () => {
    await ownerOrm.em.getConnection().execute('drop table if exists rls_probe');
  });

  async function secretsVisibleTo(userId: string): Promise<string[]> {
    return withDbUserContext(appOrm.em.fork(), { userId }, async (em) => {
      const rows = await em.execute<{ secret: string }[]>(
        'select secret from rls_probe order by secret',
      );
      return rows.map((row) => row.secret);
    });
  }

  it('returns only the rows the current user may see', async () => {
    expect(await secretsVisibleTo(alice)).toEqual(['alice-budget']);
    expect(await secretsVisibleTo(bob)).toEqual(['bob-budget']);
  });

  it('returns nothing when no user context is set', async () => {
    const rows = await appOrm.em
      .fork()
      .execute('select secret from rls_probe');
    expect(rows).toEqual([]);
  });

  it('does not leak the user context to the next query on a pooled connection', async () => {
    await secretsVisibleTo(alice);
    for (let i = 0; i < 5; i++) {
      const rows = await appOrm.em
        .fork()
        .execute('select secret from rls_probe');
      expect(rows).toEqual([]);
    }
  });

  it('blocks inserting a row owned by someone else', async () => {
    await expect(
      withDbUserContext(appOrm.em.fork(), { userId: alice }, (em) =>
        em.execute('insert into rls_probe values (?, ?)', [bob, 'forged']),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('rejects a malformed user id before touching the database', async () => {
    await expect(
      withDbUserContext(appOrm.em.fork(), { userId: "x' or '1'='1" }, async () => 1),
    ).rejects.toThrow(/Invalid user id/);
  });
});
