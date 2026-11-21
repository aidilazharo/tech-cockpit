import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodResponse } from '../../common/zod/index.js';
import { AuditResource, CurrentPrincipal, RequirePermission } from '../access/decorators.js';
import type { Principal } from '../access/principal.js';
import type { ApiKey } from './api-key.entity.js';
import { ApiKeyService } from './api-key.service.js';

const ApiKeySchemaOut = z
  .object({
    id: z.uuid(),
    name: z.string(),
    keyPrefix: z.string().describe('First characters of the token, to recognise the key'),
    expiresAt: z.date(),
    lastUsedAt: z.date().nullable(),
    revokedAt: z.date().nullable(),
    createdAt: z.date(),
  })
  .meta({ id: 'ApiKey' });

const CreatedApiKeySchema = ApiKeySchemaOut.extend({
  token: z.string().describe('Shown once. Store it securely; it cannot be retrieved again.'),
}).meta({ id: 'CreatedApiKey' });

const CreateApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    expiresInDays: z.number().int().min(1).max(365),
  })
  .strict()
  .meta({ id: 'CreateApiKey' });

const IdParam = z.uuid();

function view(key: ApiKey) {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: `tck_${key.keyId.slice(0, 6)}`,
    expiresAt: key.expiresAt,
    lastUsedAt: key.lastUsedAt ?? null,
    revokedAt: key.revokedAt ?? null,
    createdAt: key.createdAt,
  };
}

@ApiTags('API keys')
@AuditResource('api-key')
@Controller({ version: '1' })
export class ApiKeyController {
  constructor(private readonly keys: ApiKeyService) {}

  @Get('me/api-keys')
  @RequirePermission('apikey:own:manage')
  @ZodResponse({ status: 200, schema: z.object({ items: z.array(ApiKeySchemaOut) }), description: 'Your API keys' })
  async list(@CurrentPrincipal() principal: Principal) {
    return { items: (await this.keys.listOwn(principal)).map(view) };
  }

  @Post('me/api-keys')
  @RequirePermission('apikey:own:manage')
  @ZodResponse({ status: 201, schema: CreatedApiKeySchema, description: 'Created key, including the one-time token' })
  async create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateApiKeySchema) body: z.infer<typeof CreateApiKeySchema>) {
    const { key, token } = await this.keys.create(principal, body);
    return { ...view(key), token };
  }

  @Post('me/api-keys/:id/revoke')
  @HttpCode(200)
  @RequirePermission('apikey:own:manage')
  @ZodResponse({ status: 200, schema: ApiKeySchemaOut, description: 'Revoked key' })
  async revokeOwn(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return view(await this.keys.revoke(principal, id, true));
  }

  @Get('users/:id/api-keys')
  @RequirePermission('apikey:any:revoke')
  @ZodResponse({ status: 200, schema: z.object({ items: z.array(ApiKeySchemaOut) }), description: "A user's API keys (never the secrets)" })
  async listForUser(@ZodParam('id', IdParam) id: string) {
    return { items: (await this.keys.listForUser(id)).map(view) };
  }

  @Post('api-keys/:id/revoke')
  @HttpCode(200)
  @RequirePermission('apikey:any:revoke')
  @ZodResponse({ status: 200, schema: ApiKeySchemaOut, description: 'Revoked key' })
  async revokeAny(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return view(await this.keys.revoke(principal, id, false));
  }
}
