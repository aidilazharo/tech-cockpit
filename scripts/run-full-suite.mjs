#!/usr/bin/env node
// Runs the whole TechCockpit test suite (the 11 steps of the /commit skill) as ONE job, so an assistant (or you)
// starts it once and reads one summary line, instead of polling logs.
//
//   node scripts/run-full-suite.mjs                 all steps
//   node scripts/run-full-suite.mjs --only 1,2,6,7  only these steps
//   node scripts/run-full-suite.mjs --record        also create the "record the full test suite" commit
//   node scripts/run-full-suite.mjs --check-tests    only list test files the suite would never run (fast)
//   node scripts/run-full-suite.mjs --status         one line about the newest run (RUNNING step n of 11 ... / FINISHED: result)
//   node scripts/run-full-suite.mjs --status --after 5   wait 5 minutes (earlier if the run finishes), then print that line
//
// Writes test-reports/<YYYY-MM-DD-HHmm>/ (one log per step, status.txt, tests-block.txt) and
// test-reports/<YYYY-MM-DD-HHmm>.md (the report); both are git-ignored. Prints one line at the end:
//   RESULT: PASSED | FAILED | INCOMPLETE  (x passed, y failed, z not run)  report: <path>
// Exit code: 0 PASSED, 1 FAILED, 2 INCOMPLETE. Nothing is pushed. Windows (cmd/Git Bash) and Node only.
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, appendFileSync, statSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// Vitest loads itself twice when the working directory has a lower-case drive letter (d:\...).
const upperDrive = (path) => (process.platform === 'win32' ? path.replace(/^[a-z]:/, (d) => d.toUpperCase()) : path);
const root = upperDrive(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const BACKEND = 'NestJS_Backend';
const FRONTEND = 'ReactTS_Frontend';

const STEPS = [
  { id: 1, label: 'Backend lint', dir: BACKEND, cmd: 'npm run lint' },
  { id: 2, label: 'Backend types', dir: BACKEND, cmd: 'npm run typecheck' },
  { id: 3, label: 'Backend build', dir: BACKEND, cmd: 'npm run build' },
  { id: 4, label: 'Entities match migrations', dir: BACKEND, cmd: 'npm run db -- check', db: true },
  { id: 5, label: 'Backend unit, integration, API e2e + coverage', dir: BACKEND, cmd: 'npm run test:cov', db: true, kind: 'vitest' },
  { id: 6, label: 'Frontend lint', dir: FRONTEND, cmd: 'npm run lint' },
  { id: 7, label: 'Frontend types', dir: FRONTEND, cmd: 'npm run typecheck' },
  { id: 8, label: 'Frontend build', dir: FRONTEND, cmd: 'npm run build' },
  { id: 9, label: 'Frontend unit + coverage', dir: FRONTEND, cmd: 'npx vitest run --coverage --maxWorkers=1', kind: 'vitest' },
  { id: 10, label: 'Playwright (desktop, tablet, phone)', dir: FRONTEND, cmd: 'npm run test:e2e', kind: 'playwright', rerun: 'npx playwright test --last-failed --workers=1' },
  { id: 11, label: 'Real Okta sign-in', dir: FRONTEND, cmd: 'npm run test:e2e:okta', kind: 'playwright', okta: true },
];
const UNIT_FALLBACK = { id: '5u', label: 'Backend unit only (database not available)', dir: BACKEND, cmd: 'npm test', kind: 'vitest' };
// Not a code failure: the shared database cannot be reached or signed in to.
const DB_ERRORS = /AADSTS|CredentialUnavailable|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|password authentication failed|az login/;

const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, '');
const read = (file) => (existsSync(file) ? strip(readFileSync(file, 'utf8')) : '');

export function parseVitest(raw) {
  const text = strip(raw);
  const count = (word) => Number(text.match(new RegExp(`^\\s*Tests\\s[^\\n]*?(\\d+) ${word}`, 'm'))?.[1] ?? 0);
  const coverage = {};
  for (const [, name, pct] of text.matchAll(/^(Statements|Branches|Functions|Lines)\s*:\s*([\d.]+)%/gm)) coverage[name.toLowerCase()] = pct;
  const failures = [...new Set([...text.matchAll(/^\s+× (.+?)(?: \d+ms)?$/gm)].map((m) => m[1].trim()))];
  return { passed: count('passed'), failed: count('failed'), skipped: count('skipped'), coverage, failures };
}

