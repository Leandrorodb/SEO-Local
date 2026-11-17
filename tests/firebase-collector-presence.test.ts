import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectorIsAvailable, collectorDocumentPath,
  isLocalCollectorOnline, COLLECTOR_HEARTBEAT_TTL_MS,
} from '../apps/firebase/collector-presence.js';

const now = Date.UTC(2026, 10, 17, 15, 0, 0);
const active = (at: number, override: Record<string, unknown> = {}) => ({
  provider: 'local_chrome_preview', mode: 'LOCAL_EXPERIMENTAL', state: 'ONLINE',
  heartbeat_at: { toMillis: () => at }, ...override,
});

test('collector presence: recent scoped Chrome heartbeat permits queuing', () => {
  assert.equal(collectorIsAvailable(active(now), now), true);
  assert.equal(collectorIsAvailable(active(now - 20_000), now), true);
});

test('collector presence: missing, expired, future, wrong provider and offline are unavailable', () => {
  assert.equal(collectorIsAvailable(null, now), false);
  assert.equal(collectorIsAvailable(active(now - COLLECTOR_HEARTBEAT_TTL_MS - 1), now), false);
  assert.equal(collectorIsAvailable(active(now + 30_000), now), false);
  assert.equal(collectorIsAvailable(active(now, { provider: 'dataforseo' }), now), false);
  assert.equal(collectorIsAvailable(active(now, { mode: 'SYNTHETIC_TEST' }), now), false);
  assert.equal(collectorIsAvailable(active(now, { state: 'OFFLINE' }), now), false);
  assert.equal(collectorIsAvailable(active(now, { heartbeat_at: null }), now), false);
});

test('collector presence: organization path rejects traversal', () => {
  assert.equal(collectorDocumentPath('tenant-1'), 'organizations/tenant-1/collector_state/local_chrome_preview');
  assert.throws(() => collectorDocumentPath('../tenant-2'));
  assert.throws(() => collectorDocumentPath(''));
});

test('collector presence: only reads the selected organization', async () => {
  let requested = '';
  const db = { doc: (path: string) => ({
    get: async () => { requested = path; return { data: () => active(now) }; },
  }) };
  assert.equal(await isLocalCollectorOnline(db, 'tenant-1', now), true);
  assert.equal(requested, 'organizations/tenant-1/collector_state/local_chrome_preview');
});
