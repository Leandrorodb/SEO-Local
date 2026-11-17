import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  collectHelmetConnectSrc,
  inspectDatabaseConfig,
  inspectServerOidcConfig,
  inspectWorkerAndProviderConfig,
  parseAllowedOrigins,
  sanitizePostgresTarget,
} from '../apps/api/runtime-config.js';
import { Authenticator } from '../apps/api/auth.js';
import { BackendRuntime } from '../apps/api/dev-runtime.js';

test('sanitizePostgresTarget detects placeholders, masks secrets, and accepts Cloud SQL sockets', () => {
  const placeholder = sanitizePostgresTarget('postgresql://lrt_app:CHANGE_LOCALLY@127.0.0.1:55432/lrt');
  assert.equal(placeholder.valid, true);
  assert.equal(placeholder.placeholder, true);
  assert.equal(placeholder.target?.includes('CHANGE_LOCALLY'), false);
  assert.equal(placeholder.target, '127.0.0.1:55432/lrt (usuário lrt_app)');

  const socket = sanitizePostgresTarget('postgresql://lrt_app:SuperSecret99@/lrt?host=/cloudsql/proj:us-east1:db1');
  assert.equal(socket.valid, true);
  assert.equal(socket.placeholder, false);
  assert.equal(socket.target?.includes('SuperSecret99'), false);
  assert.equal(socket.target, 'socket /cloudsql/proj:us-east1:db1/lrt (usuário lrt_app)');
});

test('inspectDatabaseConfig and inspectServerOidcConfig reject example placeholders', () => {
  const db = inspectDatabaseConfig({
    DATABASE_URL: 'postgresql://lrt_app:CHANGE_LOCALLY@127.0.0.1:55432/lrt',
    MIGRATION_DATABASE_URL: 'postgresql://postgres:CHANGE_LOCALLY@127.0.0.1:55432/lrt',
  });
  assert.equal(db.configured, false);
  assert.equal(db.issue, 'PLACEHOLDER_DATABASE_URL');
  assert.equal(db.migrationConfigured, false);

  const oidc = inspectServerOidcConfig(
    {
      OIDC_ISSUER: 'https://YOUR_IDENTITY_PROVIDER',
      OIDC_JWKS_URL: 'https://YOUR_IDENTITY_PROVIDER/.well-known/jwks.json',
      OIDC_AUDIENCE: 'local-rank-tracker-web',
      VITE_OIDC_AUTHORITY: 'https://YOUR_IDENTITY_PROVIDER',
      VITE_OIDC_CLIENT_ID: 'local-rank-tracker-web',
    },
    'https://ais-dev.example.run.app',
  );
  assert.equal(oidc.configured, false);
  assert.equal(oidc.issue, 'PLACEHOLDER_OIDC_URL');
  assert.equal(oidc.expectedCallback, 'https://ais-dev.example.run.app/auth/callback');
});

test('inspectServerOidcConfig and Authenticator.fromEnv enforce HTTPS JWKS and reject placeholder hosts', () => {
  assert.throws(
    () =>
      Authenticator.fromEnv({
        OIDC_ISSUER: 'https://YOUR_IDENTITY_PROVIDER',
        OIDC_JWKS_URL: 'https://YOUR_IDENTITY_PROVIDER/.well-known/jwks.json',
        OIDC_AUDIENCE: 'local-rank-tracker-web',
      }),
    /placeholder host/,
  );

  const valid = inspectServerOidcConfig({
    OIDC_ISSUER: 'https://auth.empresa.com.br/realms/lrt',
    OIDC_JWKS_URL: 'https://auth.empresa.com.br/realms/lrt/protocol/openid-connect/certs',
    OIDC_AUDIENCE: 'local-rank-tracker-web',
    VITE_OIDC_AUTHORITY: 'https://auth.empresa.com.br/realms/lrt',
    VITE_OIDC_CLIENT_ID: 'local-rank-tracker-web',
    OIDC_MFA_ACR: 'urn:mace:incommon:iap:mfa',
  });
  assert.equal(valid.configured, true);
  assert.equal(valid.mfaConfigured, true);
});

