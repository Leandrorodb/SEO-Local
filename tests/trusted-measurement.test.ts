import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_PARSER_VERSION, maskLegacyBrowserRank, trustedMeasurement, trustedBrowserReport } from '../packages/domain/trusted-measurement.js';

test('As posições antigas do Chrome ficam em revisão, preservando histórico bruto', () => {
  const old = { id:'old', provider:'local_chrome_preview', parser_version:'v3.1', status:'VERIFIED', position:3, identity_match:'cid:123' };
  const safe = maskLegacyBrowserRank(old);
  assert.equal(safe.status,'REVIEW');
  assert.equal(safe.position,null);
  assert.equal(safe.legacy_unverified,true);
  assert.equal(old.position,3);
});
test('A nova prova mantém posição verificada', () => {
  const value = { provider:'local_chrome_preview', parser_version:BROWSER_PARSER_VERSION, status:'VERIFIED', position:7 };
  assert.equal(maskLegacyBrowserRank(value),value);
  assert.equal(trustedMeasurement(value),true);
});
test('Relatório antigo do Chrome não pode ser aprovado nem exportado', () => {
  assert.equal(trustedBrowserReport({ provider:'local_chrome_preview', rows:[{ provider:'local_chrome_preview', parser_version:'v3.1' }] }),false);
  assert.equal(trustedBrowserReport({ provider:'local_chrome_preview', rows:[{ provider:'local_chrome_preview', parser_version:BROWSER_PARSER_VERSION }] }),true);
  assert.equal(trustedBrowserReport({ provider:'local_chrome_preview', rows:[] }),false);
});
