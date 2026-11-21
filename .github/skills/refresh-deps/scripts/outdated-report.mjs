#!/usr/bin/env node
// Classifies outdated direct dependencies as patch / minor / major and flags packages
// that look unmaintained. Never installs anything.
// Cooldown: only versions published at least N days ago are proposed (default 7), to
// avoid freshly published releases that may be compromised or quickly withdrawn.
// Usage: node outdated-report.mjs <project-dir> [--json] [--stale-months=18] [--cooldown-days=7]
// Exit codes: 0 report produced, 2 error.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? '.');
const asJson = process.argv.includes('--json');
const staleArg = process.argv.find((arg) => arg.startsWith('--stale-months='));
const STALE_MONTHS = staleArg ? Number(staleArg.split('=')[1]) : 18;
const cooldownArg = process.argv.find((arg) => arg.startsWith('--cooldown-days='));
const COOLDOWN_DAYS = cooldownArg ? Number(cooldownArg.split('=')[1]) : 7;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args) {
  try {
    return execFileSync(npm, args, { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    // `npm outdated` exits 1 when something is outdated; its JSON is still on stdout.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(version ?? '');
  return match ? { major: +match[1], minor: +match[2], patch: +match[3], pre: Boolean(match[4]) } : null;
}

function compare(a, b) {
  const x = parse(a);
  const y = parse(b);
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

/** Newest stable version older than the cooldown, above `current`, optionally within its major. */
export function pickVersion(times, current, sameMajor, cooldownDays, now = Date.now()) {
  const cutoff = now - cooldownDays * 86_400_000;
  const major = parse(current)?.major;
  const candidates = Object.entries(times)
    .filter(([version, published]) => {
      const p = parse(version);
      return p && !p.pre && Date.parse(published) <= cutoff && compare(version, current) > 0 && (!sameMajor || p.major === major);
    })
    .map(([version]) => version)
    .sort(compare);
  return candidates.at(-1) ?? null;
}

export function bumpType(current, target) {
  const a = parse(current);
  const b = parse(target);
  if (!a || !b || b.pre) return 'skip';
  if (b.major !== a.major) return b.major > a.major ? 'major' : 'skip';
  if (b.minor !== a.minor) return b.minor > a.minor ? 'minor' : 'skip';
  if (b.patch !== a.patch) return b.patch > a.patch ? 'patch' : 'skip';
  return 'current';
}

try {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const direct = { ...pkg.dependencies, ...pkg.devDependencies };
  const outdated = JSON.parse(run(['outdated', '--json']) || '{}');

  const safe = [];
  const majors = [];
  const waiting = [];
  for (const [name, info] of Object.entries(outdated)) {
    if (!(name in direct)) continue;
    const current = info.current;
    const times = JSON.parse(run(['view', name, 'time', '--json']) || '{}');
    const target = pickVersion(times, current, true, COOLDOWN_DAYS);
    const type = target ? bumpType(current, target) : 'current';
    if (type === 'patch' || type === 'minor') safe.push({ name, current, target, type });
    if (info.wanted !== current && target !== info.wanted) waiting.push({ name, version: info.wanted });
    const major = pickVersion(times, current, false, COOLDOWN_DAYS);
    if (major && bumpType(current, major) === 'major') majors.push({ name, current, latest: major });
  }

  const stale = [];
  const cutoff = Date.now() - STALE_MONTHS * 30 * 24 * 3600 * 1000;
  for (const name of Object.keys(direct)) {
    const modified = run(['view', name, 'time.modified']).trim();
    if (modified && Date.parse(modified) < cutoff) stale.push({ name, lastPublished: modified.slice(0, 10) });
  }

  const report = {
    project: dir,
    safeUpgrades: safe,
    installCommand: safe.length ? `npm install ${safe.map((u) => `${u.name}@${u.target}`).join(' ')}` : null,
    majorUpgrades: majors,
    inCooldown: waiting,
    possiblyUnmaintained: stale,
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Dependency report: ${dir}`);
    console.log(`\nPatch/minor (apply automatically):${safe.length ? '' : ' none'}`);
    for (const u of safe) console.log(`- ${u.name} ${u.current} -> ${u.target} (${u.type})`);
    if (report.installCommand) console.log(`  ${report.installCommand}`);
    console.log(`\nIn ${COOLDOWN_DAYS}-day cooldown (proposed once older):${waiting.length ? '' : ' none'}`);
    for (const w of waiting) console.log(`- ${w.name} ${w.version}`);
    console.log(`\nMajor (needs user approval):${majors.length ? '' : ' none'}`);
    for (const u of majors) console.log(`- ${u.name} ${u.current} -> ${u.latest}`);
    console.log(`\nNo release in ${STALE_MONTHS} months (check maintenance):${stale.length ? '' : ' none'}`);
    for (const s of stale) console.log(`- ${s.name} (last published ${s.lastPublished})`);
  }
} catch (error) {
  console.error(`outdated-report failed: ${error.message}`);
  process.exit(2);
}
