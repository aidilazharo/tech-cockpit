/**
 * Writes the OpenAPI document to openapi.json (committed). The frontend API client is
 * generated from this file, and an e2e test fails when it drifts from the running API.
 *
 *   npm run openapi
 */
import { existsSync, writeFileSync } from 'node:fs';
import { buildOpenApiDocument, createApp } from '../app.factory.js';
import { parseEnv } from '../config/env.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const app = await createApp({ ...parseEnv(process.env), NODE_ENV: 'test' });
try {
  writeFileSync('openapi.json', `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
  console.log('Wrote openapi.json');
} finally {
  await app.close();
}
