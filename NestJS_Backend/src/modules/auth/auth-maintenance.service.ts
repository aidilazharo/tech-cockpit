import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { REFUSED_SIGN_IN_RETENTION_DAYS, RefusedSignIn } from '../identity/refused-sign-in.entity.js';
import { SamlRequestStore } from './saml-request.store.js';
import { SessionService } from './session.service.js';

/** Ended sessions are kept this long (the audit log keeps sign-in history permanently). */
export const SESSION_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Housekeeping for sign-in data. */
@Injectable()
export class AuthMaintenanceService {
  private readonly logger = new Logger(AuthMaintenanceService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly sessions: SessionService,
    private readonly requests: SamlRequestStore,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'auth-housekeeping' })
  async run(now = new Date()): Promise<{ sessions: number; requests: number; refusedSignIns: number }> {
    const sessions = await this.sessions.purgeEnded(SESSION_RETENTION_DAYS, now);
    const requests = await this.requests.purgeExpired(now);
    // Refused sign-ins hold personal data of people who are not users: kept 90 days after the last attempt.
    const refusedSignIns = await this.em.fork().nativeDelete(RefusedSignIn, { lastAttemptAt: { $lt: new Date(now.getTime() - REFUSED_SIGN_IN_RETENTION_DAYS * DAY_MS) } });
    if (sessions + requests + refusedSignIns > 0) {
      this.logger.log(`Removed ${sessions} ended session(s), ${requests} expired SAML request(s) and ${refusedSignIns} old refused sign-in(s)`);
    }
    return { sessions, requests, refusedSignIns };
  }
}
