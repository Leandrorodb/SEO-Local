import test from 'node:test';
import assert from 'node:assert/strict';
import { rankingCsv } from '../apps/web/src/ranking-export.js';
import type { Rank } from '../apps/web/src/types.js';
const sample = (term: string, status: string, position: number | null): Rank => ({
  id: 'x', status, position, delta: null, provider: 'local_chrome_preview',
  observed_at: '2026-11-09T14:00:00Z', is_demo: true, result_depth: 20,
  query_snapshot: { term, kind: 'COMMERCIAL', cluster: 'Teste', surface: 'MAPS',
    lat: -21.69, lng: -45.25, point: 0, language: 'pt-BR', device: 'desktop', algorithmVersion: 'v3.1' },
});
test('CSV encodes verified positions without fabricating inconclusive ranks', () => {
  const csv = rankingCsv([sample('pousada em Lavras', 'VERIFIED', 1), sample('hotel em Lavras', 'PARTIAL_RESULTS', null)]);
  assert.match(csv, /"pousada em Lavras";"Teste"/);
  assert.match(csv, /"1";"VERIFIED"/);
  assert.match(csv, /"";"PARTIAL_RESULTS"/);
  assert.match(csv, /"SIM"/);
});
test('CSV escapes spreadsheet injection and quotes', () => {
  const csv = rankingCsv([sample('=HYPERLINK("evil")', 'REVIEW', null)]);
  assert.match(csv, /"'=HYPERLINK\(""evil""\)"/);
});
