import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRelativeGeoGridLayout,
  buildSetupReadinessChecklist,
  isUiPreviewAllowed,
  resolveInitialPreviewMode,
} from '../apps/web/src/preview-mode.js';

test('isUiPreviewAllowed strictly forbids production builds regardless of hostname', () => {
  assert.equal(isUiPreviewAllowed('localhost', false), false);
  assert.equal(isUiPreviewAllowed('127.0.0.1', false), false);
  assert.equal(isUiPreviewAllowed('ais-dev-example.us-east1.run.app', false), false);
  assert.equal(isUiPreviewAllowed('app.example.com', false), false);
});

test('isUiPreviewAllowed permits dev mode only on local and AI Studio run.app hosts', () => {
  assert.equal(isUiPreviewAllowed('localhost', true), true);
  assert.equal(isUiPreviewAllowed('127.0.0.1', true), true);
  assert.equal(isUiPreviewAllowed('ais-dev-2fqzyjau53xarmjxaacnru-572019275785.us-east1.run.app', true), true);
  assert.equal(isUiPreviewAllowed('malicious.example.com', true), false);
  assert.equal(isUiPreviewAllowed('', true), false);
});

test('resolveInitialPreviewMode honors query flags and blocks unauthorized hosts', () => {
  assert.equal(resolveInitialPreviewMode({ allowed: false, search: '?preview=ui', storedValue: '1' }), false);
  assert.equal(resolveInitialPreviewMode({ allowed: true, search: '?preview=ui', storedValue: null }), true);
  assert.equal(resolveInitialPreviewMode({ allowed: true, search: '?preview=0', storedValue: '1' }), false);
  assert.equal(resolveInitialPreviewMode({ allowed: true, search: '', storedValue: '1' }), true);
  assert.equal(resolveInitialPreviewMode({ allowed: true, search: '', storedValue: null }), false);
});

test('buildSetupReadinessChecklist reports truthful status for pending Neon DB and OIDC', () => {
  const items = buildSetupReadinessChecklist(
    {
      status: 'degraded',
      reason: 'DATABASE_URL ainda não configurada.',
      missing: ['DATABASE_URL', 'OIDC_ISSUER'],
      database: {
        configured: false,
        connected: false,
        roleVerified: false,
        schemaReady: false,
        issue: 'DATABASE_NOT_CONFIGURED',
        target: null,
        message: 'DATABASE_URL ainda não configurada.',
      },
      worker: {
        mode: 'disabled',
        provider: 'unconfigured',
        oidcConfigured: false,
        message: 'Nenhum provedor ativo.',
      },
    },
    false,
    'PLACEHOLDER_OIDC_AUTHORITY',
  );

  assert.equal(items.find((i) => i.id === 'api')?.state, 'ready');
  assert.equal(items.find((i) => i.id === 'database')?.state, 'pending');
  assert.equal(items.find((i) => i.id === 'oidc')?.state, 'pending');
  assert.equal(items.find((i) => i.id === 'worker')?.state, 'pending');
});

test('buildRelativeGeoGridLayout produces 25 centered points without fake coordinates', () => {
  const points = buildRelativeGeoGridLayout(500);
  assert.equal(points.length, 25);
  assert.equal(points[0].offsetNorthM, 1000);
  assert.equal(points[0].offsetEastM, -1000);
  assert.equal(points[12].label, 'P13');
  assert.equal(points[12].offsetNorthM, 0);
  assert.equal(points[12].offsetEastM, 0);
  assert.equal(points[24].offsetNorthM, -1000);
  assert.equal(points[24].offsetEastM, 1000);
});
