import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const result = spawnSync(process.execPath, [vite, 'build', '--config', 'apps/web/vite.config.ts'], {
  stdio: 'inherit', env: { ...process.env, VITE_REVIEW_BUILD: 'READ_ONLY' }, windowsHide: true,
});
process.exit(result.status ?? 1);
