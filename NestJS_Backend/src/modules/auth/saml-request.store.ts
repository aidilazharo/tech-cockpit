import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { CacheItem, CacheProvider } from '@node-saml/node-saml';
import { SamlRequest } from './auth.entities.js';

/** How long a user has to finish signing in at Okta (MFA included). */
export const SAML_REQUEST_TTL_MS = 10 * 60_000;

/**
 * node-saml's InResponseTo cache, in PostgreSQL so it works across App Service instances.
 * node-saml's own "remove" is ignored: an ID is consumed exactly once by consume(),
 * atomically, after the response has been fully validated (replay protection).
 */
@Injectable()
export class SamlRequestStore implements CacheProvider {
  constructor(private readonly em: EntityManager) {}

  async saveAsync(key: string, value: string): Promise<CacheItem | null> {
    const now = new Date();
    const em = this.em.fork();
    em.create(SamlRequest, { requestId: key, issuedAt: new Date(value), expiresAt: new Date(now.getTime() + SAML_REQUEST_TTL_MS) });
    await em.flush();
    return { value, createdAt: now.getTime() };
  }

  async getAsync(key: string): Promise<string | null> {
    const request = await this.em.fork().findOne(SamlRequest, { requestId: key, consumedAt: null, expiresAt: { $gt: new Date() } });
    return request ? request.issuedAt.toISOString() : null;
  }

  removeAsync(_key: string | null): Promise<string | null> {
    return Promise.resolve(null);
  }

  async setReturnTo(requestId: string, returnTo: string): Promise<void> {
    await this.em.fork().nativeUpdate(SamlRequest, { requestId }, { returnTo });
  }

  /** Marks the request answered. Returns its returnTo, or null if it was already used or expired. */
  async consume(requestId: string, now = new Date()): Promise<string | null> {
    const em = this.em.fork();
    const consumed = await em.nativeUpdate(
      SamlRequest,
      { requestId, consumedAt: null, expiresAt: { $gt: now } },
      { consumedAt: now },
    );
    if (consumed !== 1) return null;
    const request = await em.findOneOrFail(SamlRequest, { requestId });
    return request.returnTo;
  }

  /** Deletes requests that expired more than a day ago. */
  purgeExpired(now = new Date()): Promise<number> {
    return this.em.fork().nativeDelete(SamlRequest, { expiresAt: { $lt: new Date(now.getTime() - 24 * 3600_000) } });
  }
}
