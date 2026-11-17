import test from 'node:test';
import assert from 'node:assert/strict';
import { localQueueProvider } from '../apps/firebase/queue-provider.js';

const presence = (time = Date.now()) => ({ provider: 'local_chrome_preview',
  mode: 'LOCAL_EXPERIMENTAL', state: 'ONLINE', heartbeat_at: { toMillis: () => time } });

test('queue mode does not enable a provider without explicit opt-in and active collector', async () => {
  const db = { doc: () => ({ get: async () => ({ data: () => presence() }) }) };
  assert.equal(await localQueueProvider(db, 'org1', {}), null);
  const offline = { doc: () => ({ get: async () => ({ data: () => presence(Date.now()-300_000) }) }) };
  assert.equal(await localQueueProvider(offline, 'org1', { RANK_QUEUE_MODE: 'local_collector' }), null);
});

test('online worker permits queue-only adapter, never direct Chrome or Maps lookup on API', async () => {
  const db = { doc: () => ({ get: async () => ({ data: () => presence() }) }) };
  const provider = await localQueueProvider(db, 'org1', { RANK_QUEUE_MODE: 'local_collector' });
  assert.equal(provider?.id, 'local_chrome_preview');
  assert.equal(provider?.enabled, true);
  assert.equal(provider?.maxCostMicros, 0);
  await assert.rejects(provider!.resolve('https://www.google.com/maps'), /LOCAL_COLLECTOR_RESOLVE_NOT_AVAILABLE/);
  await assert.rejects(provider!.measure({} as never, 'task'), /LOCAL_COLLECTOR_RUNS_ON_WORKER_ONLY/);
});