export function parsePlaywright(raw) {
  const text = strip(raw);
  const count = (word) => Number(text.match(new RegExp(`^\\s+(\\d+) ${word}\\b`, 'm'))?.[1] ?? 0);
  const failures = [...new Set([...text.matchAll(/^\s+✘\s+\d+ (.+?)(?: \(\d[\d.]*m?s\))?$/gm)].map((m) => m[1].trim()))];
  return { passed: count('passed'), failed: count('failed'), flaky: count('flaky'), skipped: count('skipped'), failures };
}

const coverageNote = (c) => (c.statements ? `coverage statements ${c.statements}%, branches ${c.branches}%, functions ${c.functions}%, lines ${c.lines}%` : '');

// Test files are found by name and folder, so a new test only runs if it matches one of these (the include patterns
// of the Vitest and Playwright configs). When you add a new KIND of test, add its pattern here and a step above.
const TEST_FILE = /\.(spec|test|e2e-spec|int-spec)\.[cm]?[jt]sx?$/;
const RUN_BY = [
  [/^NestJS_Backend\/src\/.+\.spec\.ts$/, 5],
  [/^NestJS_Backend\/test\/integration\/.+\.int-spec\.ts$/, 5],
  [/^NestJS_Backend\/test\/e2e\/.+\.e2e-spec\.ts$/, 5],
  [/^ReactTS_Frontend\/src\/.+\.test\.tsx?$/, 9],
  [/^ReactTS_Frontend\/e2e\/.+\.(spec|test)\.[cm]?[jt]sx?$/, 10],
  [/^ReactTS_Frontend\/e2e-okta\/.+\.(spec|test)\.[cm]?[jt]sx?$/, 11],
];
const EXPECTED = 'backend: src/**/*.spec.ts, test/integration/**/*.int-spec.ts, test/e2e/**/*.e2e-spec.ts; frontend: src/**/*.test.ts(x), e2e/**/*.spec.ts, e2e-okta/**/*.spec.ts';
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', 'test-reports', 'playwright-report', 'test-results', '.vscode', 'storage']);

/** The step that runs this test file, or null when no step does. */
export const stepRunning = (relativePath) => RUN_BY.find(([pattern]) => pattern.test(relativePath))?.[1] ?? null;

export function testFiles(dir, prefix = '') {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...testFiles(join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (TEST_FILE.test(entry.name)) {
      found.push(`${prefix}${entry.name}`);
    }
  }
  return found;
}

export const orphanTests = (files) => files.filter((file) => stepRunning(file) === null);

// Per step, the number of tests that ran the last time the step passed; a drop is reported as a warning.
const COUNTS_FILE = join(root, 'test-reports', 'last-counts.json');

export function compareCounts(results, file = COUNTS_FILE) {
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const next = { ...previous };
  const warnings = [];
  for (const r of results) {
    const total = r.passed + r.failed + r.skipped;
    if (!r.step.kind || r.status !== 'PASSED' || total === 0) continue;
    const key = String(r.step.id);
    if (previous[key] > total) warnings.push(`${r.step.label}: ${total} tests ran, ${previous[key]} the last time (${previous[key] - total} fewer: deleted, moved out of the run, or skipped?)`);
    next[key] = total;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return warnings;
}

function probeDatabase() {
  const envFile = join(root, BACKEND, '.env');
  if (!existsSync(envFile)) return Promise.resolve({ ok: false, reason: `${BACKEND}/.env does not exist` });
  const env = parseEnv(readFileSync(envFile, 'utf8'));
  return new Promise((done) => {
    const socket = connect({ host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432), timeout: 8000 });
    socket.on('connect', () => (socket.destroy(), done({ ok: true })));
    socket.on('timeout', () => (socket.destroy(), done({ ok: false, reason: 'the shared database did not answer within 8 s (VPN or network?)' })));
    socket.on('error', (error) => done({ ok: false, reason: `the shared database is unreachable (${error.code})` }));
  });
}

