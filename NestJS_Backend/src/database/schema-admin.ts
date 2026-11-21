/**
 * SQL for preparing a developer/test/environment schema. Pure functions so they are
 * unit-tested; executed by the database CLI and the integration-test setup.
 */

export function quoteIdent(name: string): string {
  if (name.length === 0) {
    throw new Error('Identifier is empty');
  }
  return `"${name.replaceAll('"', '""')}"`;
}

/** Idempotent: safe to run before every migration. */
export function prepareSchemaSql(schema: string, appUser: string): string[] {
  const s = quoteIdent(schema);
  const app = quoteIdent(appUser);
  return [
    `CREATE SCHEMA IF NOT EXISTS ${s}`,
    `GRANT USAGE ON SCHEMA ${s} TO ${app}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT USAGE, SELECT ON SEQUENCES TO ${app}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${s} TO ${app}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${s} TO ${app}`,
  ];
}

/**
 * The app login has no business reading or changing migration history. Null when the app
 * acts as the migration login itself (one Entra identity, no restricted role yet): the
 * REVOKE would take the migrator's own access to the table away.
 */
export function restrictMigrationTableSql(
  schema: string,
  appUser: string,
  migrationUser: string,
): string | null {
  if (appUser === migrationUser) {
    return null;
  }
  return `REVOKE ALL ON TABLE ${quoteIdent(schema)}."mikro_orm_migrations" FROM ${quoteIdent(appUser)}`;
}

/** Guarded so a mistyped setting can never drop a real schema. */
export function dropTestSchemaSql(schema: string): string {
  if (!schema.endsWith('_test')) {
    throw new Error(
      `Refusing to drop "${schema}": only _test schemas can be dropped`,
    );
  }
  return `DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`;
}

const ADD_SQL_CALL = /addSql\(\s*(`|'|")([\s\S]*?)\1\s*\)/g;

/** Pulls the SQL statements out of a generated migration file. */
export function extractMigrationSql(source: string): string[] {
  return [...source.matchAll(ADD_SQL_CALL)].map((match) => match[2]);
}

const QUALIFIED_NAME =
  /(?<![\w".])(?:"[^"]+"|[a-z_][a-z0-9_]*)\.(?:"[^"]+"|[a-z_][a-z0-9_]*)/gi;
const NON_SCHEMA_PREFIXES = new Set(['excluded', 'new', 'old']);
// SQL string literal, with '' as an escaped quote.
const STRING_LITERAL = /'(?:[^']|'')*'/g;

/**
 * Finds schema-qualified object names in generated migration SQL. Migrations must be
 * schema-agnostic so one file applies to every developer's schema.
 */
export function findSchemaQualifiedNames(sql: string): string[] {
  // Values such as 'approval.task.assigned' are data, not object names.
  return [...sql.replace(STRING_LITERAL, "''").matchAll(QUALIFIED_NAME)]
    .map((match) => match[0])
    .filter((name) => {
      const prefix = name.split('.')[0].replaceAll('"', '').toLowerCase();
      return !NON_SCHEMA_PREFIXES.has(prefix);
    });
}
