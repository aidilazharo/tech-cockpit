import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { trmVisibility } from '../trm/trm-visibility.js';
import { TrmApplicationPortfolio } from '../trm/trm.entities.js';
import { Portfolio } from './portfolio.entity.js';
import type { CreatePortfolio, UpdatePortfolio } from './portfolio.schemas.js';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  /** Every portfolio for company-wide TRM viewers and portfolio maintainers; otherwise the portfolios of the applications in scope. */
  async list(principal: Principal): Promise<Portfolio[]> {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    if (visibility.all || principal.can('portfolio:portfolio:manage')) return em.find(Portfolio, {}, { orderBy: { name: 'asc' } });
    const links = await em.find(TrmApplicationPortfolio, { application: { $in: [...visibility.applications] } }, { populate: ['portfolio'] });
    return [...new Map(links.map((link) => [link.portfolio.id, link.portfolio])).values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(principal: Principal, input: CreatePortfolio): Promise<Portfolio> {
    const em = this.em.fork();
    const portfolio = em.create(Portfolio, { name: input.name, createdBy: principal.user.id, updatedBy: principal.user.id });
    await em.flush();
    await this.audit.recordChange(principal, 'portfolio.created', 'portfolio', portfolio.id, { before: null, after: { name: portfolio.name, active: true } });
    return portfolio;
  }

  async update(principal: Principal, id: string, input: UpdatePortfolio): Promise<Portfolio> {
    const em = this.em.fork();
    const portfolio = await em.findOne(Portfolio, id);
    if (!portfolio) throw new NotFoundException('Portfolio not found');
    await em.lock(portfolio, LockMode.OPTIMISTIC, input.version);
    const before = { name: portfolio.name, active: portfolio.active };
    if (input.name !== undefined) portfolio.name = input.name;
    if (input.active !== undefined) portfolio.active = input.active;
    portfolio.updatedBy = principal.user.id;
    await em.flush();
    await this.audit.recordChange(principal, 'portfolio.updated', 'portfolio', id, { before, after: { name: portfolio.name, active: portfolio.active } });
    return portfolio;
  }
}
