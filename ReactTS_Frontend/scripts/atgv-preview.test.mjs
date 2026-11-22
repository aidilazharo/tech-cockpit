import assert from 'node:assert/strict';
import test from 'node:test';
import { atgvPreviewEnabled, createAtgvPreviewPlugin, mockAtgvResponse } from './atgv-preview.mjs';

test('preview is enabled only under ATGV and never in production', () => {
  assert.equal(atgvPreviewEnabled({}), false);
  assert.equal(atgvPreviewEnabled({ VITE_ATGV_PROJECT: 'tech-cockpit' }), true);
  assert.equal(atgvPreviewEnabled({ VITE_ATGV_PROJECT: 'tech-cockpit', NODE_ENV: 'production' }), false);
  assert.equal(atgvPreviewEnabled({ VITE_ATGV_PROJECT: 'tech-cockpit', ATGV_TECHCOCKPIT_REAL_API: '1' }), false);
});

test('mock session has a valid role and read-only permissions for the existing UI', () => {
  const response = mockAtgvResponse('GET', '/api/v1/me');
  assert.equal(response.status, 200);
  assert.ok(response.body.roles.length > 0);
  assert.ok(response.body.permissions.includes('trm:application:read'));
  assert.equal(response.body.isSystemAdmin, false);
  assert.equal(response.body.user.email.endsWith('.invalid'), true);
});

test('application list is paginated, filtered and contains synthetic records', () => {
  const all = mockAtgvResponse('GET', '/api/v1/trm/applications?page=1&pageSize=1');
  assert.equal(all.body.items.length, 1);
  assert.equal(all.body.total, 2);
  const filtered = mockAtgvResponse('GET', '/api/v1/trm/applications?q=payments');
  assert.equal(filtered.body.items.length, 1);
  assert.match(filtered.body.items[0].name, /MOCK/);
  const empty = mockAtgvResponse('GET', '/api/v1/trm/applications?q=real-customer');
  assert.equal(empty.body.total, 0);
});

test('synthetic application detail matches the required response structure', () => {
  const id = mockAtgvResponse('GET', '/api/v1/trm/applications').body.items[0].id;
  const response = mockAtgvResponse('GET', '/api/v1/trm/applications/' + id);
  assert.equal(response.status, 200);
  assert.equal(response.body.version, 1);
  assert.equal(response.body.trm.timeRating, 'invest');
  assert.equal(response.body.canEdit, false);
  assert.ok(Array.isArray(response.body.services));
});

test('unsupported endpoints fail clearly and writes are blocked', () => {
  assert.equal(mockAtgvResponse('PATCH', '/api/v1/trm/applications/123').status, 405);
  assert.equal(mockAtgvResponse('GET', '/api/v1/unknown').status, 501);
  assert.equal(mockAtgvResponse('GET', '/not-an-api'), null);
  assert.equal(mockAtgvResponse('POST', '/api/v1/auth/refresh').status, 200);
  assert.equal(mockAtgvResponse('POST', '/api/v1/auth/logout').status, 204);
});

test('preview plugin exposes the local middleware and identifying response header', () => {
  const plugin = createAtgvPreviewPlugin();
  assert.equal(plugin.apply, 'serve');
  let middleware;
  plugin.configureServer({ middlewares: { use: handler => { middleware = handler; } } });
  const headers = {};
  let body;
  const res = { setHeader(k, v) { headers[k] = v; }, end(value) { body = value; } };
  middleware({ method: 'GET', url: '/api/v1/health' }, res, () => assert.fail('must not proxy'));
  assert.equal(res.statusCode, 200);
  assert.equal(headers['x-techcockpit-atgv-preview'], 'synthetic-read-only');
  assert.equal(JSON.parse(body).database, 'mock');
});
