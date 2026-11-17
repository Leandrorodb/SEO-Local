import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalChromeCloudProvider, getCloudProvider, verifyPair, type Capture } from '../apps/firebase/provider.js';
import type { RankQuery } from '../packages/contracts/index.js';

test('LocalChromeCloudProvider: implements CloudProvider with 0 cost and proper activation', () => {
  const env = {
    RANK_PROVIDER: 'local_chrome_preview',
    LRT_LOCAL_EVAL: 'I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE',
    NODE_ENV: 'test',
  };
  const provider = new LocalChromeCloudProvider(env);
  assert.equal(provider.id, 'local_chrome_preview');
  assert.equal(provider.enabled, true);
  assert.equal(provider.demo, false);
  assert.equal(provider.maxCostMicros, 0);

  const selected = getCloudProvider(env);
  assert.equal(selected.id, 'local_chrome_preview');
  assert.equal(selected.enabled, true);

  const disabled = new LocalChromeCloudProvider({});
  assert.equal(disabled.enabled, false);
});

test('LocalChromeCloudProvider: verifyPair validates two captures from Chrome', () => {
  const query: RankQuery = {
    term: 'moto peças varginha',
    keywordId: 'kw-1',
    kind: 'COMMERCIAL',
    cluster: 'GERAL',
    surface: 'MAPS',
    device: 'desktop',
    language: 'pt-BR',
    lat: -21.5358,
    lng: -45.4482,
    depth: 20,
    cid: '11472765297648071940',
    placeId: 'ChIJ53a2JemTypQRBPW9vUBzN58',
    expectedName: 'Terremoto Moto Peças',
    point: 0,
    algorithmVersion: 'firebase-pair-v1',
  };

  const createCapture = (taskRef: string, pos = 1): Capture => ({
    observedAt: new Date().toISOString(),
    taskRef,
    depth: 20,
    complete: true,
    costMicros: 0,
    items: [
      { name: 'Terremoto Moto Peças', cid: '11472765297648071940', placeId: 'ChIJ53a2JemTypQRBPW9vUBzN58', position: pos, sponsored: false },
      { name: 'Concorrente Peças', cid: '222222', placeId: 'place-2', position: 2, sponsored: false },
    ],
    evidence: { source: 'local_chrome_preview', responseHash: 'hash-' + taskRef },
  });

  const first = createCapture('task-1:1', 1);
  const second = createCapture('task-1:2', 1);
  const verified = verifyPair(query, first, second);
  assert.equal(verified.status, 'VERIFIED');
  assert.equal(verified.position, 1);
  assert.equal(verified.identityMatch, 'cid:11472765297648071940');

  // Divergent positions must yield REVIEW and null position
  const divergent = createCapture('task-1:2', 3);
  const inconclusive = verifyPair(query, first, divergent);
  assert.equal(inconclusive.status, 'REVIEW');
  assert.equal(inconclusive.position, null);
});
