import { existsSync } from 'node:fs';
import path from 'node:path';
import { serveWeb } from './static.js';
import { makePool, assertRuntimeRole } from '../../packages/db/index.js';
import { productionProvider } from '../../packages/rank-providers/index.js';
import { Authenticator } from './auth.js';
import { buildApp } from './app.js';
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required; configure the runtime role');
const pool = makePool(process.env.DATABASE_URL);
await assertRuntimeRole(pool);
const app = buildApp({
  pool,
  auth: Authenticator.fromEnv(),
  provider: productionProvider(),
  logging: true,
  webOrigin: process.env.WEB_ORIGIN,
});
const root = path.resolve('apps/web/dist');
if (existsSync(root)) await serveWeb(app, root);
await app.listen({
  port: Number(process.env.PORT ?? 4178),
  host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
