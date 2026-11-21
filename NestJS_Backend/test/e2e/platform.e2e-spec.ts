import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createActor, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';

let t: TestApp;
let admin: Actor;
let plain: Actor;

beforeAll(async () => {
  t = await createTestApp();
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'admin' });
  plain = await createActor(t.orm, [], { label: 'plain' });
});

afterAll(async () => {
  await t.close();
});

describe('GET /api/v1/health', () => {
  it('is public and reports the database', async () => {
    const res = await t.http().get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });
});

describe('security baseline', () => {
  it('rejects requests without credentials with problem+json 401', async () => {
    const res = await t.http().get('/api/v1/me').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 401, title: 'Unauthorized', instance: '/api/v1/me' });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it.each([
    ['a malformed token', 'Bearer not-a-key'],
    ['a well-formed but unknown key', `Bearer tck_${'a'.repeat(16)}_${'b'.repeat(43)}`],
    ['a non-bearer scheme', 'Basic dXNlcjpwYXNz'],
  ])('rejects %s', async (_label, header) => {
    await t.http().get('/api/v1/me').set('Authorization', header).expect(401);
  });

  it('sets security headers and hides the framework', async () => {
    const res = await t.http().get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('returns 404 problem+json for unknown routes', async () => {
    const res = await t.http().get('/api/v1/nope').set(admin.auth).expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('rejects oversized bodies', async () => {
    await t
      .http()
      .post('/api/v1/departments')
      .set(admin.auth)
      .send({ code: 'big', name: 'x'.repeat(2_000_000) })
      .expect(413);
  });
});

describe('API documentation', () => {
  it('requires login', async () => {
    await t.http().get('/api/docs-json').expect(401);
  });

  it('requires the api-docs permission', async () => {
    await t.http().get('/api/docs-json').set(plain.auth).expect(403);
  });

  it('serves an OpenAPI 3 document to permitted users, with bearer security', async () => {
    const res = await t.http().get('/api/docs-json').set(admin.auth).expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toBe('AIA TechCockpit API');
    expect(Object.keys(res.body.paths)).toContain('/api/v1/roles');
    expect(res.body.components.securitySchemes).toHaveProperty('apiKey');
  });

  it('has only references that resolve to components/schemas', async () => {
    const res = await t.http().get('/api/docs-json').set(admin.auth).expect(200);
    const refs = [...JSON.stringify(res.body).matchAll(/"\$ref":"([^"]+)"/g)].map((match) => match[1]);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of new Set(refs)) {
      expect(ref, ref).toMatch(/^#\/components\/schemas\//);
      expect(res.body.components.schemas, ref).toHaveProperty(ref.slice('#/components/schemas/'.length));
    }
    expect(JSON.stringify(res.body)).not.toContain('"definitions"');
  });

  it('matches the committed openapi.json (run `npm run openapi` after API changes)', async () => {
    const res = await t.http().get('/api/docs-json').set(admin.auth).expect(200);
    expect(res.body).toEqual(JSON.parse(readFileSync('openapi.json', 'utf8')));
  });

  it('documents every operation with at least one success (2xx) or redirect (3xx) response', async () => {
    const res = await t.http().get('/api/docs-json').set(admin.auth).expect(200);
    for (const [path, operations] of Object.entries<Record<string, { responses: Record<string, unknown> }>>(res.body.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const codes = Object.keys(operation.responses ?? {});
        expect(codes.some((code) => /^[23]/.test(code)), `${method.toUpperCase()} ${path}`).toBe(true);
      }
    }
  });
});
