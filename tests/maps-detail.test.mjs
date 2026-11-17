import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinatesFromMapsUrl, cityFromBrazilianAddress, mapsInterruption } from '../packages/rank-providers/maps-detail.ts';

test('uses listing-specific !3d !4d before approximate map viewport', () => {
  const link = 'https://www.google.com/maps/place/Teste/@-21.5,-45.5,15z/data=!8m2!3d-21.5721195!4d-45.427801';
  assert.deepEqual(coordinatesFromMapsUrl(link), { lat: -21.5721195, lng: -45.427801, source: 'LISTING' });
});
test('viewport is never labeled as exact listing coordinates', () => {
  assert.deepEqual(coordinatesFromMapsUrl('https://www.google.com/maps/place/Teste/@-21.6,-45.4,17z'),
    { lat: -21.6, lng: -45.4, source: 'VIEWPORT' });
  assert.equal(coordinatesFromMapsUrl('https://www.google.com/maps/place/Teste'), null);
});
test('rejects out-of-range and malformed coordinates', () => {
  assert.equal(coordinatesFromMapsUrl('https://www.google.com/maps/place/a/@-99,-45.42,17z'), null);
  assert.equal(coordinatesFromMapsUrl('https://www.google.com/maps/place/a/@a,-45.42,17z'), null);
});
test('reads Brazilian city without mistaking the neighborhood for city', () => {
  assert.equal(cityFromBrazilianAddress('Av. João, 20 - Centro, Três Corações - MG, 37410-000, Brasil'), 'Três Corações');
  assert.equal(cityFromBrazilianAddress('Fazenda Retiro, S/N - Zona Rural, Capitólio - MG, 37930-000'), 'Capitólio');
  assert.equal(cityFromBrazilianAddress('Rua das Flores, 33, Varginha, MG, 37000-000'), 'Varginha');
  assert.equal(cityFromBrazilianAddress('Rua da Praia 55'), null);
});
test('differentiates Google consent from an access interruption', () => {
  assert.equal(mapsInterruption('Antes de continuar para Google', 'https://consent.google.com/...'), 'CONSENT');
  assert.equal(mapsInterruption('Nossa plataforma detectou tráfego incomum', 'https://www.google.com/maps'), 'BLOCKED');
  assert.equal(mapsInterruption('Pousada Muro de Pedra', 'https://www.google.com/maps'), null);
});
