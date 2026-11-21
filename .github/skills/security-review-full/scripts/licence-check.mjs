#!/usr/bin/env node
// Checks the licence of every package in package-lock.json against TechCockpit policy.
// Usage: node licence-check.mjs <project-dir> [--json]
// Exit codes: 0 compliant, 1 denied licence in a production dependency, 2 error.
// "review" licences (weak copyleft, unknown) are reported but do not fail the run;
// ask the user before adding a new one.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ALLOWED = new Set([
  'MIT', 'MIT-0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'Zlib',
  'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', 'Python-2.0', 'CC-BY-4.0', 'OFL-1.1',
]);
const REVIEW = /^(MPL-|LGPL-|EPL-|CDDL-|CC-BY-SA-|Artistic-)/;
// Approved by the product owner (2026-10-21): MPL-2.0 for dev/build-time tools only
// (e.g. lightningcss inside Tailwind/Vite, @axe-core/playwright). Never in runtime code.
const DEV_ONLY_ALLOWED = /^MPL-2\.0$/;
const DENIED = /^(GPL-|AGPL-|SSPL-|BUSL-|Commons-Clause|SEE LICENSE IN)/i;

const dir = resolve(process.argv[2] ?? '.');
const asJson = process.argv.includes('--json');

/** Evaluates simple SPDX expressions: "A OR B", "A AND B", parentheses. */
export function classify(expression) {
  if (!expression) return 'review';
  const text = expression.replace(/[()]/g, ' ').trim();
  if (/\sOR\s/.test(text)) {
    const parts = text.split(/\s+OR\s+/).map(classify);
    return parts.includes('allowed') ? 'allowed' : parts.includes('review') ? 'review' : 'denied';
  }
  if (/\sAND\s/.test(text)) {
    const parts = text.split(/\s+AND\s+/).map(classify);
    return parts.includes('denied') ? 'denied' : parts.includes('review') ? 'review' : 'allowed';
  }
  const id = text.replace(/\+$/, '');
  if (ALLOWED.has(id)) return 'allowed';
  if (DENIED.test(id)) return 'denied';
  if (REVIEW.test(id)) return 'review';
  return 'review';
}

/** Licence from package metadata: SPDX string, legacy { type } or legacy `licenses` array. */
function licenceOf(meta) {
  if (typeof meta?.license === 'string') return meta.license;
  if (meta?.license?.type) return meta.license.type;
  if (Array.isArray(meta?.licenses) && meta.licenses.length > 0) {
    return meta.licenses.map((entry) => (typeof entry === 'string' ? entry : entry.type)).join(' OR ');
  }
  return undefined;
}

/** The lockfile drops legacy `licenses` arrays; read the installed package.json instead. */
function installedLicence(path) {
  try {
    return licenceOf(JSON.parse(readFileSync(join(dir, path, 'package.json'), 'utf8')));
  } catch {
    return undefined;
  }
}

try {
  const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
  const rows = [];
  for (const [path, info] of Object.entries(lock.packages ?? {})) {
    if (!path || info.link) continue;
    const name = info.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const licence = licenceOf(info) ?? installedLicence(path);
    const raw = classify(licence);
    const verdict = raw === 'review' && info.dev && DEV_ONLY_ALLOWED.test(licence ?? '') ? 'allowed' : raw;
    if (verdict !== 'allowed') {
      rows.push({ package: name, version: info.version, licence: licence ?? 'MISSING', verdict, dev: Boolean(info.dev) });
    }
  }
  const blocking = rows.filter((row) => row.verdict === 'denied' && !row.dev);
  if (asJson) {
    console.log(JSON.stringify({ findings: rows, blocking: blocking.length }, null, 2));
  } else {
    console.log(`Licence check: ${dir}`);
    for (const row of rows) {
      console.log(`- [${row.verdict.toUpperCase()}] ${row.package}@${row.version}${row.dev ? ' (dev)' : ''}: ${row.licence}`);
    }
    console.log(rows.length === 0 ? 'All licences allowed.' : `${rows.length} to review, ${blocking.length} blocking.`);
  }
  process.exit(blocking.length === 0 ? 0 : 1);
} catch (error) {
  console.error(`licence-check failed: ${error.message}`);
  process.exit(2);
}
