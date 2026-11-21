import { join } from 'node:path';
import { SYNC_FILES, type SyncFile } from '../domain/sync-files.js';
import type { SyncReportData } from '../domain/sync-report.js';

/** The API accepts at most 500 rows and 1 MB per request; stay safely under both. */
export const MAX_BATCH_ROWS = 500;
export const MAX_BATCH_BYTES = 900_000;

export class SyncClientError extends Error {}

export interface SyncClientOptions {
  /** Folder holding the Node app's exports (business_application.json, ...) */
  dir: string;
  apiUrl: string;
  /** Personal TechCockpit API key of a system admin. Never logged. */
  apiKey: string;
  dryRun: boolean;
  maxBatchRows?: number;
  maxBatchBytes?: number;
}

export interface SyncClientDeps {
  fetch: typeof fetch;
  listFiles: (dir: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
  log: (line: string) => void;
}

interface RunResponse {
  id: string;
  status: string;
  dryRun: boolean;
  report: SyncReportData | null;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** The API URL; API keys only travel over https, except to this computer. */
export function checkApiUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SyncClientError(`${value} is not a valid URL`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
    throw new SyncClientError(`Use https for ${url.origin}: the API key must not travel unencrypted`);
  }
  return url;
}

/** Splits rows into requests under the row and size limits. */
export function batches<T>(rows: T[], maxRows = MAX_BATCH_ROWS, maxBytes = MAX_BATCH_BYTES, fileName = 'the export'): T[][] {
  const result: T[][] = [];
  let current: T[] = [];
  let size = 0;
  rows.forEach((row, index) => {
    const bytes = Buffer.byteLength(JSON.stringify(row));
    if (bytes > maxBytes) throw new SyncClientError(`Row ${index + 1} of ${fileName} is too large to send (${bytes} bytes)`);
    if (current.length > 0 && (current.length >= maxRows || size + bytes > maxBytes)) {
      result.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += bytes;
  });
  if (current.length > 0) result.push(current);
  return result;
}

async function readExports(dir: string, deps: SyncClientDeps): Promise<Map<SyncFile, Record<string, unknown>[]>> {
  const present = new Set(await deps.listFiles(dir));
  const files = new Map<SyncFile, Record<string, unknown>[]>();
  for (const file of SYNC_FILES) {
    const name = `${file}.json`;
    if (!present.has(name)) continue;
    let rows: unknown;
    try {
      rows = JSON.parse(await deps.readFile(join(dir, name)));
    } catch {
      throw new SyncClientError(`${name} is not valid JSON`);
    }
    if (!Array.isArray(rows) || rows.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
      throw new SyncClientError(`${name} must contain a JSON array of rows`);
    }
    files.set(file, rows as Record<string, unknown>[]);
  }
  if (files.size === 0) throw new SyncClientError(`No ServiceNow exports found in ${dir}. Expected files such as business_application.json.`);
  return files;
}

/** Loads the exports in `dir` into TechCockpit: start a run, send every export in batches, complete it. */
export async function runTrmSync(options: SyncClientOptions, deps: SyncClientDeps): Promise<RunResponse> {
  const base = checkApiUrl(options.apiUrl);
  const files = await readExports(options.dir, deps);
  const missing = SYNC_FILES.filter((file) => !files.has(file));
  deps.log(`Found ${files.size} export(s) in ${options.dir}.`);
  if (missing.length > 0) deps.log(`Not included: ${missing.join(', ')} (nothing is flagged missing for those).`);

  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    let response: Response;
    try {
      response = await deps.fetch(new URL(path, base), {
        method,
        headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new SyncClientError(`Cannot reach ${base.origin}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const payload = (await response.json().catch(() => ({}))) as { title?: string; detail?: string };
    if (response.ok) return payload as T;
    if (response.status === 401) throw new SyncClientError('The API key was not accepted. Create a new personal API key in TechCockpit (My API keys) and set TECHCOCKPIT_API_KEY.');
    if (response.status === 403) throw new SyncClientError('Only system administrators can load ServiceNow exports.');
    throw new SyncClientError(`The API refused the request (${response.status}): ${payload.detail ?? payload.title ?? 'no details'}`);
  };

  const run = await call<RunResponse>('POST', '/api/v1/trm/sync-runs', { dryRun: options.dryRun });
  deps.log(`Started ${options.dryRun ? 'dry run' : 'sync run'} ${run.id}.`);
  try {
    const expected: Partial<Record<SyncFile, number>> = {};
    for (const [file, rows] of files) {
      expected[file] = rows.length;
      deps.log(`Sending ${file}.json: ${rows.length} row(s)`);
      for (const records of batches(rows, options.maxBatchRows, options.maxBatchBytes, `${file}.json`)) {
        await call('PUT', `/api/v1/trm/sync-runs/${run.id}/records`, { file, records });
      }
    }
    return await call<RunResponse>('POST', `/api/v1/trm/sync-runs/${run.id}/complete`, { expected });
  } catch (error) {
    await call('POST', `/api/v1/trm/sync-runs/${run.id}/abandon`).catch(() => undefined);
    throw error;
  }
}

/** The run's report as text for the terminal. */
export function formatReport(run: { dryRun: boolean; report: SyncReportData | null }): string[] {
  const { report } = run;
  if (!report) return ['No report.'];
  const lines = [run.dryRun ? 'Dry run: nothing was changed.' : 'Changes applied.', 'Records:'];
  for (const r of report.records) {
    lines.push(
      `  ${r.recordType.padEnd(17)} received ${r.received}, new ${r.inserted}, changed ${r.updated}, unchanged ${r.unchanged}, now missing ${r.nowMissing}, back ${r.returned}${r.refreshed ? '' : ' (export not included)'}`,
    );
  }
  lines.push('Links:', ...report.links.map((link) => `  ${link.linkType} from ${link.source}: ${link.count}`));
  if (report.capabilityMismatches > 0) lines.push(`Capability fields that do not follow the tree: ${report.capabilityMismatches} application(s)`);
  if (report.capabilityIssues.length > 0) {
    lines.push(`Capability tree problems (${report.capabilityIssues.length}):`, ...report.capabilityIssues.map((i) => `  "${i.name}": ${i.problem}`));
  }
  if (report.unmatched.length > 0) {
    lines.push(`Not matched (${report.unmatched.length}):`, ...report.unmatched.map((u) => `  ${u.file} ${u.field} "${u.name}": ${u.problem} (${u.rows} rows)`));
  }
  if (report.skipped.length > 0) {
    lines.push(`Skipped rows (${report.skipped.length}):`, ...report.skipped.map((s) => `  ${s.file} row ${s.row}: ${s.reason}`));
  }
  if (report.truncated) lines.push('Lists were cut to the first 500 entries; see the sync run in TechCockpit.');
  return lines;
}
