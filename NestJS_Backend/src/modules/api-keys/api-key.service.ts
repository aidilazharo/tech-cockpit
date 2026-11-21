import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { ENV } from '../../config/env.module.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { User } from '../identity/user.entity.js';
import { generateApiKey, parseApiKey, secretMatches } from './api-key.crypto.js';
import { ApiKey } from './api-key.entity.js';

const MAX_ACTIVE_KEYS = 10;
// Writing lastUsedAt on every request would be a write per call; once a minute is enough.
const LAST_USED_RESOLUTION_MS = 60_000;

export interface AuthenticatedKey {
  userId: string;
  apiKeyId: string;
}

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Resolves a bearer token to its user, or null for unknown, revoked, expired or tampered keys. */
  async authenticate(token: string, now = new Date()): Promise<AuthenticatedKey | null> {
    const parsed = parseApiKey(token);
    if (!parsed) return null;
    const em = this.em.fork();
    const key = await em.findOne(ApiKey, { keyId: parsed.keyId });
    if (!key || key.revokedAt || key.expiresAt <= now || !secretMatches(parsed.secret, key.secretHash)) {
      return null;
    }
    if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
      await em.nativeUpdate(ApiKey, { id: key.id }, { lastUsedAt: now });
    }
    return { userId: key.user.id, apiKeyId: key.id };
  }

  /** Another user's keys, for administrators who may revoke them (leaver, suspected leak). */
  async listForUser(userId: string): Promise<ApiKey[]> {
    if ((await this.em.count(User, { id: userId })) === 0) throw new NotFoundException('User not found');
    return this.em.find(ApiKey, { user: userId }, { orderBy: { createdAt: 'desc' } });
  }

  listOwn(principal: Principal): Promise<ApiKey[]> {
    return this.em.find(ApiKey, { user: principal.user.id }, { orderBy: { createdAt: 'desc' } });
  }

  async create(principal: Principal, input: { name: string; expiresInDays: number }): Promise<{ key: ApiKey; token: string }> {
    if (principal.auth.method === 'api-key') {
      throw new ForbiddenException('API keys cannot be created while signed in with an API key. Sign in through the browser.');
    }
    if (input.expiresInDays > this.env.API_KEY_MAX_TTL_DAYS) {
      throw new BadRequestException(`API keys may last at most ${this.env.API_KEY_MAX_TTL_DAYS} days`);
    }
    const now = new Date();
    const active = await this.em.count(ApiKey, { user: principal.user.id, revokedAt: null, expiresAt: { $gt: now } });
    if (active >= MAX_ACTIVE_KEYS) {
      throw new ConflictException(`You already have ${MAX_ACTIVE_KEYS} active API keys. Revoke one first.`);
    }
    const generated = generateApiKey();
    const key = this.em.create(ApiKey, {
      user: this.em.getReference(User, principal.user.id),
      name: input.name,
      keyId: generated.keyId,
      secretHash: generated.secretHash,
      expiresAt: new Date(now.getTime() + input.expiresInDays * 86_400_000),
      createdBy: principal.user.id,
      updatedBy: principal.user.id,
    });
    await this.em.flush();
    await this.audit.recordChange(principal, 'api-key.created', 'api-key', key.id, {
      before: null,
      after: { name: key.name, expiresAt: key.expiresAt.toISOString() },
    });
    return { key, token: generated.token };
  }

  /** Revokes a key. `ownerOnly` limits it to the caller's own keys (404 otherwise: no leak). */
  async revoke(principal: Principal, id: string, ownerOnly: boolean): Promise<ApiKey> {
    const key = await this.em.findOne(ApiKey, ownerOnly ? { id, user: principal.user.id } : { id });
    if (!key) throw new NotFoundException('API key not found');
    if (!key.revokedAt) {
      key.revokedAt = new Date();
      key.revokedBy = principal.user.id;
      key.updatedBy = principal.user.id;
      await this.em.flush();
      await this.audit.recordChange(principal, 'api-key.revoked', 'api-key', key.id, {
        before: null,
        after: { revokedAt: key.revokedAt.toISOString() },
      });
    }
    return key;
  }
}
