/**
 * Adds (or reuses) a user, gives them the system-admin role and issues a personal API key.
 * This is how the first administrator is made: run it with their Okta username (only added
 * people can sign in). API keys cannot create API keys. Prints the token once; it cannot be
 * retrieved later.
 *
 *   npm run bootstrap:admin -- --username <okta username> --email you@aia.com [--first-name You --last-name Name] [--days 30]
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { MikroORM } from '@mikro-orm/postgresql';
import { parseEnv } from '../config/env.js';
import { buildOrmConfig } from '../database/orm-config.js';
import { RoleAssignment } from '../modules/access/role-assignment.entity.js';
import { Role } from '../modules/access/role.entity.js';
import { generateApiKey } from '../modules/api-keys/api-key.crypto.js';
import { ApiKey } from '../modules/api-keys/api-key.entity.js';
import { AuditLog } from '../modules/audit/audit-log.entity.js';
import { User } from '../modules/identity/user.entity.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const env = parseEnv(process.env);
const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    email: { type: 'string' },
    'first-name': { type: 'string' },
    'last-name': { type: 'string' },
    days: { type: 'string', default: '30' },
  },
});

const username = values.username?.trim().toLowerCase();
const email = values.email?.trim().toLowerCase();
const days = Number(values.days);
if (!username || /\s/.test(username) || !email || !Number.isInteger(days) || days < 1 || days > env.API_KEY_MAX_TTL_DAYS) {
  console.error(`Usage: --username <okta username> --email <email> [--first-name <name>] [--last-name <name>] [--days 1-${env.API_KEY_MAX_TTL_DAYS}]`);
  process.exit(2);
}

const orm = await MikroORM.init(buildOrmConfig(env, { login: 'app' }));
try {
  const em = orm.em.fork();
  const role = await em.findOneOrFail(Role, { isSystemAdmin: true });
  let user = await em.findOne(User, { username });
  if (!user) {
    user = em.create(User, { username, email, firstName: values['first-name'] ?? '', lastName: values['last-name'] ?? '', isExternal: false });
  }
  if (user.isExternal) {
    throw new Error('External users cannot be system administrators');
  }
  user.status = 'active';
  const now = new Date();
  const hasRole = await em.count(RoleAssignment, {
    user,
    role,
    validFrom: { $lte: now },
    $or: [{ validTo: null }, { validTo: { $gt: now } }],
  });
  if (!hasRole) {
    em.create(RoleAssignment, { user, role, scopeType: 'global', scopeId: null, validFrom: now });
  }
  const key = generateApiKey();
  const apiKey = em.create(ApiKey, {
    user,
    name: 'bootstrap',
    keyId: key.keyId,
    secretHash: key.secretHash,
    expiresAt: new Date(now.getTime() + days * 86_400_000),
  });
  await em.flush();
  em.create(AuditLog, {
    action: 'bootstrap.admin',
    resourceType: 'user',
    resourceId: user.id,
    metadata: { username, apiKeyId: apiKey.id, expiresAt: apiKey.expiresAt.toISOString() },
  });
  await em.flush();

  console.log(`System administrator: ${username}`);
  console.log(`API key (expires ${apiKey.expiresAt.toISOString()}). Shown once — store it in a password manager:`);
  console.log(key.token);
} finally {
  await orm.close(true);
}
