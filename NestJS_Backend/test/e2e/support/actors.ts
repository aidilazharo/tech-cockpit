import { randomUUID } from 'node:crypto';
import type { MikroORM } from '@mikro-orm/postgresql';
import { RoleAssignment } from '../../../src/modules/access/role-assignment.entity.js';
import { Role } from '../../../src/modules/access/role.entity.js';
import type { ScopeType } from '../../../src/modules/access/principal.js';
import { ApiKey } from '../../../src/modules/api-keys/api-key.entity.js';
import { generateApiKey } from '../../../src/modules/api-keys/api-key.crypto.js';
import { User } from '../../../src/modules/identity/user.entity.js';

export interface ActorRole {
  code: string;
  scopeType?: ScopeType;
  scopeId?: string | null;
  validFrom?: Date;
  validTo?: Date | null;
}

export interface Actor {
  id: string;
  /** Okta username: the same as the email for test users */
  username: string;
  email: string;
  token: string;
  auth: { Authorization: string };
}

/**
 * Creates a user with the given role assignments and a personal API key directly in
 * the test database (API keys cannot be minted through the API with an API key).
 */
export async function createActor(
  orm: MikroORM,
  roles: ActorRole[],
  options: { isExternal?: boolean; status?: 'active' | 'disabled'; label?: string } = {},
): Promise<Actor> {
  const em = orm.em.fork();
  const email = `${options.label ?? 'user'}-${randomUUID().slice(0, 8)}@test.aia.com`;
  const user = em.create(User, {
    username: email,
    email,
    firstName: options.label ?? 'Test',
    lastName: 'User',
    isExternal: options.isExternal ?? false,
    status: options.status ?? 'active',
  });
  for (const role of roles) {
    em.create(RoleAssignment, {
      user,
      role: await em.findOneOrFail(Role, { code: role.code }),
      scopeType: role.scopeType ?? 'global',
      scopeId: role.scopeId ?? null,
      validFrom: role.validFrom ?? new Date(Date.now() - 60_000),
      validTo: role.validTo ?? null,
    });
  }
  const key = generateApiKey();
  em.create(ApiKey, {
    user,
    name: 'e2e',
    keyId: key.keyId,
    secretHash: key.secretHash,
    expiresAt: new Date(Date.now() + 24 * 3600_000),
  });
  await em.flush();
  return { id: user.id, username: email, email, token: key.token, auth: { Authorization: `Bearer ${key.token}` } };
}

/** A role created for a test, with exactly the given permissions and data access. */
export async function createRole(
  orm: MikroORM,
  permissions: string[],
  dataAccess: Partial<Record<'financial' | 'contract' | 'personal', 'none' | 'own' | 'scope' | 'all'>> = {},
  options: { canActForStaff?: boolean } = {},
): Promise<string> {
  const em = orm.em.fork();
  const code = `test-${randomUUID().slice(0, 8)}`;
  em.create(Role, {
    code,
    name: code,
    permissions,
    dataAccess: { financial: 'none', contract: 'none', personal: 'none', ...dataAccess },
    canActForStaff: options.canActForStaff ?? false,
  });
  await em.flush();
  return code;
}
