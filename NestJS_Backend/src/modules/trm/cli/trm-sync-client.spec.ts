import { describe, expect, it, vi } from 'vitest';
import type { SyncReportData } from '../domain/sync-report.js';
import { batches, checkApiUrl, formatReport, runTrmSync, SyncClientError, type SyncClientDeps } from './trm-sync-client.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const REPORT: SyncReportData = {
  filesIncluded: ['business_application'],
  records: [{ recordType: 'applications', refreshed: true, received: 2, inserted: 1, updated: 1, unchanged: 0, nowMissing: 0, returned: 0 }],
  links: [{ linkType: 'application-service', source: 'ba_as_bs', count: 3 }],
  capabilityMismatches: 1,
  capabilityIssues: [{ name: 'Orphan', problem: 'parent-not-found' }],
  unmatched: [{ file: 'ba_as_bs', field: 'u_business_service_1', name: 'Nope', problem: 'not-found', rows: 2 }],
  skipped: [{ file: 'business_application', row: 3, reason: 'missing sys_id' }],
  truncated: false,
};

function fakeApi(overrides: Partial<Record<string, (body: unknown) => Response>> = {}) {
  const calls: { method: string; path: string; body: unknown; auth: string | null }[] = [];
  const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body, auth: new Headers(init?.headers).get('authorization') });
    const key = `${method} ${path.replace(/[0-9a-f-]{36}/, ':id')}`;
    const handler = overrides[key];
    if (handler) return handler(body);
    if (key === 'POST /api/v1/trm/sync-runs') return json(201, { id: '11111111-1111-4111-8111-111111111111', status: 'receiving' });
    if (key === 'PUT /api/v1/trm/sync-runs/:id/records') return json(200, { received: {} });
    if (key === 'POST /api/v1/trm/sync-runs/:id/complete') return json(200, { id: 'run', status: 'completed', dryRun: false, report: REPORT });
    if (key === 'POST /api/v1/trm/sync-runs/:id/abandon') return json(200, { status: 'abandoned' });
    return json(404, { title: 'Not Found' });
  });
  return { calls, fetch: fetchFn as unknown as typeof fetch };
}

function deps(files: Record<string, string>, api = fakeApi()): SyncClientDeps & { lines: string[]; api: ReturnType<typeof fakeApi> } {
  const lines: string[] = [];
  return {
    fetch: api.fetch,
    listFiles: async () => Object.keys(files),
    readFile: async (path: string) => files[path.split(/[\\/]/).pop()!],
    log: (line: string) => lines.push(line),
    lines,
    api,
  };
}

const options = { dir: '/exports', apiUrl: 'https://techcockpit.example.com', apiKey: 'tc_secret', dryRun: false };

