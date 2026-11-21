import { MikroOrmModule } from '@mikro-orm/nestjs';
import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodSerializerInterceptor } from './common/zod/index.js';
import type { Env } from './config/env.js';
import { EnvModule } from './config/env.module.js';
import { buildOrmConfig } from './database/orm-config.js';
import {
  DepartmentsController,
  FieldClassesController,
  MeController,
  PeopleController,
  RefusedSignInsController,
  RolesController,
  UsersController,
} from './modules/access/access.controllers.js';
import { AccessService } from './modules/access/access.service.js';
import { FieldClassRegistry, FieldClassService } from './modules/access/field-classes.js';
import { AuthService } from './modules/access/auth.service.js';
import { AuthGuard, PermissionGuard } from './modules/access/guards.js';
import { ApiKeyController } from './modules/api-keys/api-key.controller.js';
import { ApiKeyService } from './modules/api-keys/api-key.service.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { AuditController } from './modules/audit/audit.controller.js';
import { AuditInterceptor } from './modules/audit/audit.interceptor.js';
import { AuditService } from './modules/audit/audit.service.js';
import { AuthMaintenanceService } from './modules/auth/auth-maintenance.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { IdpMetadataService } from './modules/auth/idp-metadata.service.js';
import { SamlRequestStore } from './modules/auth/saml-request.store.js';
import { SamlService } from './modules/auth/saml.service.js';
import { SessionService } from './modules/auth/session.service.js';
import { SignInService } from './modules/auth/sign-in.service.js';
import { HealthController } from './modules/health/health.controller.js';
import { NotificationController } from './modules/notifications/notification.controller.js';
import { NotificationService } from './modules/notifications/notification.service.js';
import { PortfoliosModule } from './modules/portfolios/portfolios.module.js';
import { SadModule } from './modules/sad/sad.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { TrmModule } from './modules/trm/trm.module.js';

/** Platform services (audit, access, API keys, sessions, notifications) shared by every business module. */
@Global()
@Module({
  controllers: [
    MeController,
    RolesController,
    UsersController,
    DepartmentsController,
    PeopleController,
    RefusedSignInsController,
    FieldClassesController,
    ApiKeyController,
    AuditController,
    HealthController,
    NotificationController,
  ],
  providers: [AuditService, AccessService, ApiKeyService, SessionService, AuthService, NotificationService, FieldClassRegistry, FieldClassService],
  exports: [AuditService, AccessService, SessionService, AuthService, NotificationService, FieldClassRegistry, FieldClassService],
})
export class PlatformModule {}

/** Browser sign-in with Okta SAML 2.0. */
@Module({
  controllers: [AuthController],
  providers: [IdpMetadataService, SamlRequestStore, SamlService, SignInService, AuthMaintenanceService],
})
export class AuthModule {}

@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.register(env),
        MikroOrmModule.forRoot(buildOrmConfig(env, { login: 'app' })),
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: env.RATE_LIMIT_PER_MINUTE }] }),
        ScheduleModule.forRoot(),
        PlatformModule,
        StorageModule,
        AuthModule,
        ApprovalsModule,
        PortfoliosModule,
        TrmModule,
        SadModule,
      ],
      providers: [
        // Guards run in this order: rate limit -> authentication -> permission.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
        // Interceptors: audit wraps the serializer, so it records the final outcome.
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    };
  }
}
