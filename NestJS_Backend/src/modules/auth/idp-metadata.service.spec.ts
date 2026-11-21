import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdpMetadataService, SsoUnavailableError } from './idp-metadata.service.js';

const fixture = readFileSync(new URL('../../../test/fixtures/saml/okta-idp-metadata.xml', import.meta.url), 'utf8');
const DAY = 24 * 3600_000;

// A local stand-in for Okta's metadata endpoint; each test sets what it answers.
let reply: { status: number; body: string; chunked?: boolean } = { status: 200, body: fixture };
let hits = 0;
let server: Server;
let url: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    hits += 1;
    // Chunked: no content-length header, as some proxies send it.
    const length = reply.chunked ? {} : { 'content-length': Buffer.byteLength(reply.body) };
    res.writeHead(reply.status, { 'content-type': 'application/samlmetadata+xml', ...length }).end(reply.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/metadata`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  reply = { status: 200, body: fixture };
  hits = 0;
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('IdpMetadataService', () => {
  it('is not configured without a metadata URL, and then refuses to load', async () => {
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: undefined });

    expect(service.isConfigured).toBe(false);
    await expect(service.current()).rejects.toBeInstanceOf(SsoUnavailableError);
  });

  it('fetches once and serves the cached copy for a day', async () => {
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: url });
    const start = Date.now();

    const first = await service.current(start);
    const second = await service.current(start + DAY - 1);

    expect(first.entityId).toBe('http://www.okta.com/exkTEST000000000000');
    expect(second).toBe(first);
    expect(hits).toBe(1);
  });

  it('shares one fetch between concurrent callers', async () => {
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: url });

    await Promise.all([service.current(), service.current(), service.current()]);

    expect(hits).toBe(1);
  });

  it('refreshes after a day (picks up Okta certificate rotation)', async () => {
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: url });
    const start = Date.now();
    await service.current(start);
    reply = { status: 200, body: fixture.replaceAll('exkTEST000000000000', 'exkROTATED0000000000') };

    const refreshed = await service.current(start + DAY + 1);

    expect(refreshed.entityId).toBe('http://www.okta.com/exkROTATED0000000000');
    expect(hits).toBe(2);
  });

  it('keeps the last good metadata when a refresh fails, and waits before retrying', async () => {
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: url });
    const start = Date.now();
    const good = await service.current(start);
    reply = { status: 500, body: 'down' };

    expect(await service.current(start + DAY + 1)).toBe(good);
    expect(await service.current(start + DAY + 2)).toBe(good);
    expect(hits).toBe(2);
  });

  it.each([
    ['an error status', { status: 404, body: 'not found' }],
    ['invalid metadata', { status: 200, body: '<html>login page</html>' }],
    ['an oversized document', { status: 200, body: 'x'.repeat(1_000_001) }],
  ])('reports SSO as unavailable for %s with nothing cached', async (_label, response) => {
    reply = response;
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: url });
    const start = Date.now();

    await expect(service.current(start)).rejects.toBeInstanceOf(SsoUnavailableError);
    // No hammering of the IdP: within the retry wait it fails fast without a request.
    await expect(service.current(start + 1000)).rejects.toBeInstanceOf(SsoUnavailableError);
    expect(hits).toBe(1);
  });

  it('warns when an Okta signing certificate expires within 30 days', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: url });

    await service.current(Date.parse('2036-10-01T00:00:00Z'));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expires on 2036-10-18'));
  });

  it('loads metadata sent without a length (chunked)', async () => {
    reply = { status: 200, body: fixture, chunked: true };
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: url });

    expect((await service.current()).entityId).toBe('http://www.okta.com/exkTEST000000000000');
  });

  it.each([
    ['announces', false],
    ['sends without announcing', true],
  ])('refuses metadata that %s more than 1 MB', async (_how, chunked) => {
    reply = { status: 200, body: 'x'.repeat(1_048_577), chunked };
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: url });

    await expect(service.current()).rejects.toBeInstanceOf(SsoUnavailableError);
  });

  it('reports SSO as unavailable when the metadata host cannot be reached', async () => {
    const service = new IdpMetadataService({ SAML_IDP_METADATA_URL: 'http://127.0.0.1:1/metadata' });

    await expect(service.current()).rejects.toBeInstanceOf(SsoUnavailableError);
  });
});
