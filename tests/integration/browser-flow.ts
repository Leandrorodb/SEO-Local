import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { createLocalJWKSet, exportJWK, SignJWT, type CryptoKey } from 'jose';
import { createServer as createViteServer } from 'vite';
import { chromium, expect } from '@playwright/test';
import type pg from 'pg';
import { buildApp } from '../../apps/api/app.js';
import { Authenticator } from '../../apps/api/auth.js';
import type { RankProvider } from '../../packages/rank-providers/index.js';
import { processOne } from '../../apps/worker/worker.js';
import path from 'node:path';
import assert from 'node:assert/strict';
// Test-only OIDC issuer: signed tokens + real Authorization Code / PKCE callback.
// It is never imported by apps or production bundles.
export async function browserFlow(
  pool: pg.Pool,
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  provider: RankProvider,
  artifactDir: string,
) {
  const codes = new Map<string, { challenge: string; nonce: string | null }>();
  let issuer = '';
  const publicJwk = await exportJWK(publicKey);
  const oidc = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') {
      res.end();
      return;
    }
    const u = new URL(req.url!, issuer);
    try {
      if (u.pathname === '/.well-known/openid-configuration') {
        res.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: issuer + '/authorize',
            token_endpoint: issuer + '/token',
            jwks_uri: issuer + '/jwks',
            userinfo_endpoint: issuer + '/userinfo',
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            code_challenge_methods_supported: ['S256'],
          }),
        );
        return;
      }
      if (u.pathname === '/jwks') {
        res.end(JSON.stringify({ keys: [{ ...publicJwk, kid: 'browser', alg: 'RS256' }] }));
        return;
      }
      if (u.pathname === '/authorize') {
        const redirect = new URL(u.searchParams.get('redirect_uri')!);
        assert.equal(redirect.hostname, '127.0.0.1');
        assert.equal(redirect.pathname, '/auth/callback');
        const code = randomUUID();
        codes.set(code, {
          challenge: u.searchParams.get('code_challenge')!,
          nonce: u.searchParams.get('nonce'),
        });
        redirect.searchParams.set('code', code);
        redirect.searchParams.set('state', u.searchParams.get('state')!);
        res.writeHead(302, { Location: redirect.toString() });
        res.end();
        return;
      }
      if (u.pathname === '/token') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const params = new URLSearchParams(raw),
          code = params.get('code')!,
          saved = codes.get(code);
        codes.delete(code);
        assert.ok(saved);
        assert.equal(
          createHash('sha256').update(params.get('code_verifier')!).digest('base64url'),
          saved.challenge,
        );
        const jwt = await new SignJWT({
          email: 'admin@test.invalid',
          amr: ['pwd', 'otp'],
          auth_time: Math.floor(Date.now() / 1000),
          ...(saved.nonce ? { nonce: saved.nonce } : {}),
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'browser' })
          .setIssuer(issuer)
          .setAudience('lrt')
          .setSubject('admin')
          .setIssuedAt()
          .setExpirationTime('15m')
          .sign(privateKey);
        res.end(
          JSON.stringify({
            access_token: jwt,
            id_token: jwt,
            token_type: 'Bearer',
            expires_in: 900,
            scope: 'openid profile email',
          }),
        );
        return;
      }
      if (u.pathname === '/userinfo') {
        res.end(JSON.stringify({ sub: 'admin', email: 'admin@test.invalid' }));
        return;
      }
      res.writeHead(404);
      res.end('{}');
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid_grant' }));
    }
  });
  await new Promise<void>((resolve) => oidc.listen(0, '127.0.0.1', resolve));
  const address = oidc.address();
  if (!address || typeof address === 'string') throw Error('OIDC test port unavailable');
  issuer = 'http://127.0.0.1:' + address.port;
  const auth = new Authenticator(
    issuer,
    'lrt',
    createLocalJWKSet({ keys: [{ ...publicJwk, kid: 'browser', alg: 'RS256' }] }),
  );
  const api = buildApp({ pool, auth, provider, environment: 'test' });
  await api.listen({ host: '127.0.0.1', port: 0 });
  const apiAddress = api.server.address();
  if (!apiAddress || typeof apiAddress === 'string') throw Error('API port unavailable');
  const vite = await createViteServer({
    configFile: path.resolve('apps/web/vite.config.ts'),
    define: {
      'import.meta.env.VITE_AUTH_MODE': JSON.stringify('oidc-test'),
      'import.meta.env.VITE_OIDC_AUTHORITY': JSON.stringify(issuer),
      'import.meta.env.VITE_OIDC_CLIENT_ID': JSON.stringify('lrt'),
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      watch: null,
      hmr: false,
      proxy: {
        '/v1': `http://127.0.0.1:${apiAddress.port}`,
        '/health': `http://127.0.0.1:${apiAddress.port}`,
      },
    },
  });
  await vite.listen();
  const webAddress = vite.httpServer!.address();
  if (!webAddress || typeof webAddress === 'string') throw Error('Web port unavailable');
  const browser = await chromium.launch({
    channel: process.env.CI ? undefined : 'chrome',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${webAddress.port}`);
    await expect(page.getByRole('button', { name: 'Entrar com segurança' })).toBeVisible();
    await page.screenshot({ path: path.join(artifactDir, 'login-dark.png'), fullPage: true });
    await page.getByRole('button', { name: 'Entrar com segurança' }).click();
    await expect(
      page.getByRole('heading', { name: 'Inteligência para crescer localmente.' }),
    ).toBeVisible({ timeout: 20000 });
    await page.getByRole('link', { name: 'Empresas e unidades' }).click();
    await page.getByRole('button', { name: 'Cadastrar unidade' }).click();
    await page.getByLabel('Link do Google Maps').fill('https://www.google.com/maps?cid=87654321');
    await page.getByLabel('Nome confirmado da empresa').fill('Unidade de teste do navegador');
    await page.getByLabel('Cidade / estado').fill('Cidade sintética');
    await page.getByLabel('Endereço completo').fill('Rua sintética, 1');
    await page.getByLabel('Latitude', { exact: true }).fill('-21');
    await page.getByLabel('Longitude', { exact: true }).fill('-45');
    await page.getByRole('button', { name: 'Salvar unidade' }).click();
    const row = page.getByRole('row').filter({ hasText: 'Unidade de teste do navegador' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Resolver identidade' }).click();
    await page.getByRole('button', { name: 'Confirmar esta unidade' }).click();
    await expect(page.getByRole('status')).toHaveText('Alteração salva.');
    await page.getByRole('link', { name: 'Termos e clusters' }).click();
    await page.getByLabel('Termos do GPT').fill(
      JSON.stringify({
        schemaVersion: '1.0',
        locationRef: await page.getByLabel('Unidade', { exact: true }).first().inputValue(),
        language: 'pt-BR',
        clusters: [
          {
            name: 'Serviços confirmados',
            intent: 'commercial',
            terms: [
              {
                keyword: 'serviço de teste no navegador',
                kind: 'commercial',
                priority: 'medium',
              },
            ],
          },
        ],
      }),
    );
    await page.getByRole('button', { name: 'Validar prévia' }).click();
    await expect(page.getByRole('button', { name: 'Importar sugestões' })).toBeEnabled();
    await page.getByRole('button', { name: 'Importar sugestões' }).click();
    await page.getByRole('button', { name: 'Validar', exact: true }).click();
    await page.getByRole('button', { name: 'Ativar', exact: true }).click();
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Nova auditoria' }).click();
    await page.getByLabel('Tipo de medição').selectOption('grid5x5');
    await page.getByRole('button', { name: 'Criar GeoGrid 5×5' }).click();
    await page.getByRole('button', { name: 'Calcular consultas e custo' }).click();
    await expect(page.getByText('25 consultas', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar e medir agora' }).click();
    await expect(page.getByText('QUEUED', { exact: true })).toBeVisible();
    while (await processOne(pool, provider, 'test')) {}
    await page.getByRole('link', { name: 'Resultados' }).click();
    await expect(page.getByText('2º', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: path.join(artifactDir, 'results-dark.png'), fullPage: true });
    await page.getByRole('button', { name: 'Alternar tema', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: path.join(artifactDir, 'results-light.png'), fullPage: true });
    await page.getByRole('link', { name: 'Feedbacks e relatórios' }).click();
    await page.getByLabel('Auditoria para relatório').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Criar minuta' }).click();
    await page.getByRole('button', { name: 'Submeter à revisão' }).click();
    await page.getByRole('button', { name: 'Aprovar relatório' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar PDF' }).click();
    await (await download).saveAs(path.join(artifactDir, 'synthetic-approved-report.pdf'));
    await page.getByRole('link', { name: 'Visão geral' }).click();
    await page.screenshot({ path: path.join(artifactDir, 'overview-light.png'), fullPage: true });
    await page.getByRole('button', { name: 'Alternar tema', exact: true }).click();
    await page.screenshot({ path: path.join(artifactDir, 'overview-dark.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } catch (e) {
    await page.screenshot({ path: path.join(artifactDir, 'browser-failure.png'), fullPage: true });
    throw e;
  } finally {
    await browser.close();
    await vite.close();
    await api.close();
    await new Promise<void>((resolve, reject) => oidc.close((e) => (e ? reject(e) : resolve())));
  }
}
