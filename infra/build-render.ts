import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

// The Render runtime must not depend on tsx (a development-only dependency).
// Bundle our own TypeScript; keep npm dependencies external and installed by npm ci.
await mkdir('dist/render', { recursive: true });
await build({
  entryPoints: ['apps/firebase/server.ts'],
  outfile: 'dist/render/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'external',
  sourcemap: false,
  logLevel: 'info',
});
console.log('Render API compiled into dist/render/server.js');
