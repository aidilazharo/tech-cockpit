/**
 * Loads the product owner's ServiceNow exports (the Node app's JSON files) into TRM.
 * System admins only. The API key is read from the environment, never from the command
 * line, so it does not end up in shell history.
 *
 *   cmd:      set TECHCOCKPIT_API_KEY=<your personal API key>
 *   Git Bash: export TECHCOCKPIT_API_KEY=<your personal API key>
 *
 *   npm run trm:sync -- --dir <folder with the exports> [--api https://<techcockpit>] [--dry-run]
 */
import { readdir, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  formatReport,
  runTrmSync,
  SyncClientError,
} from '../modules/trm/cli/trm-sync-client.js';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    api: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const apiKey = process.env.TECHCOCKPIT_API_KEY;
const apiUrl =
  values.api ?? process.env.TECHCOCKPIT_API_URL ?? 'http://localhost:3000';

if (!values.dir || !apiKey) {
  console.error(
    'Usage: set TECHCOCKPIT_API_KEY, then: npm run trm:sync -- --dir <folder> [--api <url>] [--dry-run]',
  );
  process.exit(2);
}

try {
  const run = await runTrmSync(
    { dir: values.dir, apiUrl, apiKey, dryRun: values['dry-run'] },
    {
      fetch,
      listFiles: (dir) => readdir(dir),
      readFile: (path) => readFile(path, 'utf8'),
      log: (line) => console.log(line),
    },
  );
  for (const line of formatReport(run)) console.log(line);
} catch (error) {
  console.error(error instanceof SyncClientError ? error.message : error);
  process.exitCode = 1;
}
