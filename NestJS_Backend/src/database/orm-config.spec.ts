import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env.js';
import { buildOrmConfig, MIGRATIONS_DIR, SNAPSHOT_NAME } from './orm-config.js';

const env = parseEnv({
  DB_HOST: 'db.example',
  DB_NAME: 'techcockpit',
  DB_SCHEMA: 'tc_dev',
  DB_APP_USER: 'app',
  DB_APP_PASSWORD: 'app-pw',
  DB_MIGRATION_USER: 'owner',
  DB_MIGRATION_PASSWORD: 'owner-pw',
  SESSION_JWT_SECRET: 'session-secret-session-secret-0123456',
});

describe('buildOrmConfig', () => {
  it('uses the app login and pins search_path to DB_SCHEMA at runtime', () => {
    const config = buildOrmConfig(env, { login: 'app' });
    expect(config).toMatchObject({
      user: 'app',
      password: 'app-pw',
      schema: 'tc_dev',
    });
    expect(config.driverOptions).toEqual({ options: '-c search_path=tc_dev' });
    expect(config.migrations).toMatchObject({
      path: MIGRATIONS_DIR,
      schema: 'tc_dev',
      snapshotOnMigrate: false,
    });
  });

  it('keeps the migration snapshot in one fixed file, whatever the database is called (Azure: postgres)', () => {
    const names = ['techcockpit', 'postgres', 'techcockpit_prod'].map(
      (DB_NAME) =>
        buildOrmConfig({ ...env, DB_NAME }, { login: 'app' }).migrations
          ?.snapshotName,
    );
    expect(names).toEqual([SNAPSHOT_NAME, SNAPSHOT_NAME, SNAPSHOT_NAME]);
    expect(SNAPSHOT_NAME).toBe('.snapshot-techcockpit');
  });

  it('uses the migration login, and no schema at all for migration generation', () => {
    const config = buildOrmConfig(env, {
      login: 'migration',
      schema: null,
      migrationsDir: '/tmp/m',
    });
    expect(config).toMatchObject({
      user: 'owner',
      password: 'owner-pw',
      schema: undefined,
    });
    expect(config.driverOptions).toEqual({});
    expect(config.migrations).toMatchObject({
      path: '/tmp/m',
      pathTs: '/tmp/m',
    });
  });

  it('signs in with an Azure CLI access token per login, fetched as each connection opens', async () => {
    const entra = {
      ...env,
      DB_SSL: true,
      DB_APP_AUTH: 'azure-cli' as const,
      DB_MIGRATION_AUTH: 'azure-cli' as const,
      DB_APP_USER: 'terry@aia.com',
      DB_MIGRATION_USER: 'terry@aia.com',
    };
    const tokens = {
      getToken: vi.fn(async () => ({
        token: 'entra-token',
        expiresOnTimestamp: Date.now() + 3_600_000,
      })),
    };
    const app = buildOrmConfig(entra, { login: 'app' }, tokens);
    expect(app.user).toBe('terry@aia.com');
    expect(typeof app.password).toBe('function');
    expect(await (app.password as () => Promise<string>)()).toBe('entra-token');
    expect(
      typeof buildOrmConfig(entra, { login: 'migration' }, tokens).password,
    ).toBe('function');
    // Each login is set on its own: a password login keeps its password.
    expect(
      buildOrmConfig(
        { ...entra, DB_APP_AUTH: 'password' },
        { login: 'app' },
        tokens,
      ).password,
    ).toBe('app-pw');
    // Without a credential given, the Azure CLI's sign-in is used (asked only when a connection opens).
    expect(typeof buildOrmConfig(entra, { login: 'app' }).password).toBe(
      'function',
    );
  });

  it('shares one Azure CLI token between both logins and every connection setup in the process', () => {
    const entra = {
      ...env,
      DB_APP_AUTH: 'azure-cli' as const,
      DB_MIGRATION_AUTH: 'azure-cli' as const,
    };
    const app = buildOrmConfig(entra, { login: 'app' }).password;
    expect(buildOrmConfig(entra, { login: 'app', schema: null }).password).toBe(
      app,
    );
    expect(buildOrmConfig(entra, { login: 'migration' }).password).toBe(app);
  });

  it('switches the app login to its restricted role as it connects, and never the migration login', () => {
    const restricted = { ...env, DB_APP_ROLE: 'tc_app' };
    expect(buildOrmConfig(restricted, { login: 'app' }).driverOptions).toEqual({
      options: '-c search_path=tc_dev -c role=tc_app',
    });
    expect(
      buildOrmConfig(restricted, { login: 'app', schema: null }).driverOptions,
    ).toEqual({ options: '-c role=tc_app' });
    expect(
      buildOrmConfig(restricted, { login: 'migration' }).driverOptions,
    ).toEqual({ options: '-c search_path=tc_dev' });
  });

  it('requires verified TLS when DB_SSL=true (Azure)', () => {
    const config = buildOrmConfig(
      { ...env, DB_SSL: true },
      { login: 'app', schema: 'tc_x' },
    );
    expect(config.driverOptions).toEqual({
      ssl: { rejectUnauthorized: true },
      options: '-c search_path=tc_x',
    });
  });
});
