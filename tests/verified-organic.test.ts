import test from 'node:test';
import assert from 'node:assert/strict';
import { cidFromResultUrl, stitchOrganicSnapshots } from '../packages/rank-providers/verified-organic.js';
const card = (id: number, name = `Empresa ${id}`, sponsored = false) => ({
  name, url: `https://www.google.com/maps/place/Empresa-${id}/data=!4m2!3m1!1s0x0:0x${id.toString(16)}`,
  detail: name, sponsored,
});
test('CID exato, com conferência de nome e sequência contínua', () => {
  const snapshots = [[card(1), card(2), card(3)], [card(2), card(3), card(4)], [card(3), card(4), card(5)]];
  const r = stitchOrganicSnapshots(snapshots, '4', 'EMPRESA 4');
  assert.equal(r.consecutive, true);
  assert.equal(r.targetIndex, 3);
  assert.deepEqual(r.organic.map(x => x.name), ['Empresa 1','Empresa 2','Empresa 3','Empresa 4','Empresa 5']);
});
test('Não inventa terceiro lugar se o CID da ficha não aparece', () => {
  const r = stitchOrganicSnapshots([[card(1), card(2), card(3)]], '99', 'Empresa 99');
  assert.equal(r.consecutive, true);
  assert.equal(r.targetIndex, -1);
});
test('CID em texto do concorrente não se transforma em identidade do cartão', () => {
  const fake = { ...card(3), detail: 'https://www.google.com/maps?cid=44' };
  const r = stitchOrganicSnapshots([[card(1),card(2),fake]], '44', 'Empresa 44');
  assert.equal(r.targetIndex, -1);
});
test('Sem sobreposição entre janelas não atribui posição numérica', () => {
  const r = stitchOrganicSnapshots([[card(1), card(2)], [card(3), card(4)]], '3', 'Empresa 3');
  assert.equal(r.consecutive, false);
  assert.equal(r.reason, 'DISCONTINUITY');
});
test('Anúncios identificados não entram na contagem orgânica', () => {
  const r = stitchOrganicSnapshots([[card(1),card(2,'Empresa 2',true),card(3)]], '3', 'Empresa 3');
  assert.equal(r.targetIndex, 1);
  assert.equal(r.organic.length, 2);
});
test('Mudança de ordem da lista invalida a medição', () => {
  const r = stitchOrganicSnapshots([[card(1),card(2),card(3)], [card(3),card(2),card(4)]], '3', 'Empresa 3');
  assert.equal(r.consecutive, false);
  assert.equal(r.reason, 'REORDERED');
});
test('Nome divergente para CID correspondente invalida a identidade', () => {
  const r = stitchOrganicSnapshots([[card(1),card(2),card(3,'Empresa Diferente')]], '3', 'Empresa 3');
  assert.equal(r.reason, 'MISSING_IDENTITY');
  assert.equal(r.targetIndex, -1);
});
test('Alteração do nome de um mesmo cartão ao rolar deixa medição inconclusiva', () => {
  const r = stitchOrganicSnapshots([[card(1),card(2)], [card(2,'Nome alterado'),card(3)]], '3', 'Empresa 3');
  assert.equal(r.consecutive, false);
  assert.equal(r.reason, 'AMBIGUOUS_CARD');
});
test('Um novo cartão que surge antes dos já vistos invalida a sequência', () => {
  const r = stitchOrganicSnapshots([[card(1),card(2),card(3)], [card(4),card(2),card(3)]], '3', 'Empresa 3');
  assert.equal(r.consecutive, false);
  assert.equal(r.reason, 'REORDERED');
});
test('URLs não confiáveis não podem fornecer CID ou posição', () => {
  assert.equal(cidFromResultUrl('https://evil.test/maps/place/Empresa/data=!4m2!3m1!1s0x0:0x1'), null);
  assert.equal(cidFromResultUrl('http://www.google.com/maps?cid=5'), null);
  assert.equal(cidFromResultUrl('https://www.google.com/maps?cid=18446744073709551616'), null);
  assert.equal(cidFromResultUrl('https://www.google.com/maps?cid=5'), '5');
});

