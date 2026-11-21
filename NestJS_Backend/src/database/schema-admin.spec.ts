import { describe, expect, it } from 'vitest';
import {
  dropTestSchemaSql,
  extractMigrationSql,
  findSchemaQualifiedNames,
  prepareSchemaSql,
  quoteIdent,
  restrictMigrationTableSql,
} from './schema-admin.js';

describe('quoteIdent', () => {
  it('wraps an identifier in double quotes', () => {
    expect(quoteIdent('tc_terry')).toBe('"tc_terry"');
  });

  it('escapes embedded double quotes so names cannot break out of the identifier', () => {
    expect(quoteIdent('a"; drop schema x; --')).toBe(
      '"a""; drop schema x; --"',
    );
  });

  it('rejects an empty identifier', () => {
    expect(() => quoteIdent('')).toThrow(/empty/);
  });
});

describe('prepareSchemaSql', () => {
  it('creates the schema and grants the app login data access only', () => {
    const sql = prepareSchemaSql('tc_terry', 'tc_app').join('\n');

    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "tc_terry"');
    expect(sql).toContain('GRANT USAGE ON SCHEMA "tc_terry" TO "tc_app"');
    expect(sql).toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "tc_terry" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "tc_app"',
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "tc_terry" TO "tc_app"',
    );
    expect(sql).not.toMatch(/GRANT (ALL|CREATE)/);
  });
});

describe('restrictMigrationTableSql', () => {
  it('removes app-login access to the migration history table', () => {
    expect(restrictMigrationTableSql('tc_terry', 'tc_app', 'owner')).toBe(
      'REVOKE ALL ON TABLE "tc_terry"."mikro_orm_migrations" FROM "tc_app"',
    );
  });

  it('removes nothing when the app acts as the migration login itself (it would lock the migrator out of its own table)', () => {
    expect(restrictMigrationTableSql('tc_terry', 'terry@aia.com', 'terry@aia.com')).toBeNull();
  });

  it('still restricts a role that the migration login merely belongs to (names compared exactly)', () => {
    expect(restrictMigrationTableSql('tc_terry', 'Owner', 'owner')).toBe(
      'REVOKE ALL ON TABLE "tc_terry"."mikro_orm_migrations" FROM "Owner"',
    );
  });
});

describe('dropTestSchemaSql', () => {
  it('drops a schema ending in _test', () => {
    expect(dropTestSchemaSql('tc_terry_test')).toBe(
      'DROP SCHEMA IF EXISTS "tc_terry_test" CASCADE',
    );
  });

  it('refuses to drop a schema that is not a test schema', () => {
    expect(() => dropTestSchemaSql('tc_terry')).toThrow(/only _test schemas/);
  });
});

describe('extractMigrationSql', () => {
  it('returns only the SQL passed to addSql, ignoring TypeScript code', () => {
    const source = `import { Migration } from '@mikro-orm/migrations';
export class Migration1 extends Migration {
  override up(): void {
    this.addSql(\`create table "department" ("id" uuid not null);\`);
    this.addSql('alter table "app_user" add column "x" int;');
  }
}`;

    expect(extractMigrationSql(source)).toEqual([
      'create table "department" ("id" uuid not null);',
      'alter table "app_user" add column "x" int;',
    ]);
  });
});

describe('findSchemaQualifiedNames', () => {
  it('returns nothing for unqualified migration SQL', () => {
    const sql = `create table "app_user" ("id" uuid not null);
alter table "app_user" add constraint "app_user_department_id_foreign" foreign key ("department_id") references "department" ("id");`;

    expect(findSchemaQualifiedNames(sql)).toEqual([]);
  });

  it('finds quoted schema-qualified table names', () => {
    const sql = `create table "tc_terry"."app_user" ("id" uuid);
references "public"."department" ("id")`;

    expect(findSchemaQualifiedNames(sql)).toEqual([
      '"tc_terry"."app_user"',
      '"public"."department"',
    ]);
  });

  it('ignores dotted text inside string literals (e.g. enum values in a check constraint)', () => {
    const sql = `alter table "notification" add constraint "notification_type_check" check ("type" in ('approval.task.assigned', 'it''s.fine'));`;

    expect(findSchemaQualifiedNames(sql)).toEqual([]);
  });

  it('still finds a qualified name next to a string literal', () => {
    expect(findSchemaQualifiedNames(`insert into public.role values ('a.b')`)).toEqual(['public.role']);
  });

  it('finds unquoted schema-qualified names', () => {
    expect(findSchemaQualifiedNames('alter table public.app_user')).toEqual([
      'public.app_user',
    ]);
  });

  it('ignores qualified column references inside expressions like excluded.col', () => {
    expect(
      findSchemaQualifiedNames('on conflict do update set "a" = excluded."a"'),
    ).toEqual([]);
  });
});