describe('TRM sync client', () => {
  it('sends every export it finds in batches and completes the run with the row counts', async () => {
    const d = deps({
      'business_application.json': JSON.stringify([{ sys_id: 'a' }, { sys_id: 'b' }, { sys_id: 'c' }]),
      'ba_as_bs.json': JSON.stringify([{ u_business_application_1: 'A' }]),
      'notes.txt': 'ignored',
    });
    const run = await runTrmSync({ ...options, maxBatchRows: 2 }, d);
    expect(run.status).toBe('completed');
    const puts = d.api.calls.filter((c) => c.method === 'PUT');
    expect(puts.map((c) => [(c.body as { file: string }).file, (c.body as { records: unknown[] }).records.length])).toEqual([
      ['business_application', 2],
      ['business_application', 1],
      ['ba_as_bs', 1],
    ]);
    expect(d.api.calls.at(-1)).toMatchObject({ path: expect.stringContaining('/complete'), body: { expected: { business_application: 3, ba_as_bs: 1 } } });
    expect(d.api.calls.every((c) => c.auth === 'Bearer tc_secret')).toBe(true);
    expect(d.lines.join('\n')).toContain('Not included: mapped_application_service, business_service');
    expect(d.lines.join('\n')).not.toContain('tc_secret');
  });

  it('asks for a dry run when requested', async () => {
    const d = deps({ 'product_standard.json': '[]' });
    await runTrmSync({ ...options, dryRun: true }, d);
    expect(d.api.calls[0]).toMatchObject({ method: 'POST', body: { dryRun: true } });
    expect(d.api.calls.some((c) => c.method === 'PUT')).toBe(false); // an empty export sends nothing
  });

  it('stops before contacting the API when the folder has no exports or a file is not a JSON array', async () => {
    await expect(runTrmSync(options, deps({ 'other.json': '[]' }))).rejects.toThrow('No ServiceNow exports found in /exports');
    await expect(runTrmSync(options, deps({ 'business_application.json': '{"not":"a list"}' }))).rejects.toThrow('business_application.json must contain a JSON array of rows');
    await expect(runTrmSync(options, deps({ 'business_application.json': '[1]' }))).rejects.toThrow('business_application.json must contain a JSON array of rows');
    await expect(runTrmSync(options, deps({ 'business_application.json': 'not json' }))).rejects.toThrow('business_application.json is not valid JSON');
  });

  it('abandons the run and explains the problem when the API refuses a batch', async () => {
    const api = fakeApi({ 'PUT /api/v1/trm/sync-runs/:id/records': () => json(400, { title: 'Bad Request', detail: 'records.0: too long' }) });
    const d = deps({ 'business_application.json': '[{"sys_id":"a"}]' }, api);
    await expect(runTrmSync(options, d)).rejects.toThrow('The API refused the request (400): records.0: too long');
    expect(api.calls.at(-1)?.path).toContain('/abandon');
  });

  it('explains sign-in, permission and busy refusals', async () => {
    const refuse = (status: number) => deps({ 'business_application.json': '[]' }, fakeApi({ 'POST /api/v1/trm/sync-runs': () => json(status, { title: 'x', detail: 'Another run' }) }));
    await expect(runTrmSync(options, refuse(401))).rejects.toThrow('The API key was not accepted');
    await expect(runTrmSync(options, refuse(403))).rejects.toThrow('Only system administrators can load ServiceNow exports');
    await expect(runTrmSync(options, refuse(409))).rejects.toThrow('Another run');
    const offline = { ...deps({ 'business_application.json': '[]' }), fetch: (async () => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch };
    await expect(runTrmSync(options, offline)).rejects.toThrow('Cannot reach https://techcockpit.example.com: fetch failed');
    const odd = { ...deps({ 'business_application.json': '[]' }), fetch: (async () => Promise.reject('socket hang up')) as unknown as typeof fetch };
    await expect(runTrmSync(options, odd)).rejects.toThrow('Cannot reach https://techcockpit.example.com: socket hang up');
    const titleOnly = deps({ 'business_application.json': '[]' }, fakeApi({ 'POST /api/v1/trm/sync-runs': () => json(422, { title: 'Unprocessable Entity' }) }));
    await expect(runTrmSync(options, titleOnly)).rejects.toThrow('(422): Unprocessable Entity');
    const noBody = deps({ 'business_application.json': '[]' }, fakeApi({ 'POST /api/v1/trm/sync-runs': () => new Response('gateway error', { status: 502 }) }));
    await expect(runTrmSync(options, noBody)).rejects.toThrow('(502): no details');
  });

  it('only sends API keys over https, except to this computer', () => {
    expect(checkApiUrl('https://tc.example.com/').origin).toBe('https://tc.example.com');
    expect(checkApiUrl('http://localhost:3000').origin).toBe('http://localhost:3000');
    expect(checkApiUrl('http://127.0.0.1:3000').origin).toBe('http://127.0.0.1:3000');
    expect(() => checkApiUrl('http://tc.example.com')).toThrow(SyncClientError);
    expect(() => checkApiUrl('not a url')).toThrow('not a valid URL');
  });

  it('keeps every batch under the size and row limits', () => {
    const rows = [{ a: 'x'.repeat(40) }, { a: 'y'.repeat(40) }, { a: 'z' }];
    expect(batches(rows, 10, 100).map((b) => b.length)).toEqual([2, 1]);
    expect(batches(rows, 1, 1000).map((b) => b.length)).toEqual([1, 1, 1]);
    expect(() => batches([{ a: 'x'.repeat(200) }], 10, 100, 'ba_as_sm.json')).toThrow('Row 1 of ba_as_sm.json is too large to send');
  });

  it('summarises the report', () => {
    const text = formatReport({ dryRun: true, report: REPORT }).join('\n');
    expect(text).toContain('Dry run: nothing was changed');
    expect(text).toContain('applications');
    expect(text).toContain('Not matched (1)');
    expect(text).toContain('ba_as_bs u_business_service_1 "Nope": not-found (2 rows)');
    expect(text).toContain('Skipped rows (1)');
    expect(text).toContain('Capability fields that do not follow the tree: 1 application(s)');
    expect(text).toContain('Capability tree problems (1)');
    expect(formatReport({ dryRun: false, report: null })).toEqual(['No report.']);
    const quiet = formatReport({
      dryRun: false,
      report: { ...REPORT, records: [{ ...REPORT.records[0], refreshed: false }], capabilityMismatches: 0, capabilityIssues: [], unmatched: [], skipped: [], truncated: true },
    });
    expect(quiet[0]).toBe('Changes applied.');
    expect(quiet.join('\n')).toContain('(export not included)');
    expect(quiet.join('\n')).not.toContain('Not matched');
    expect(quiet.at(-1)).toContain('Lists were cut to the first 500 entries');
  });
});
