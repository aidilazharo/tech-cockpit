import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv, testSchemaFor } from './env.js';

const valid = {
  NODE_ENV: 'development',
  PORT: '3000',
  FRONTEND_ORIGINS: 'http://localhost:5173, http://localhost:4173',
  DB_HOST: '127.0.0.1',
  DB_PORT: '54315',
  DB_NAME: 'techcockpit',
  DB_SCHEMA: 'tc_terry',
  DB_SSL: 'false',
  DB_APP_USER: 'tc_app',
  DB_APP_PASSWORD: 'app-secret',
  DB_MIGRATION_USER: 'tc_owner',
  DB_MIGRATION_PASSWORD: 'owner-secret',
  SESSION_JWT_SECRET: 'jwt-secret-jwt-secret-jwt-secret-0123',
};

describe('parseEnv', () => {
  it('parses a complete development environment with typed values', () => {
    const env = parseEnv(valid);

    expect(env.PORT).toBe(3000);
    expect(env.DB_PORT).toBe(54315);
    expect(env.DB_SSL).toBe(false);
    expect(env.FRONTEND_ORIGINS).toEqual([
      'http://localhost:5173',
      'http://localhost:4173',
    ]);
  });

  it('applies defaults for optional settings', () => {
    const {
      NODE_ENV: _n,
      PORT: _p,
      FRONTEND_ORIGINS: _f,
      DB_SSL: _s,
      ...minimal
    } = valid;

    const env = parseEnv(minimal);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.DB_SSL).toBe(false);
    expect(env.FRONTEND_ORIGINS).toEqual(['http://localhost:5173']);
    expect(env.API_KEY_MAX_TTL_DAYS).toBe(90);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(300);
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.STORAGE_LOCAL_PATH).toBe('./storage');
    expect(env.API_BASE_URL).toBe('http://localhost:3000');
    expect(env.APP_BASE_URL).toBe('http://localhost:5173');
    expect(env.SAML_IDP_METADATA_URL).toBeUndefined();
    expect(env.SESSION_ACCESS_TTL_MINUTES).toBe(15);
    expect(env.SESSION_IDLE_TIMEOUT_MINUTES).toBe(30);
    expect(env.SESSION_ABSOLUTE_TIMEOUT_MINUTES).toBe(240);
    expect(env.TRM_APPLICATION_SERVICE_CLASSES).toContain('cmdb_ci_service_auto');
  });

  it('reads the ServiceNow classes that mean application service', () => {
    expect(parseEnv({ ...valid, TRM_APPLICATION_SERVICE_CLASSES: 'cmdb_ci_service_auto, Application Service' }).TRM_APPLICATION_SERVICE_CLASSES).toEqual([
      'cmdb_ci_service_auto',
      'Application Service',
    ]);
  });

  it('turns DB_SSL=true into a boolean', () => {
    expect(parseEnv({ ...valid, DB_SSL: 'true' }).DB_SSL).toBe(true);
  });

  it('rejects a missing required setting and names the key', () => {
    const { DB_APP_PASSWORD: _omit, ...missing } = valid;

    expect(() => parseEnv(missing)).toThrow(EnvValidationError);
    expect(() => parseEnv(missing)).toThrow(/DB_APP_PASSWORD/);
  });

  it.each([
    ['uppercase letters', 'TC_Terry'],
    ['a hyphen', 'tc-terry'],
    ['a leading digit', '1tc'],
    ['a quote (SQL injection attempt)', 'tc";drop'],
    ['59 characters (no room for the _test suffix)', `t${'x'.repeat(58)}`],
  ])('rejects DB_SCHEMA containing %s', (_label, schema) => {
    expect(() => parseEnv({ ...valid, DB_SCHEMA: schema })).toThrow(
      /DB_SCHEMA/,
    );
  });

  it('signs a login in with an Azure CLI access token instead of a password, and can switch the app login to a restricted role', () => {
    const { DB_APP_PASSWORD: _a, DB_MIGRATION_PASSWORD: _m, ...noPasswords } = valid;
    const entra = 'terry.chew@aia.com';
    const env = parseEnv({ ...noPasswords, DB_SSL: 'true', DB_APP_AUTH: 'azure-cli', DB_MIGRATION_AUTH: 'azure-cli', DB_APP_USER: entra, DB_MIGRATION_USER: entra, DB_APP_ROLE: 'tc_app' });
    expect(env).toMatchObject({ DB_APP_AUTH: 'azure-cli', DB_MIGRATION_AUTH: 'azure-cli', DB_APP_USER: entra, DB_APP_ROLE: 'tc_app' });
    expect(env.DB_APP_PASSWORD).toBeUndefined();
    // Passwords stay the default, with no role switch.
    expect(parseEnv(valid)).toMatchObject({ DB_APP_AUTH: 'password', DB_MIGRATION_AUTH: 'password' });
    expect(parseEnv(valid).DB_APP_ROLE).toBeUndefined();
  });

  it('needs the password of each login signed in with one', () => {
    const { DB_MIGRATION_PASSWORD: _m, ...missing } = valid;
    expect(() => parseEnv({ ...missing, DB_SSL: 'true', DB_APP_AUTH: 'azure-cli' })).toThrow(/DB_MIGRATION_PASSWORD/);
    const { DB_APP_PASSWORD: _a, ...noApp } = valid;
    expect(() => parseEnv({ ...noApp, DB_SSL: 'true', DB_MIGRATION_AUTH: 'azure-cli' })).toThrow(/DB_APP_PASSWORD/);
  });

  it('refuses an access token without TLS, an unknown sign-in and a role that is not a plain name', () => {
    expect(() => parseEnv({ ...valid, DB_APP_AUTH: 'azure-cli' })).toThrow(/DB_SSL/);
    expect(() => parseEnv({ ...valid, DB_MIGRATION_AUTH: 'kerberos' })).toThrow(/DB_MIGRATION_AUTH/);
    expect(() => parseEnv({ ...valid, DB_APP_ROLE: 'tc_app -c role=postgres' })).toThrow(/DB_APP_ROLE/);
  });

  it('rejects an invalid port', () => {
    expect(() => parseEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('needs the storage account (https) for Azure Blob Storage, reached with a managed identity', () => {
    expect(() => parseEnv({ ...valid, STORAGE_DRIVER: 'azure-blob' })).toThrow(/STORAGE_AZURE_ACCOUNT_URL: is required when STORAGE_DRIVER is azure-blob/);
    expect(() => parseEnv({ ...valid, STORAGE_DRIVER: 'azure-blob', STORAGE_AZURE_ACCOUNT_URL: 'http://tcuploads.blob.core.windows.net' })).toThrow(/STORAGE_AZURE_ACCOUNT_URL/);
    const env = parseEnv({ ...valid, STORAGE_DRIVER: 'azure-blob', STORAGE_AZURE_ACCOUNT_URL: 'https://tcuploads.blob.core.windows.net' });
    expect([env.STORAGE_AZURE_CONTAINER, env.STORAGE_AZURE_CLIENT_ID]).toEqual(['sad-uploads', undefined]);
    // A user-assigned identity is named by its client id.
    expect(parseEnv({ ...valid, STORAGE_AZURE_CLIENT_ID: '0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f' }).STORAGE_AZURE_CLIENT_ID).toBe('0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f');
  });

  it('rejects an unknown storage driver', () => {
    expect(() => parseEnv({ ...valid, STORAGE_DRIVER: 's3' })).toThrow(
      /STORAGE_DRIVER/,
    );
  });

  it('never includes secret values in the error message', () => {
    try {
      parseEnv({ ...valid, DB_PORT: 'not-a-number' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('app-secret');
      expect(String(error)).not.toContain('owner-secret');
      expect(String(error)).not.toContain('jwt-secret');
    }
  });
});

describe('parseEnv: SAML and sessions', () => {
  it('accepts configurable session timeouts', () => {
    const env = parseEnv({
      ...valid,
      SESSION_ACCESS_TTL_MINUTES: '5',
      SESSION_IDLE_TIMEOUT_MINUTES: '20',
      SESSION_ABSOLUTE_TIMEOUT_MINUTES: '480',
    });

    expect([env.SESSION_ACCESS_TTL_MINUTES, env.SESSION_IDLE_TIMEOUT_MINUTES, env.SESSION_ABSOLUTE_TIMEOUT_MINUTES]).toEqual([5, 20, 480]);
  });

  it('requires a session signing secret of at least 32 characters', () => {
    const { SESSION_JWT_SECRET: _omit, ...missing } = valid;

    expect(() => parseEnv(missing)).toThrow(/SESSION_JWT_SECRET/);
    expect(() => parseEnv({ ...valid, SESSION_JWT_SECRET: 'short' })).toThrow(/SESSION_JWT_SECRET/);
  });

  it('rejects an idle timeout shorter than the access token lifetime', () => {
    expect(() => parseEnv({ ...valid, SESSION_ACCESS_TTL_MINUTES: '30', SESSION_IDLE_TIMEOUT_MINUTES: '15' })).toThrow(
      /SESSION_IDLE_TIMEOUT_MINUTES/,
    );
  });

  it('rejects an absolute timeout shorter than the idle timeout', () => {
    expect(() => parseEnv({ ...valid, SESSION_IDLE_TIMEOUT_MINUTES: '60', SESSION_ABSOLUTE_TIMEOUT_MINUTES: '30' })).toThrow(
      /SESSION_ABSOLUTE_TIMEOUT_MINUTES/,
    );
  });

  it.each(['API_BASE_URL', 'APP_BASE_URL'])('requires %s to be a bare origin', (key) => {
    expect(() => parseEnv({ ...valid, [key]: 'http://localhost:3000/api' })).toThrow(new RegExp(key));
    expect(() => parseEnv({ ...valid, [key]: 'http://localhost:3000/' })).toThrow(new RegExp(key));
    expect(() => parseEnv({ ...valid, [key]: 'not a url' })).toThrow(new RegExp(key));
  });

  it('accepts an https metadata URL', () => {
    const url = 'https://example.okta.com/app/abc/sso/saml/metadata';

    expect(parseEnv({ ...valid, SAML_IDP_METADATA_URL: url }).SAML_IDP_METADATA_URL).toBe(url);
  });

  it('rejects a metadata URL that is not https', () => {
    expect(() => parseEnv({ ...valid, SAML_IDP_METADATA_URL: 'http://example.okta.com/metadata' })).toThrow(
      /SAML_IDP_METADATA_URL/,
    );
  });

  it('requires SAML and https URLs in production', () => {
    const production = { ...valid, NODE_ENV: 'production' };

    expect(() => parseEnv(production)).toThrow(/SAML_IDP_METADATA_URL/);
    expect(() => parseEnv(production)).toThrow(/API_BASE_URL/);
    expect(() => parseEnv(production)).toThrow(/APP_BASE_URL/);
    // Files must be scanned for malware before anyone downloads them: only Azure Blob Storage (with Defender) is.
    expect(() => parseEnv(production)).toThrow(/STORAGE_DRIVER: must be azure-blob in production/);
    expect(
      parseEnv({
        ...production,
        API_BASE_URL: 'https://techcockpit-api.example.com',
        APP_BASE_URL: 'https://techcockpit.example.com',
        SAML_IDP_METADATA_URL: 'https://example.okta.com/metadata',
        STORAGE_DRIVER: 'azure-blob',
        STORAGE_AZURE_ACCOUNT_URL: 'https://techcockpit.blob.core.windows.net',
      }).NODE_ENV,
    ).toBe('production');
  });
});

describe('testSchemaFor', () => {
  it('appends _test to the developer schema', () => {
    expect(testSchemaFor('tc_terry')).toBe('tc_terry_test');
  });
});
