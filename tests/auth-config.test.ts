import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOidcConfig,
  formatAuthFetchError,
  parseApiHealthPayload,
} from '../apps/web/src/auth-config.js';

test('validateOidcConfig rejects missing or placeholder OIDC configuration', () => {
  assert.deepEqual(validateOidcConfig('', ''), {
    configured: false,
    issue: 'MISSING_OIDC_CONFIG',
  });
  assert.deepEqual(validateOidcConfig('https://YOUR_IDENTITY_PROVIDER', 'local-rank-tracker-web'), {
    configured: false,
    issue: 'PLACEHOLDER_OIDC_AUTHORITY',
  });
  assert.deepEqual(validateOidcConfig('not-a-url', 'local-rank-tracker-web'), {
    configured: false,
    issue: 'INVALID_OIDC_URL',
  });
  assert.deepEqual(validateOidcConfig('https://auth.empresa.com.br', 'your_client_id'), {
    configured: false,
    issue: 'PLACEHOLDER_OIDC_CLIENT',
  });
});

test('validateOidcConfig accepts real HTTPS and loopback OIDC issuers', () => {
  assert.deepEqual(validateOidcConfig('http://127.0.0.1:4181', 'local-rank-tracker-web'), {
    configured: true,
    issue: null,
  });
  assert.deepEqual(validateOidcConfig('https://accounts.google.com', 'client-123'), {
    configured: true,
    issue: null,
  });
});

test('formatAuthFetchError translates network errors to actionable Portuguese message', () => {
  const formatted = formatAuthFetchError(
    new TypeError('Failed to fetch'),
    'https://idp.exemplo.com.br',
    'https://app.exemplo.com.br',
  );
  assert.ok(formatted?.includes('https://idp.exemplo.com.br'));
  assert.ok(formatted?.includes('CORS'));
  assert.equal(formatAuthFetchError(new Error('invalid_grant')), null);
});

test('parseApiHealthPayload distinguishes healthy API, degraded subsystems, unavailable proxy 503, and non-JSON HTML', () => {
  assert.deepEqual(
    parseApiHealthPayload(200, 'application/json; charset=utf-8', '{"status":"ok","service":"Local Rank Tracker"}'),
    { status: 'ok' },
  );
  const degraded = parseApiHealthPayload(
    503,
    'application/json; charset=utf-8',
    JSON.stringify({
      status: 'degraded',
      service: 'Local Rank Tracker',
      database: {
        configured: false,
        connected: false,
        roleVerified: false,
        schemaReady: false,
        issue: 'PLACEHOLDER_DATABASE_URL',
        target: '127.0.0.1:55432/lrt',
        message: 'Banco placeholder',
      },
      missing: ['DATABASE_URL'],
    }),
  );
  assert.equal(degraded.status, 'degraded');
  if (degraded.status === 'degraded') {
    assert.equal(degraded.reason, 'Banco placeholder');
    assert.deepEqual(degraded.missing, ['DATABASE_URL']);
  }
  const unavailable = parseApiHealthPayload(
    503,
    'application/json; charset=utf-8',
    '{"error":{"code":"API_UNAVAILABLE","message":"API offline"}}',
  );
  assert.equal(unavailable.status, 'unavailable');
  assert.deepEqual(parseApiHealthPayload(200, 'text/html', '<!doctype html><html></html>'), {
    status: 'unknown',
  });
});
