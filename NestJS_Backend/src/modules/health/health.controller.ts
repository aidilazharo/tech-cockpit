import { EntityManager } from '@mikro-orm/postgresql';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodResponse } from '../../common/zod/index.js';
import { Public } from '../access/decorators.js';

const HealthSchema = z.object({ status: z.literal('ok'), database: z.literal('up') }).meta({ id: 'Health' });

@ApiTags('Health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly em: EntityManager) {}

  @Get()
  @Public('Liveness/readiness probe for App Service; reveals nothing beyond up/down')
  @ZodResponse({ status: 200, schema: HealthSchema, description: 'API and database are up' })
  async check() {
    try {
      await this.em.fork().getConnection().execute('select 1');
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
    return { status: 'ok' as const, database: 'up' as const };
  }
}
