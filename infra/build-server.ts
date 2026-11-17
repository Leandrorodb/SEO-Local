import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
await build({
  entryPoints: [
    'apps/api/main.ts',
    'apps/worker/main.ts',
    'apps/worker/server.ts',
    'packages/db/migrate.ts',
    'infra/bootstrap-owner.ts',
  ],
  outdir: 'dist',
  outbase: '.',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: false,
});
await mkdir('dist/packages/db/migrations', { recursive: true });
await cp('packages/db/migrations', 'dist/packages/db/migrations', { recursive: true });
console.log('API, worker and administration scripts compiled to dist/.');
