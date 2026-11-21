import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { RefusedSignIn } from '../identity/refused-sign-in.entity.js';
import { User } from '../identity/user.entity.js';
import type { SamlIdentity } from './saml-assertion.js';
import { type ClientInfo, SessionService, type SessionTokens } from './session.service.js';

export class AccountDisabledError extends Error {
  constructor(readonly userId: string) {
    super('The account is disabled');
    this.name = 'AccountDisabledError';
  }
}

/** Okta signed the person in, but nobody has added them in TechCockpit. */
export class NotRegisteredError extends Error {
  constructor(readonly username: string) {
    super('The user has not been added in TechCockpit');
    this.name = 'NotRegisteredError';
  }
}

export interface SignInResult {
  user: User;
  tokens: SessionTokens;
  /** The user's first sign-in */
  firstSignIn: boolean;
}

/**
 * Completes a verified Okta sign-in. Only people added in TechCockpit get in (matched by
 * Okta username); anyone else is refused and listed for administrators. Okta's email
 * replaces the stored one; names and the vendor flag are TechCockpit's.
 */
@Injectable()
export class SignInService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly sessions: SessionService,
  ) {}

  async signIn(identity: SamlIdentity, client: ClientInfo, now = new Date()): Promise<SignInResult> {
    const em = this.em.fork();
    const user = await em.findOne(User, { username: identity.username });
    if (!user) {
      await this.refuse(identity, now);
      throw new NotRegisteredError(identity.username);
    }
    if (user.status !== 'active') throw new AccountDisabledError(user.id);

    const firstSignIn = !user.lastLoginAt;
    const before = { email: user.email, emailFromOkta: user.emailFromOkta };
    if (identity.email) {
      user.email = identity.email;
      user.emailFromOkta = true;
    }
    user.lastLoginAt = now;
    user.updatedBy = user.id;
    await em.flush();
    if (before.email !== user.email || before.emailFromOkta !== user.emailFromOkta) {
      await this.audit.recordChange(null, 'user.updated', 'user', user.id, { before, after: { email: user.email, emailFromOkta: user.emailFromOkta } }, { source: 'okta' });
    }
    const tokens = await this.sessions.start(user.id, client, now);
    return { user, tokens, firstSignIn };
  }

  /** One entry per Okta username, counting attempts; a concurrent first attempt is counted once it exists. */
  private async refuse(identity: SamlIdentity, now: Date): Promise<void> {
    try {
      await this.recordRefusal(identity, now);
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationException)) throw error;
      await this.recordRefusal(identity, now);
    }
  }

  private async recordRefusal(identity: SamlIdentity, now: Date): Promise<void> {
    const em = this.em.fork();
    const entry = await em.findOne(RefusedSignIn, { username: identity.username });
    const seen = { email: identity.email, firstName: identity.firstName, lastName: identity.lastName, lastAttemptAt: now };
    if (entry) {
      entry.attempts += 1;
      Object.assign(entry, { ...seen, email: identity.email ?? entry.email });
    } else {
      em.create(RefusedSignIn, { username: identity.username, ...seen, firstAttemptAt: now });
    }
    await em.flush();
  }
}
