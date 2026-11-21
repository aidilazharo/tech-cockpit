#!/usr/bin/env node
// Windows company laptop only. The network resets the download of Windows native npm packages, so after
// `npm ci --omit=optional` this copies the ones an earlier install already left on this disk into each
// project's node_modules. It never downloads anything and refuses to copy a version that does not match.
//
// Usage (repo root): node scripts/windows-native-bindings.mjs
// Source folder:     NATIVE_BINDINGS_SOURCE (default: the node_modules of D:\my-fow-technology-app-techassists\trm-web)
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.log('Not Windows x64: npm installs the native packages itself. Nothing to do.');
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.env.NATIVE_BINDINGS_SOURCE ?? 'D:/my-fow-technology-app-techassists/trm-web/node_modules');

// Each native package must have exactly the version of the package that loads it (`host`).
const rolldown = { name: '@rolldown/binding-win32-x64-msvc', host: 'rolldown' };
const projects = {
  NestJS_Backend: [rolldown],
  ReactTS_Frontend: [
    rolldown,
    { name: '@tailwindcss/oxide-win32-x64-msvc', host: '@tailwindcss/oxide' },
    { name: 'lightningcss-win32-x64-msvc', host: 'lightningcss' },
  ],
};

// A package can sit at the top of the source tree or, when two versions exist, beside the package that pins it.
const folders = [source, join(source, '@tailwindcss', 'node', 'node_modules')];

const versionOf = (dir) => {
  const file = join(dir, 'package.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).version : null;
};

let failed = false;
for (const [project, packages] of Object.entries(projects)) {
  const modules = join(root, project, 'node_modules');
  if (!existsSync(modules)) {
    console.log(`${project}: no node_modules yet, run "npm ci --omit=optional" first. Skipped.`);
    continue;
  }
  for (const { name, host } of packages) {
    const wanted = versionOf(join(modules, host));
    const from = folders.map((folder) => join(folder, name)).find((dir) => versionOf(dir) === wanted);
    if (!wanted || !from) {
      const found = folders.map((folder) => versionOf(join(folder, name))).filter(Boolean);
      console.error(`${project}: ${name} ${wanted ?? '(host missing)'} not found in ${source} (found: ${found.join(', ') || 'none'}).`);
      failed = true;
      continue;
    }
    const to = join(modules, name);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
    console.log(`${project}: ${name} ${wanted} copied`);
  }
}
process.exit(failed ? 1 : 0);
