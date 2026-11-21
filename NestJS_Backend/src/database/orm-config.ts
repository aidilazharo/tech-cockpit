import { fileURLToPath } from 'node:url';
import type { TokenCredential } from '@azure/identity';
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import type { Env } from '../config/env.js';
import { azureCliPassword, entraPassword } from './entra-token.js';
import { ENTITIES } from './entities.js';
import { Migrator } from './techcockpit-migrator.js';

export type DbLogin = 'app' | 'migration';

export interface OrmConfigOptions {
  /** `app` for runtime (subject to row-level security); `migration` owns the schema. */
  login: DbLogin;
  /**
   * Schema used at runtime. `null` leaves it unset, which is required when
   * generating migrations so the SQL contains no schema name.
   */
  schema?: string | null;
  /** Override for tests; defaults to the source/compiled migrations folder. */
  migrationsDir?: string;
}

// Resolves to src/database/migrations under tsx/Vitest and dist/database/migrations when compiled.
export const MIGRATIONS_DIR = fileURLToPath(
  new URL('./migrations', import.meta.url),
);

/** The committed snapshot's file name (without `.json`). MikroORM's default adds DB_NAME, which Azure names `postgres`. */
export const SNAPSHOT_NAME = '.snapshot-techcockpit';

/**
 * `credential` signs in logins set to `azure-cli` (tests pass their own; by default the Azure CLI's `az login`).
 */
export function buildOrmConfig(
  env: Env,
  options: OrmConfigOptions,
  credential?: TokenCredential,
) {
  const schema =
    options.schema === undefined
      ? env.DB_SCHEMA
      : (options.schema ?? undefined);
  const migration = options.login === 'migration';
  const migrationsDir = options.migrationsDir ?? MIGRATIONS_DIR;
  const login = migration ? 'MIGRATION' : 'APP';
  // An access token is fetched as each connection opens (the driver calls the function), so it never goes stale.
  const entra = () =>
    credential ? entraPassword(credential) : azureCliPassword();
  const password =
    env[`DB_${login}_AUTH`] === 'azure-cli'
      ? entra()
      : env[`DB_${login}_PASSWORD`];
  // Session settings at connect. Safe to interpolate: DB_SCHEMA and DB_APP_ROLE are validated as [a-z][a-z0-9_]*.
  const startup = [
    // Raw SQL and RLS policies resolve unqualified names in DB_SCHEMA only, never in public.
    schema ? `-c search_path=${schema}` : null,
    // The app login acting as a more privileged identity (e.g. the migration login's Entra identity) keeps only this role's rights.
    !migration && env.DB_APP_ROLE ? `-c role=${env.DB_APP_ROLE}` : null,
  ].filter(Boolean);

  return defineConfig({
    driver: PostgreSqlDriver,
    entities: ENTITIES,
    host: env.DB_HOST,
    port: env.DB_PORT,
    dbName: env.DB_NAME,
    user: migration ? env.DB_MIGRATION_USER : env.DB_APP_USER,
    password,
    schema,
    driverOptions: {
      ...(env.DB_SSL ? { ssl: { rejectUnauthorized: true } } : {}),
      ...(startup.length > 0 ? { options: startup.join(' ') } : {}),
    },
    forceUtcTimezone: true,
    ensureDatabase: false,
    extensions: [Migrator],
    migrations: {
      path: migrationsDir,
      pathTs: migrationsDir,
      glob: '!(*.d).{js,ts}',
      tableName: 'mikro_orm_migrations',
      transactional: true,
      allOrNothing: true,
      emit: 'ts',
      snapshot: true,
      snapshotName: SNAPSHOT_NAME,
      // Never rewrite the committed snapshot from a developer's database.
      snapshotOnMigrate: false,
      includeWildcardSchema: true,
      schema,
    },
  });
}
