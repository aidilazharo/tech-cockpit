import { Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodResponse } from '../../common/zod/index.js';
import { AuditResource, CurrentPrincipal, RequirePermission } from '../access/decorators.js';
import type { Principal } from '../access/principal.js';
import type { Portfolio } from './portfolio.entity.js';
import {
  type CreatePortfolio,
  CreatePortfolioSchema,
  PortfolioListSchema,
  PortfolioSchemaOut,
  type UpdatePortfolio,
  UpdatePortfolioSchema,
} from './portfolio.schemas.js';
import { PortfolioService } from './portfolio.service.js';

const IdParam = z.uuid();
const view = (p: Portfolio) => ({ id: p.id, name: p.name, active: p.active, version: p.version });

@ApiTags('Portfolios')
@AuditResource('portfolio')
@Controller({ path: 'portfolios', version: '1' })
export class PortfolioController {
  constructor(private readonly portfolios: PortfolioService) {}

  @Get()
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: PortfolioListSchema, description: 'Portfolios, active and inactive' })
  async list(@CurrentPrincipal() principal: Principal) {
    return { items: (await this.portfolios.list(principal)).map(view) };
  }

  @Post()
  @RequirePermission('portfolio:portfolio:manage')
  @ZodResponse({ status: 201, schema: PortfolioSchemaOut, description: 'Created portfolio' })
  async create(@CurrentPrincipal() principal: Principal, @ZodBody(CreatePortfolioSchema) body: CreatePortfolio) {
    return view(await this.portfolios.create(principal, body));
  }

  @Patch(':id')
  @RequirePermission('portfolio:portfolio:manage')
  @ZodResponse({ status: 200, schema: PortfolioSchemaOut, description: 'Renamed, deactivated or reactivated' })
  async update(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdatePortfolioSchema) body: UpdatePortfolio) {
    return view(await this.portfolios.update(principal, id, body));
  }
}
