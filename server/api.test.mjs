import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeApp } from './index.mjs';

test('SQLite-backed task API supports create/list/delete', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'atgv-sqlite-'));
  let client;
  let server;

  try {
    const result = await makeApp('file:' + join(folder, 'test.db'));
    client = result.client;
    server = result.app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const base = 'http://127.0.0.1:' + server.address().port;

    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    await health.arrayBuffer();

    const created = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Example task' }),
    });
    assert.equal(created.status, 201);
    const task = await created.json();
    assert.equal(task.title, 'Example task');

    const listed = await fetch(base + '/api/tasks');
    assert.equal(listed.status, 200);
    const all = await listed.json();
    assert.ok(all.some((row) => row.id === task.id));

    const deleted = await fetch(base + '/api/tasks/' + task.id, {
      method: 'DELETE',
    });
    assert.equal(deleted.status, 204);
    await deleted.arrayBuffer();
  } finally {
    // Release every HTTP connection and database handle before Windows cleanup.
    try {
      if (server?.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      }
    } finally {
      try {
        if (client) await client.close();
      } finally {
        // Node retries EBUSY, EPERM, and ENOTEMPTY when recursive is true.
        await rm(folder, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 200,
        });
      }
    }
  }
});
