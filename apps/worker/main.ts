import { setTimeout } from 'node:timers/promises';
import { makePool, assertRuntimeRole } from '../../packages/db/index.js';
import { productionProvider } from '../../packages/rank-providers/index.js';
import { processOne, recoverLeases, scheduleOne, reconcileExpiredLicenses } from './worker.js';
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
const pool = makePool(process.env.DATABASE_URL);
await assertRuntimeRole(pool);
const provider = productionProvider();
let running = true;
process.on('SIGINT', () => (running = false));
process.on('SIGTERM', () => (running = false));
try {
  while (running) {
    await reconcileExpiredLicenses(pool);
    await recoverLeases(pool);
    await scheduleOne(pool, provider, process.env.NODE_ENV ?? 'development');
    if (!(await processOne(pool, provider, process.env.NODE_ENV ?? 'development')))
      await setTimeout(1500);
  }
} finally {
  if ('dispose' in provider && typeof provider.dispose === 'function') await provider.dispose();
  await pool.end();
}
