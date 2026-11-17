import test from 'node:test';
import assert from 'node:assert/strict';
import { detectNiche, listNiches, suggestKeywords } from '../packages/domain/auto-keywords.js';

test('catalog has 30+ reusable categories without any tenant or company-specific records', () => {
  assert.ok(listNiches().length >= 30);
  assert.equal(new Set(listNiches().map((n) => n.value)).size, listNiches().length);
});
test('pousada auto-detection uses real name and city without inventing amenities', () => {
  const r = suggestKeywords({ name: 'Pousada Muro de Pedra', city: 'São Thomé das Letras/MG' });
  assert.equal(r.classification.niche, 'pousada');
  assert.ok(r.terms.some((t) => t.query === 'pousada em São Thomé das Letras'));
  assert.ok(r.terms.some((t) => t.query.includes('Pousada Muro de Pedra')));
  assert.equal(r.terms.some((t) => /piscina|hidromassagem|café da manhã grátis/i.test(t.query)), false);
});
test('medical clinic generates only category and explicitly confirmed services', () => {
  const r = suggestKeywords({
    name: 'Clínica Dra. Sâmea Marques - Emagrecimento, Longevidade e Estética',
    city: 'Natal/RN',
    services: ['calorimetria'],
  });
  assert.equal(r.classification.niche, 'clinica_emagrecimento');
  assert.ok(r.terms.some((t) => t.query === 'calorimetria em Natal'));
  assert.ok(!r.terms.some((t) => /botox|cirurgia|implante/i.test(t.query)));
});
test('unidentified segment is explicitly marked for operator classification', () => {
  const r = suggestKeywords({ name: 'Empresa Horizonte', city: 'Lavras/MG' });
  assert.equal(r.classification.confidence, 'unconfirmed');
  assert.equal(r.classification.niche, 'generico');
  assert.match(r.notice, /Confirme a categoria/);
});
test('explicit category overrides name inference, trims services, caps count and avoids duplicates', () => {
  const r = suggestKeywords({ name: 'Alfa', city: 'Varginha/MG', niche: 'otica', services: ['óculos de sol', 'óculos de sol'], limit: 10 });
  assert.equal(r.classification.confidence, 'operator');
  assert.equal(r.terms.length, 10);
  assert.equal(new Set(r.terms.map((t) => t.query)).size, r.terms.length);
});
test('unknown category never silently degrades to generic category', () => {
  assert.throws(() => suggestKeywords({ name: 'Empresa X', city: 'Natal', niche: 'nicho inventado' }), /UNKNOWN_NICHE/);
});

test('confirmed neighborhood and services create local strategic clusters without invented amenities', () => {
  const r = suggestKeywords({ name: 'Pousada Recanto', city: 'São Thomé das Letras/MG',
    neighborhood: 'Sobradinho', services: ['chalé com varanda'], limit: 60 });
  assert.ok(r.terms.some((t) => t.query.includes('Sobradinho')));
  assert.ok(r.terms.some((t) => t.query === 'chalé com varanda em São Thomé das Letras'));
  assert.ok(!r.terms.some((t) => /piscina|hidromassagem/i.test(t.query)));
});
test('invalid neighborhood rejected instead of injecting terms', () => {
  assert.throws(() => suggestKeywords({ name: 'Pousada', city: 'Lavras/MG', neighborhood: '<script>' }),
    /INVALID_NEIGHBORHOOD/);
});
test('categoria real detectada no Maps identifica nicho quando nome comercial não informa setor', () => {
  const r = suggestKeywords({ name: 'Horizonte Azul', city: 'Capitólio/MG', primaryCategory: 'Pousada', limit: 25 });
  assert.equal(r.classification.niche, 'pousada');
  assert.equal(r.classification.confidence, 'category_match');
  assert.ok(r.terms.some((x) => x.query === 'pousada em Capitólio'));
  assert.ok(!r.terms.some((x) => /piscina|banheira|café gratuito/i.test(x.query)));
});