function oktaUsersFilled() {
  const file = join(root, FRONTEND, '.env.e2e.local');
  if (!existsSync(file)) return { ok: false, reason: `${FRONTEND}/.env.e2e.local does not exist` };
  const env = parseEnv(readFileSync(file, 'utf8'));
  const filled = Object.keys(env).some((key) => /^E2E_.+_EMAIL$/.test(key) && env[key] && env[key.replace(/_EMAIL$/, '_PASSWORD')]);
  return filled ? { ok: true } : { ok: false, reason: 'no test user (email and password) filled in .env.e2e.local' };
}

const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim();

function runStep(step, logFile) {
  const fd = openSync(logFile, 'w');
  const { status } = spawnSync(step.cmd, { cwd: join(root, step.dir), shell: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  return status === 0;
}

function execute(step, folder, log) {
  const file = (suffix = '') => join(folder, `${String(step.id).padStart(2, '0')}-${step.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}${suffix}.log`);
  const logFile = file();
  const ok = runStep(step, logFile);
  const result = { step, status: ok ? 'PASSED' : 'FAILED', passed: 0, failed: 0, skipped: 0, notes: [], failures: [], logs: [logFile] };
  const text = read(logFile);
  if (step.kind === 'vitest') {
    const parsed = parseVitest(text);
    Object.assign(result, { passed: parsed.passed, failed: parsed.failed, skipped: parsed.skipped, failures: parsed.failures });
    if (coverageNote(parsed.coverage)) result.notes.push(coverageNote(parsed.coverage));
  } else if (step.kind === 'playwright') {
    let parsed = parsePlaywright(text);
    if (!ok && step.rerun) {
      const rerunLog = file('-rerun');
      const firstFailed = parsed.failed;
      const rerunOk = runStep({ ...step, cmd: step.rerun }, rerunLog);
      result.logs.push(rerunLog);
      const again = parsePlaywright(read(rerunLog));
      if (rerunOk) {
        result.status = 'PASSED';
        result.notes.push(`${firstFailed} flaky (failed with parallel workers, passed on the --last-failed --workers=1 rerun)`);
        parsed = { ...parsed, failed: 0, passed: parsed.passed + again.passed, flaky: firstFailed };
      } else {
        parsed = { ...parsed, failed: again.failed || parsed.failed, failures: again.failures.length ? again.failures : parsed.failures };
      }
    }
    Object.assign(result, { passed: parsed.passed, failed: parsed.failed, skipped: parsed.skipped, failures: parsed.failures });
    if (step.okta && ok && parsed.passed === 0 && parsed.skipped > 0) {
      result.status = 'NOT_RUN';
      result.notes.push('every journey skipped itself (test users not filled in)');
    }
  }
  if (result.status === 'FAILED' && step.db && DB_ERRORS.test(text)) {
    result.status = 'NOT_RUN';
    result.notes.push('database sign-in or network error (see log), not a code failure');
  }
  log(result);
  return result;
}

const label = (r) => `${r.step.id}`;

// One short line about the newest run, so checking on a long run costs a few dozen tokens instead of reading logs.
export function statusLine(reports = join(root, 'test-reports'), now = Date.now()) {
  const folders = existsSync(reports) ? readdirSync(reports, { withFileTypes: true }).filter((e) => e.isDirectory() && /^\d{4}-\d\d-\d\d-\d{4}$/.test(e.name)).map((e) => e.name).sort() : [];
  if (folders.length === 0) return 'no run found';
  const folder = join(reports, folders.at(-1));
  const statusFile = join(folder, 'status.txt');
  const done = (existsSync(statusFile) ? readFileSync(statusFile, 'utf8') : '').split(/\r?\n/).map((l) => l.match(/^(\w+) (PASSED|FAILED|NOT_RUN)/)).filter(Boolean);
  const count = (status) => done.filter((m) => m[2] === status).length;
  const totals = `${count('PASSED')} passed, ${count('FAILED')} failed${count('NOT_RUN') ? `, ${count('NOT_RUN')} not run` : ''}`;
  const report = `${folder}.md`;
  if (existsSync(report)) return `FINISHED: ${readFileSync(report, 'utf8').match(/^Result: (\w+)/m)?.[1] ?? 'unknown'}  (${totals})  report: ${report}`;
  const doneIds = new Set(done.map((m) => m[1]));
  const current = STEPS.find((step) => !doneIds.has(String(step.id)));
  const newest = Math.max(...[folder, ...readdirSync(folder).map((f) => join(folder, f))].map((p) => statSync(p).mtimeMs));
  const quiet = Math.round((now - newest) / 60e3);
  return `RUNNING: step ${current?.id ?? '?'} of ${STEPS.length} (${current?.label ?? 'wrapping up'}), ${totals}, last activity ${quiet} min ago${quiet > 30 ? ' (30+ min quiet: check that it is still running)' : ''}`;
}
const group = (results, ids) => {
  const rows = results.filter((r) => ids.includes(r.step.id));
  if (rows.length === 0) return 'not run';
  const bad = rows.filter((r) => r.status !== 'PASSED');
  return bad.length === 0 ? 'passed' : bad.map((r) => `${r.step.label} ${r.status.toLowerCase().replace('_', ' ')}`).join(', ');
};
const counts = (r) => (r ? `${r.passed} passed, ${r.failed} failed${r.notes.find((n) => n.startsWith('coverage')) ? `; ${r.notes.find((n) => n.startsWith('coverage'))}` : ''}` : 'not run');

function overall(results, orphans) {
  if (results.some((r) => r.status === 'FAILED')) return 'FAILED';
  const backendDb = results.filter((r) => r.step.db && r.status === 'NOT_RUN');
  return backendDb.length > 0 || orphans.length > 0 ? 'INCOMPLETE' : 'PASSED';
}

function testsBlock(results, result, stamp, warnings) {
  const find = (id) => results.find((r) => r.step.id === id || r.step.id === `${id}u`);
  const okta = find(11);
  const playwright = find(10);
  const failed = results.filter((r) => r.status === 'FAILED').flatMap((r) => (r.failures.length ? r.failures.map((f) => `- Failed: ${r.step.label} "${f}"`) : [`- Failed: ${r.step.label}`]));
  return [
    `Tests (full suite, ${stamp.date} ${stamp.time}): ${result}`,
    `- Backend lint, types, build, db check: ${group(results, [1, 2, 3, 4])}`,
    `- Backend unit, integration, API e2e: ${counts(find(5))}`,
    `- Frontend lint, types, build: ${group(results, [6, 7, 8])}`,
    `- Frontend unit: ${counts(find(9))}`,
    `- Playwright: ${playwright ? `${playwright.passed} passed, ${playwright.failed} failed${playwright.notes.find((n) => /flaky/.test(n)) ? ` (${playwright.notes.find((n) => /flaky/.test(n)).split(' ')[0]} flaky)` : ''}` : 'not run'}`,
    `- Okta sign-in: ${okta && okta.status !== 'NOT_RUN' ? `${okta.passed} passed, ${okta.failed} failed` : `not run (${okta?.notes[0] ?? 'step skipped'})`}`,
    ...failed,
    ...warnings.map((w) => `- Warning: ${w}`),
  ].join('\n');
}

function report(results, result, stamp, folder, warnings) {
  const rows = results.map((r) => `| ${r.step.id} | ${r.step.label} | ${r.status.replace('_', ' ')} | ${r.passed || ''} | ${r.failed || ''} | ${r.skipped || ''} | ${r.notes.join('; ')} |`);
  const failures = results
    .filter((r) => r.status === 'FAILED')
    .map((r) => [`### ${r.step.label}`, '', ...(r.failures.length ? r.failures.map((f) => `- ${f}`) : ['- see the log']), `- Log: ${r.logs.map((l) => l.replace(root, '.')).join(', ')}`, ''].join('\n'));
  const notRun = results.filter((r) => r.status === 'NOT_RUN').map((r) => `- ${r.step.label}: ${r.notes.join('; ')}`);
  const base = git('rev-parse', '--verify', '-q', 'origin/main') ? 'origin/main' : 'main';
  return [
    `# Test report: ${git('branch', '--show-current')} @ ${git('rev-parse', '--short', 'HEAD')}, ${stamp.date} ${stamp.time} MYT`,
    '',
    `Result: ${result}`,
    '',
    '| # | Layer | Result | Passed | Failed | Skipped | Notes |',
    '| - | ----- | ------ | ------ | ------ | ------- | ----- |',
    ...rows,
    '',
    '## Failures',
    '',
    ...(failures.length ? failures : ['None.', '']),
    '## Warnings',
    '',
    ...(warnings.length ? warnings.map((w) => `- ${w}`) : ['None.']),
    '',
    '## Not run',
    '',
    ...(notRun.length ? notRun : ['None.']),
    '',
    '## Commits in this execution',
    '',
    ...(git('log', '--oneline', `${base}..HEAD`) || '(none)').split('\n').map((l) => `- ${l}`),
    '',
    `Logs: ${folder.replace(root, '.')}`,
    '',
  ].join('\n');
}

export async function main(argv) {
  if (argv.includes('--status')) {
    const minutes = argv.includes('--after') ? Number(argv[argv.indexOf('--after') + 1]) : 0;
    const deadline = Date.now() + minutes * 60e3;
    // A dot every second keeps a terminal tool from treating the wait as idle and returning early (4 s was too slow).
    while (Date.now() < deadline && !statusLine().startsWith('FINISHED')) {
      process.stdout.write('.');
      await new Promise((resume) => setTimeout(resume, 1000));
    }
    console.log(`\n${statusLine()}`);
    return 'PASSED';
  }
  const only = argv.includes('--only') ? new Set(argv[argv.indexOf('--only') + 1].split(',').map(String)) : null;
  const record = argv.includes('--record');
  const orphans = orphanTests(testFiles(root));
  if (argv.includes('--check-tests')) {
    console.log(orphans.length ? `ORPHAN TEST FILES (${orphans.length}): the suite never runs these; move or rename them (${EXPECTED}):\n${orphans.map((f) => `  ${f}`).join('\n')}` : 'Every test file in the repository is run by a step of the suite.');
    return orphans.length ? 'INCOMPLETE' : 'PASSED';
  }
  const myt = new Date(Date.now() + 8 * 3600e3).toISOString();
  const stamp = { date: myt.slice(0, 10), time: myt.slice(11, 16) };
  const folder = join(root, 'test-reports', `${stamp.date}-${stamp.time.replace(':', '')}`);
  mkdirSync(folder, { recursive: true });
  const progress = (r) => appendFileSync(join(folder, 'status.txt'), `${r.step.id} ${r.status}${r.notes.length ? ` (${r.notes.join('; ')})` : ''}\n`);
  const results = [];
  const finish = (result) => (results.push(result), progress(result));

  let database;
  let okta;
  for (const step of STEPS) {
    if (only && !only.has(String(step.id))) continue;
    const skip = (reason) => finish({ step, status: 'NOT_RUN', passed: 0, failed: 0, skipped: 0, notes: [reason], failures: [], logs: [] });
    if (step.db) {
      database ??= await probeDatabase();
      if (!database.ok) {
        skip(database.reason);
        if (step.id === 5) execute(UNIT_FALLBACK, folder, finish);
        continue;
      }
    }
    if (step.okta) {
      okta ??= oktaUsersFilled();
      if (!okta.ok) {
        skip(okta.reason);
        continue;
      }
    }
    const result = execute(step, folder, finish);
    if (step.id === 5 && result.status === 'NOT_RUN') execute(UNIT_FALLBACK, folder, finish);
  }

  const warnings = [...orphans.map((file) => `test file never run by the suite: ${file} (expected ${EXPECTED})`), ...compareCounts(results)];
  const result = overall(results, orphans);
  const block = testsBlock(results, result, stamp, warnings);
  writeFileSync(join(folder, 'tests-block.txt'), `${block}\n`);
  const reportFile = `${folder}.md`;
  writeFileSync(reportFile, report(results, result, stamp, folder, warnings));

  if (record) {
    const message = join(root, '.git', 'AI_COMMIT_MSG.txt');
    writeFileSync(message, ['chore(git): record the full test suite before push', '', block, '', 'Co-authored-by: Copilot <copilot@github.com>', ''].join('\n'));
    spawnSync('git', ['commit', '--allow-empty', '-q', '-F', message], { cwd: root, stdio: 'inherit' });
    rmSync(message, { force: true });
  }

  const n = (status) => results.filter((r) => r.status === status).length;
  console.log(`RESULT: ${result}  (${n('PASSED')} passed, ${n('FAILED')} failed, ${n('NOT_RUN')} not run)  report: ${reportFile}${result === 'PASSED' ? '  -> safe to push' : ''}${warnings.length ? `  WARNINGS: ${warnings.length} (see report)` : ''}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const result = await main(process.argv.slice(2));
  process.exitCode = { PASSED: 0, FAILED: 1, INCOMPLETE: 2 }[result];
}
