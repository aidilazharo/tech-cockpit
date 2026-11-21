import { existsSync } from 'node:fs';
import { createApp } from './app.factory.js';
import { parseEnv } from './config/env.js';

// Local development reads .env; deployed environments use App Service settings / Key Vault.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const env = parseEnv(process.env);
const app = await createApp(env);
await app.listen(env.PORT);
