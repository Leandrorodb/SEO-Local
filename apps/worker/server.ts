import Fastify from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import type pg from 'pg';
import { fileURLToPath } from 'node:url';
import { makePool, assertRuntimeRole } from '../../packages/db/index.js';
import { productionProvider, type RankProvider } from '../../packages/rank-providers/index.js';
import { processOne, scheduleOne, recoverLeases, reconcileExpiredLicenses } from './worker.js';
export function buildWorkerHttp(options: {
  pool: pg.Pool;
  provider: RankProvider;
  environment: string;
  issuer: string;
  audience: string;
  subject: string;
  key: JWTVerifyGetKey;
}) {
  const app = Fastify({ bodyLimit: 4096, trustProxy: false });
  app.addHook('onRequest', async (req, reply) => {
    try {
      const value = /^Bearer ([^ ]+)$/.exec(req.headers.authorization ?? '')?.[1];
      if (!value) throw Error();
      const { payload } = await jwtVerify(value, options.key, {
        issuer: options.issuer,
        audience: options.audience,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat'],
        maxTokenAge: '1h',
      });
      if (payload.sub !== options.subject) throw Error();
    } catch {
      return reply.code(401).send({ error: { code: 'WORKER_IDENTITY_REQUIRED' } });
    }
  });
  app.setErrorHandler((error, _req, reply) =>
    reply
      .code(error instanceof z.ZodError ? 422 : 500)
      .send({ error: { code: error instanceof z.ZodError ? 'INVALID_JOB' : 'WORKER_FAILURE' } }),
  );
  app.post('/internal/audit-task', async (req) => {
    const body = z.object({ taskId: z.string().uuid() }).strict().parse(req.body);
    return {
      processed: await processOne(options.pool, options.provider, options.environment, body.taskId),
    };
  });
  app.post('/internal/tick', async (req) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    const expired = await reconcileExpiredLicenses(options.pool);
    await recoverLeases(options.pool);
    const scheduled = await scheduleOne(options.pool, options.provider, options.environment);
    let processed = 0;
    while (
      processed < 25 &&
      (await processOne(options.pool, options.provider, options.environment))
    )
      processed++;
    return { expired, scheduled, processed };
  });
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const name of [
    'DATABASE_URL',
    'WORKER_OIDC_ISSUER',
    'WORKER_OIDC_JWKS_URL',
    'WORKER_OIDC_AUDIENCE',
    'WORKER_OIDC_SUBJECT',
  ])
    if (!process.env[name]) throw Error(name + ' required');
  const jwks = new URL(process.env.WORKER_OIDC_JWKS_URL!);
  if (jwks.protocol !== 'https:') throw Error('Worker JWKS must use HTTPS');
  const pool = makePool(process.env.DATABASE_URL!);
  await assertRuntimeRole(pool);
  const app = buildWorkerHttp({
    pool,
    provider: productionProvider(),
    environment: process.env.NODE_ENV ?? 'development',
    issuer: process.env.WORKER_OIDC_ISSUER!,
    audience: process.env.WORKER_OIDC_AUDIENCE!,
    subject: process.env.WORKER_OIDC_SUBJECT!,
    key: createRemoteJWKSet(jwks),
  });
  await app.listen({
    host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
    port: Number(process.env.PORT ?? 4179),
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, async () => {
      await app.close();
      await pool.end();
      process.exit(0);
    });
}