test('parseAllowedOrigins and collectHelmetConnectSrc support multiple origins cleanly', () => {
  assert.equal(parseAllowedOrigins(undefined), 'http://localhost:5173');
  assert.deepEqual(
    parseAllowedOrigins('https://ais-dev.run.app, http://localhost:5173', ['http://localhost:3000']),
    ['https://ais-dev.run.app', 'http://localhost:5173', 'http://localhost:3000'],
  );
  assert.deepEqual(
    collectHelmetConnectSrc({
      OIDC_ISSUER: 'https://auth.empresa.com.br/realms/lrt',
      VITE_OIDC_AUTHORITY: 'https://auth.empresa.com.br/realms/lrt',
      OIDC_JWKS_URL: 'https://cdn.auth.empresa.com.br/jwks.json',
    }),
    ["'self'", 'https://auth.empresa.com.br', 'https://cdn.auth.empresa.com.br'],
  );
});

test('inspectWorkerAndProviderConfig distinguishes disabled vs local_chrome_preview', () => {
  const disabled = inspectWorkerAndProviderConfig({
    RANK_PROVIDER: 'disabled',
    WORKER_OIDC_AUDIENCE: 'https://YOUR_WORKER',
  });
  assert.equal(disabled.mode, 'disabled');
  assert.equal(disabled.workerHttpOidcConfigured, false);
});

test('BackendRuntime serves honest 503 degraded /health and protects /v1 routes when external infra is unconfigured', async () => {
  const runtime = new BackendRuntime({
    env: {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://lrt_app:CHANGE_LOCALLY@127.0.0.1:55432/lrt',
      MIGRATION_DATABASE_URL: 'postgresql://postgres:CHANGE_LOCALLY@127.0.0.1:55432/lrt',
      OIDC_ISSUER: 'https://YOUR_IDENTITY_PROVIDER',
      OIDC_JWKS_URL: 'https://YOUR_IDENTITY_PROVIDER/.well-known/jwks.json',
      OIDC_AUDIENCE: 'local-rank-tracker-web',
      VITE_OIDC_AUTHORITY: 'https://YOUR_IDENTITY_PROVIDER',
      VITE_OIDC_CLIENT_ID: 'local-rank-tracker-web',
      RANK_PROVIDER: 'disabled',
    },
  });
  await runtime.initialize();

  const server = createServer((req, res) => {
    void runtime.handleHttp(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    const healthRes = await fetch(base + '/health');
    assert.equal(healthRes.status, 503);
    assert.equal(healthRes.headers.get('cache-control'), 'no-store');
    const health = (await healthRes.json()) as {
      status: string;
      service: string;
      database: { configured: boolean; connected: boolean; issue: string; message: string };
      oidc: { configured: boolean; issue: string };
      missing: string[];
    };
    assert.equal(health.status, 'degraded');
    assert.equal(health.service, 'Local Rank Tracker');
    assert.equal(health.database.configured, false);
    assert.equal(health.database.connected, false);
    assert.equal(health.database.issue, 'PLACEHOLDER_DATABASE_URL');
    assert.equal(health.database.message.includes('CHANGE_LOCALLY'), false);
    assert.equal(health.oidc.configured, false);
    assert.ok(health.missing.includes('DATABASE_URL'));
    assert.ok(health.missing.includes('OIDC_ISSUER'));

    const apiRes = await fetch(base + '/v1/me/organizations');
    assert.equal(apiRes.status, 503);
    const apiBody = (await apiRes.json()) as { error: { code: string } };
    assert.equal(apiBody.error.code, 'DATABASE_UNAVAILABLE');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await runtime.teardown();
  }
});
