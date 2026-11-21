#!/usr/bin/env node
// Runs tsx (the DB CLI and scripts) with seed-random.cjs preloaded into every Node process it starts, including
// esbuild-wasm's. On the Windows laptop (Node 26) esbuild-wasm's first crypto.getRandomValues otherwise fails with
// ERR_OSSL_ENTROPY_SOURCE_STRENGTH_TOO_WEAK ("The service was stopped"). Harmless everywhere else.
//
// Usage (NestJS_Backend): node scripts/tsx.mjs <file.ts> [args]
import { fileURLToPath } from 'node:url';

// Forward slashes: NODE_OPTIONS treats a backslash inside quotes as an escape.
const seed = fileURLToPath(
  new URL('./seed-random.cjs', import.meta.url),
).replaceAll('\\', '/');
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require "${seed}"`]
  .filter(Boolean)
  .join(' ');

await import('tsx/cli');
