import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('iniciador local usa o build completo e executa API, worker e interface compilados', () => {
  const launcher = read('infra/launcher-local.ps1');
  assert.match(launcher, /npm\.cmd run build/);
  assert.match(launcher, /StartService 'api' 'api:built'/);
  assert.match(launcher, /StartService 'worker' 'worker:built'/);
  assert.match(launcher, /StartService 'painel' 'preview:local'/);
  assert.match(launcher, /dist\\apps\\api\\main\.js/);
  assert.match(launcher, /apps\\web\\dist\\index\.html/);
  assert.equal(pkg.scripts['api:built'].includes('dist/apps/api/main.js'), true);
  assert.equal(pkg.scripts['worker:built'].includes('dist/apps/worker/main.js'), true);
});

test('preview compilada envia somente endpoints da API ao Fastify local', () => {
  const config = read('apps/web/vite.config.ts');
  assert.match(config, /preview:\s*\{/);
  assert.match(config, /'\/v1': 'http:\/\/127\.0\.0\.1:4178'/);
  assert.match(config, /host:\s*'127\.0\.0\.1'/);
  assert.match(config, /strictPort:\s*true/);
});

test('pacote inclui iniciador e nao inclui secrets de um usuario', () => {
  for (const p of ['ABRIR_LOCAL_RANK_TRACKER.cmd', 'ENCERRAR_LOCAL_RANK_TRACKER.cmd',
    'infra/local-postgres.ts', 'infra/local-oidc.mjs', 'package-lock.json', 'scripts/windows/INICIAR_LOCAL_RANK_TRACKER.cmd']) {
    assert.equal(existsSync(new URL('../' + p, import.meta.url)), true, p);
  }
  assert.equal(existsSync(new URL('../.env', import.meta.url)), false);
  assert.equal(existsSync(new URL('../work/local-db/connection.json', import.meta.url)), false);
});
