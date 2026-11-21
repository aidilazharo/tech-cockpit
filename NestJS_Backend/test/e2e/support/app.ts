import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FILE_STORAGE, type FileStorage } from '../../../src/modules/storage/file-storage.js';
import { MikroORM } from '@mikro-orm/postgresql';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp, loggerLevels } from '../../../src/app.factory.js';
import { AppModule } from '../../../src/app.module.js';
import type { Env } from '../../../src/config/env.js';
import type { IdpMetadata } from '../../../src/modules/auth/idp-metadata.js';
import { IdpMetadataService, SsoUnavailableError } from '../../../src/modules/auth/idp-metadata.service.js';
import { loadTestEnv } from '../../setup/test-env.js';

/** Replaces the Okta metadata download; tests can switch SSO off or point it at the test IdP. */
export interface IdpStub {
  isConfigured: boolean;
  metadata: IdpMetadata | null;
  current: () => Promise<IdpMetadata>;
}

export interface TestApp {
  app: INestApplication;
  orm: MikroORM;
  env: Env;
  idp: IdpStub;
  http: () => ReturnType<typeof request>;
  close: () => Promise<void>;
}

export interface TestAppOptions {
  idpMetadata?: IdpMetadata;
  env?: Partial<Env>;
  /** Replaces where uploads are kept (e.g. an in-memory store whose malware scan the test controls) */
  storage?: FileStorage;
}

/**
 * Boots the real application against <DB_SCHEMA>_test. External services are replaced:
 * Okta metadata comes from the stub, never the network.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  // Public URLs are pinned so tests do not depend on a developer's .env.
  const env: Env = {
    ...loadTestEnv(),
    RATE_LIMIT_PER_MINUTE: 100_000,
    API_BASE_URL: 'http://localhost:3000',
    APP_BASE_URL: 'http://localhost:5173',
    FRONTEND_ORIGINS: ['http://localhost:5173'],
    // Uploads never land in the developer's ./storage folder.
    STORAGE_LOCAL_PATH: join(tmpdir(), `tc-e2e-storage-${randomUUID()}`),
    ...options.env,
  };
  const idp: IdpStub = {
    isConfigured: options.idpMetadata !== undefined,
    metadata: options.idpMetadata ?? null,
    current() {
      return this.metadata ? Promise.resolve(this.metadata) : Promise.reject(new SsoUnavailableError('IdP metadata is unavailable'));
    },
  };
  const builder = Test.createTestingModule({ imports: [AppModule.register(env)] })
    .overrideProvider(IdpMetadataService)
    .useValue(idp);
  const moduleRef = await (options.storage ? builder.overrideProvider(FILE_STORAGE).useValue(options.storage) : builder).compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestExpressApplication>({ logger: loggerLevels(env), bodyParser: false }),
    env,
  );
  await app.init();
  return {
    app,
    orm: app.get(MikroORM),
    env,
    idp,
    http: () => request(app.getHttpServer()),
    close: () => app.close(),
  };
}
