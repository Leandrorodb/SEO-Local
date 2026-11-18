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

test('oficina de motos keeps motorcycle searches and never suggests car services', () => {
  const r = suggestKeywords({name:'Terremoto Moto Peças',city:'Varginha',primaryCategory:'Oficina mecânica de motos'});
  assert.equal(r.classification.niche,'oficina_motos');
  assert.equal(r.classification.confidence,'category_match');
  assert.ok(r.terms.some(t=>t.query==='oficina de motos em Varginha'));
  assert.ok(!r.terms.some(t=>/carros|automotiv|autopeças|pneus|injeção|troca de óleo/i.test(t.query)));
  assert.equal(r.reviewRequired,true);
});

test('operator can choose motopeças while a generic car workshop remains unchanged', () => {
  const shop=suggestKeywords({name:'Terremoto Moto Peças',city:'Varginha',primaryCategory:'Oficina mecânica de motos',niche:'motopeças'});
  assert.equal(shop.classification.niche,'motopeças');
  assert.ok(shop.terms.some(t=>t.query==='peças de moto Varginha'));
  assert.ok(!shop.terms.some(t=>/carros|automotiv/i.test(t.query)));
  assert.equal(detectNiche('Oficina mecânica').niche,'oficina');
});

test('motopeças uses the confirmed city in commercial and brand clusters without invented products',()=>{
  const r=suggestKeywords({name:'Terremoto Moto Peças',city:'Varginha/MG',niche:'motopeças'});
  assert.ok(r.terms.some(t=>t.query==='motopeças Varginha'&&t.cluster==='Motopeças na cidade'));
  assert.ok(r.terms.some(t=>t.query==='loja de peças para motos Varginha'&&t.cluster==='Lojas de motopeças'));
  assert.ok(r.terms.some(t=>t.query==='peças para motocicletas Varginha'&&t.cluster==='Peças para motocicletas'));
  assert.ok(r.terms.some(t=>t.query==='Terremoto Moto Peças Varginha'&&t.cluster==='Marca'));
  assert.ok(r.terms.every(t=>t.query.includes('Varginha')));
  assert.ok(!r.terms.some(t=>/perto de mim|acessórios|carros|troca de óleo|pneu|Honda|Yamaha/i.test(t.query)));
});

test('every suggested niche keeps the listing city, including neighborhoods, services and brand',()=>{
  for(const niche of listNiches()){
    const r=suggestKeywords({name:'Empresa Horizonte',city:'São Thomé das Letras/MG',niche:niche.value,
      neighborhood:'Centro',services:['serviço confirmado'],limit:100});
    assert.ok(r.terms.length>0);
    assert.ok(r.terms.every(t=>t.query.includes('São Thomé das Letras')),niche.value);
    assert.ok(!r.terms.some(t=>/perto de mim/.test(t.query)),niche.value);
  }
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
