import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalChromeCloudProvider, getCloudProvider, verifyPair, type Capture } from '../apps/firebase/provider.js';
import type { RankQuery } from '../packages/contracts/index.js';
import {readMapsContext} from '../packages/rank-providers/maps-context.js';

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
    evidence: { source: 'local_chrome_preview', responseHash: 'hash-' + taskRef,
      mapsContext:{...readMapsContext(`https://www.google.com/maps/search/${encodeURIComponent(query.term)}/@${query.lat},${query.lng},15z`,query.term,{width:1360,height:920})!,sessionId:taskRef} },
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
  // Even identical numeric readings cannot verify a different search area.
  const moved=createCapture('moved');moved.evidence.mapsContext=readMapsContext(
    'https://www.google.com/maps/search/moto+pe%C3%A7as+varginha/@-21.5604,-45.4568,14z',query.term,{width:1360,height:920})!;
  assert.equal(verifyPair(query,first,moved).reason,'MAPS_CONTEXT_MISMATCH');
  const resized=createCapture('resized');resized.evidence.mapsContext!.viewport.width=1200;
  assert.equal(verifyPair(query,first,resized).reason,'MAPS_CONTEXT_DIVERGENCE');
  const missing=createCapture('missing');delete missing.evidence.mapsContext;
  assert.equal(verifyPair(query,first,missing).position,null);
  const reused=createCapture('reused');reused.evidence.mapsContext!.sessionId=first.evidence.mapsContext!.sessionId;
  assert.equal(verifyPair(query,first,reused).reason,'REUSED_BROWSER_SESSION');
  const unconfirmed=createCapture('unconfirmed');delete unconfirmed.evidence.mapsContext!.sessionId;
  assert.equal(verifyPair(query,first,unconfirmed).reason,'MAPS_SESSION_UNCONFIRMED');
});
