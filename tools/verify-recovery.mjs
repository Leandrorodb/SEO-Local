import { existsSync, readFileSync } from 'node:fs';
const needed = [
  'apps/api/main.ts',
  'apps/api/app.ts',
  'apps/web/src/main.tsx',
  'apps/web/src/pages.tsx',
  'apps/worker/main.ts',
  'packages/db/migrate.ts',
  'packages/rank-providers/index.ts',
  'docs/archive/postgresql/ENTREGA.md',
];
const bad = needed.filter((p) => !existsSync(p));
const forbidden = ['src/server/api.ts', 'src/db.js', 'local-data/nexus.sqlite', '.env'];
const present = forbidden.filter((p) => existsSync(p));
const providerSource = readFileSync('packages/rank-providers/index.ts','utf8');
const providerSafe = providerSource.includes('DisabledProvider');
console.log(`Arquivos essenciais: ${needed.length-bad.length}/${needed.length}`);
console.log(`Entradas legadas inseguras na raiz: ${present.length}`);
console.log(`Provedor desabilitado disponível: ${providerSafe}`);
if (bad.length) console.error('Arquivos ausentes:', bad);
if (present.length) console.error('Arquivos indevidos:', present);
if (bad.length || present.length || !providerSafe) process.exitCode = 1;
