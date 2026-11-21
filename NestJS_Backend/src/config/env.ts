import { z } from 'zod';
import { APPLICATION_SERVICE_CLASSES } from '../modules/trm/domain/mapping.js';

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

// Postgres identifiers are limited to 63 characters; the test schema adds "_test".
const schemaName = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]{0,57}$/,
    'must start with a lowercase letter and contain only lowercase letters, digits and underscores (max 58 characters)',
  );

const commaList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// A scheme://host[:port] origin with no path or trailing slash, so URLs can be appended safely.
const origin = z
  .string()
  .refine((value) => URL.canParse(value) && new URL(value).origin === value, 'must be an origin such as https://host[:port] (no path or trailing slash)');

const isHttps = (value: string) => value.startsWith('https://');

const dbAuth = z.enum(['password', 'azure-cli']).default('password');

const minutes = (fallback: number) => z.coerce.number().int().min(1).max(24 * 60).default(fallback);

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_ORIGINS: z.string().default('http://localhost:5173').transform(commaList),
  /** Public origin of this API (SAML ACS and SP entity ID are derived from it). */
  API_BASE_URL: origin.default('http://localhost:3000'),
  /** Public origin of the web app (where users land after signing in). */
  APP_BASE_URL: origin.default('http://localhost:5173'),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_NAME: z.string().min(1),
  DB_SCHEMA: schemaName,
  DB_SSL: booleanString.default(false),
  /**
   * How each login signs in: a password, or an Entra ID access token from the Azure CLI (`az login`; Azure PostgreSQL
   * Flexible Server on the Windows company laptop). With a token, the user is the Entra name and no password is kept.
   */
  DB_APP_AUTH: dbAuth,
  DB_APP_USER: z.string().min(1),
  DB_APP_PASSWORD: z.string().min(1).optional(),
  /**
   * A role the app login switches to as it connects, when it signs in as an identity with more rights (e.g. the same
   * Entra identity as the migration login): the app then has only that role's rights.
   */
  DB_APP_ROLE: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,62}$/, 'must be a lowercase role name (letters, digits, underscores)')
    .optional(),
  DB_MIGRATION_AUTH: dbAuth,
  DB_MIGRATION_USER: z.string().min(1),
  DB_MIGRATION_PASSWORD: z.string().min(1).optional(),

  API_KEY_MAX_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  /** Requests per minute per client IP (in-memory; one App Service instance). */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),

  STORAGE_DRIVER: z.enum(['local', 'azure-blob']).default('local'),
  STORAGE_LOCAL_PATH: z.string().min(1).default('./storage'),
  /** Azure Blob Storage (deployed): the account's blob endpoint and the container, reached with the App Service's managed identity. */
  STORAGE_AZURE_ACCOUNT_URL: z.url().refine(isHttps, 'must use https').optional(),
  STORAGE_AZURE_CONTAINER: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/, 'must be an Azure container name').default('sad-uploads'),
  /** A user-assigned managed identity's client id (leave out for the system-assigned identity). */
  STORAGE_AZURE_CLIENT_ID: z.uuid().optional(),

  /** Okta app metadata URL. Without it, browser sign-in is unavailable (API keys still work). */
  SAML_IDP_METADATA_URL: z.url().refine(isHttps, 'must use https').optional(),

  /** HMAC key for session access tokens (at least 32 random characters). */
  SESSION_JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  SESSION_ACCESS_TTL_MINUTES: minutes(15),
  SESSION_IDLE_TIMEOUT_MINUTES: minutes(30),
  SESSION_ABSOLUTE_TIMEOUT_MINUTES: minutes(240),

  /** ServiceNow classes (sys_class_name values) that mean "application service" in the services export. */
  TRM_APPLICATION_SERVICE_CLASSES: z.string().default(APPLICATION_SERVICE_CLASSES.join(',')).transform(commaList),
});

const refinedEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.SESSION_IDLE_TIMEOUT_MINUTES < env.SESSION_ACCESS_TTL_MINUTES) {
    ctx.addIssue({
      code: 'custom',
      path: ['SESSION_IDLE_TIMEOUT_MINUTES'],
      message: 'must be at least SESSION_ACCESS_TTL_MINUTES',
    });
  }
  if (env.SESSION_ABSOLUTE_TIMEOUT_MINUTES < env.SESSION_IDLE_TIMEOUT_MINUTES) {
    ctx.addIssue({
      code: 'custom',
      path: ['SESSION_ABSOLUTE_TIMEOUT_MINUTES'],
      message: 'must be at least SESSION_IDLE_TIMEOUT_MINUTES',
    });
  }
  for (const login of ['APP', 'MIGRATION'] as const) {
    if (env[`DB_${login}_AUTH`] === 'password' && !env[`DB_${login}_PASSWORD`]) {
      ctx.addIssue({ code: 'custom', path: [`DB_${login}_PASSWORD`], message: `is required when DB_${login}_AUTH is password` });
    }
    // An access token is a credential: it never travels unencrypted.
    if (env[`DB_${login}_AUTH`] === 'azure-cli' && !env.DB_SSL) {
      ctx.addIssue({ code: 'custom', path: ['DB_SSL'], message: `must be true when DB_${login}_AUTH is azure-cli` });
    }
  }
  if (env.STORAGE_DRIVER === 'azure-blob' && !env.STORAGE_AZURE_ACCOUNT_URL) {
    ctx.addIssue({ code: 'custom', path: ['STORAGE_AZURE_ACCOUNT_URL'], message: 'is required when STORAGE_DRIVER is azure-blob' });
  }
  if (env.NODE_ENV === 'production') {
    // Uploads must be scanned for malware before anyone downloads them: only Azure Blob Storage (with Defender) is.
    if (env.STORAGE_DRIVER !== 'azure-blob') {
      ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'must be azure-blob in production' });
    }
    if (!env.SAML_IDP_METADATA_URL) {
      ctx.addIssue({ code: 'custom', path: ['SAML_IDP_METADATA_URL'], message: 'is required in production' });
    }
    for (const key of ['API_BASE_URL', 'APP_BASE_URL'] as const) {
      if (!isHttps(env[key])) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'must use https in production' });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvValidationError';
  }
}

/** Validates and types the environment. Error messages name keys, never values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = refinedEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    );
  }
  return result.data;
}

export function testSchemaFor(schema: string): string {
  return `${schema}_test`;
}