// V4.8 regression: the list must not turn seventh place into third.
import { reconcileRepeatedPasses } from '../packages/rank-providers/verified-organic.js';
const snapshotsOf = (ids: number[]) => [ids.slice(0, 4).map((id) => card(id)),
  ids.slice(2, 7).map((id) => card(id)), ids.slice(5).map((id) => card(id))];

test('Seis orgânicos antes da empresa significam 7º, nunca 3º', () => {
  const snapshots = snapshotsOf([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const a = stitchOrganicSnapshots(snapshots, '7', 'Empresa 7');
  const b = stitchOrganicSnapshots(snapshots, '7', 'Empresa 7');
  const proof = reconcileRepeatedPasses(a, b);
  assert.equal(proof.accepted, true);
  assert.equal(proof.organicIndex + 1, 7);
  assert.equal(proof.visualIndex + 1, 7);
});

test('Se a segunda leitura pulou quatro resultados, não aceita o suposto 3º', () => {
  const actual = stitchOrganicSnapshots(snapshotsOf([1,2,3,4,5,6,7,8,9]), '7', 'Empresa 7');
  const missing = stitchOrganicSnapshots([[card(5),card(6),card(7),card(8)]], '7', 'Empresa 7');
  const proof = reconcileRepeatedPasses(actual, missing);
  assert.equal(proof.accepted, false);
  assert.equal(proof.organicIndex, -1);
});

test('Contagem visual e orgânica distinguem dois anúncios antes da pousada', () => {
  const cards = [card(1,'Empresa 1',true),card(2,'Empresa 2',true),
    card(3),card(4),card(5),card(6),card(7)];
  const a = stitchOrganicSnapshots([cards], '7', 'Empresa 7');
  const proof = reconcileRepeatedPasses(a,a);
  assert.equal(proof.accepted, true);
  assert.equal(proof.organicIndex + 1, 5);
  assert.equal(proof.visualIndex + 1, 7);
  assert.equal(proof.sponsoredBefore, 2);
});

test('Publicidade que muda de classificação torna toda a posição inconclusiva', () => {
  const a = stitchOrganicSnapshots([[card(1,'Empresa 1',true),card(2),card(3)]], '3', 'Empresa 3');
  const b = stitchOrganicSnapshots([[card(1,'Empresa 1',false),card(2),card(3)]], '3', 'Empresa 3');
  assert.equal(reconcileRepeatedPasses(a,b).accepted, false);
});

test('Sem 20 resultados não se pode afirmar que a empresa está ausente', () => {
  const a = stitchOrganicSnapshots([[card(1),card(2),card(3)]], '99', 'Empresa 99');
  assert.equal(reconcileRepeatedPasses(a,a).reason, 'INCOMPLETE_LIST');
});

test('Cartão duplicado na mesma janela não é uma segunda posição real', () => {
  const a = stitchOrganicSnapshots([[card(1),card(2),card(2),card(3)]], '3', 'Empresa 3');
  assert.equal(a.consecutive, false);
  assert.equal(reconcileRepeatedPasses(a,a).accepted, false);
});

test('Identidade por CID sem nome confirmado não valida posição', () => {
  const a = stitchOrganicSnapshots([[card(1),card(2),card(3)]], '3');
  assert.equal(a.consecutive, false);
  assert.equal(a.reason, 'MISSING_IDENTITY');
});
test('Uma única sobreposição ao rolar é insuficiente: pode haver cartões pulados', () => {
  const snapshots = [[card(1), card(2), card(3)], [card(3),card(7),card(8)]];
  const result = stitchOrganicSnapshots(snapshots, '7', 'Empresa 7');
  assert.equal(result.consecutive,false);
  assert.equal(result.targetIndex,-1);
  assert.equal(result.reason,'DISCONTINUITY');
});
