import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { AppRequest } from './common/http/app-request.js';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';
import { hoistSchemaDefinitions } from './common/zod/index.js';
import { requestIdMiddleware } from './common/http/request-id.middleware.js';
import type { Env } from './config/env.js';
import { AuthService } from './modules/access/auth.service.js';
import { AuditService } from './modules/audit/audit.service.js';

export function buildOpenApiDocument(app: NestExpressApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('AIA TechCockpit API')
    .setDescription(
      'Enterprise technology one-stop centre: TRM, PMO, Tech Control Tower and vendor management. ' +
        'Errors use RFC 9457 application/problem+json.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'tck_<id>_<secret>', description: 'Personal API key' },
      'apiKey',
    )
    .addCookieAuth(
      'tc_access',
      { type: 'apiKey', in: 'cookie', description: 'Browser session from Okta sign-in (GET /api/v1/auth/saml/login)' },
      'session',
    )
    .addSecurityRequirements('apiKey')
    .addSecurityRequirements('session')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  hoistSchemaDefinitions(document as unknown as { components?: Record<string, unknown> });
  orderPathParameters(document);
  return document;
}

/**
 * Lists each operation's path parameters in the order of its path. Decorators are applied in a different order by the
 * build (tsc) and the tests (esbuild) once a route has three parameters, so the committed file must not depend on it.
 */
function orderPathParameters(document: OpenAPIObject): void {
  for (const [path, operations] of Object.entries(document.paths)) {
    // Nest gives every operation a parameter list (empty when it has none).
    for (const operation of Object.values(operations) as { parameters: { in: string; name: string }[] }[]) {
      const place = (parameter: { in: string; name: string }) => (parameter.in === 'path' ? path.indexOf(`{${parameter.name}}`) : Number.MAX_SAFE_INTEGER);
      operation.parameters = [...operation.parameters].sort((a, b) => place(a) - place(b));
    }
  }
}

function problem(res: Response, req: AppRequest, status: number, title: string, detail: string): void {
  res
    .status(status)
    .type('application/problem+json')
    .json({ type: 'about:blank', title, status, detail, instance: req.originalUrl.split('?')[0], requestId: req.id });
}

/** Swagger UI and JSON are behind login and the system:api-docs:read permission (all environments). */
export function protectDocs(app: Pick<NestExpressApplication, 'get'>) {
  const auth = app.get(AuthService);
  const audit = app.get(AuditService);
  return async (req: AppRequest, res: Response, next: NextFunction) => {
    try {
      const principal = await auth.authenticate(req);
      if (!principal) {
        await audit.recordSecurityEvent('auth.failed', req, 401, { reason: 'api docs' });
        return problem(res, req, 401, 'Unauthorized', 'Sign in or provide a valid API key.');
      }
      req.principal = principal;
      if (!principal.can('system:api-docs:read')) {
        await audit.recordSecurityEvent('access.denied', req, 403, { permission: 'system:api-docs:read' });
        return problem(res, req, 403, 'Forbidden', 'You do not have permission to do this.');
      }
      await audit.recordRequest(req, 200, 'api-docs');
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function loggerLevels(env: Pick<Env, 'NODE_ENV'>): ('log' | 'error' | 'warn')[] {
  return env.NODE_ENV === 'test' ? ['error', 'warn'] : ['log', 'error', 'warn'];
}

/** Builds the fully configured application (used by main.ts). */
export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), {
    logger: loggerLevels(env),
    bodyParser: false,
  });
  return configureApp(app, env);
}

/**
 * Applies TechCockpit's HTTP setup to a Nest application. Shared by createApp and the
 * e2e tests (which build the app from a testing module to replace external services).
 */
export function configureApp(app: NestExpressApplication, env: Env): NestExpressApplication {
  app.disable('x-powered-by');
  // App Service terminates TLS in front of the app; trust exactly one proxy hop for req.ip.
  app.set('trust proxy', 1);
  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Swagger UI inline styles
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.enableCors({ origin: env.FRONTEND_ORIGINS, credentials: true });
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: false });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  const document = buildOpenApiDocument(app);
  app.use(['/api/docs', '/api/docs-json'], protectDocs(app));
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json', customSiteTitle: 'TechCockpit API' });
  return app;
}
