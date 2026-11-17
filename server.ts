import { createServer } from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { BackendRuntime } from './apps/api/dev-runtime.js';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);

const backend = new BackendRuntime({ env: process.env });
await backend.initialize();

const vite = await createViteServer({
  configFile: path.resolve('apps/web/vite.config.ts'),
  appType: 'spa',
  server: {
    middlewareMode: true,
    hmr: false,
    allowedHosts: true,
  },
});

const server = createServer(async (req, res) => {
  const rawUrl = req.url || '/';
  let pathname = '/';
  try {
    pathname = new URL(rawUrl, 'http://127.0.0.1').pathname;
  } catch {
    pathname = rawUrl.split('?')[0] || '/';
  }

  if (pathname === '/health' || pathname === '/v1' || pathname.startsWith('/v1/')) {
    try {
      await backend.handleHttp(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: {
              code: 'INTERNAL_ERROR',
              message: error instanceof Error ? error.message : 'INTERNAL_ERROR',
            },
          }),
        );
      }
    }
    return;
  }

  vite.middlewares(req, res);
});

await new Promise<void>((resolve) => {
  server.listen(port, host, resolve);
});

const report = await backend.getHealthReport(`http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`);
console.log(
  `[LRT] Servidor integrado ativo em http://${host}:${port} (API Fastify: ${report.api.mode}, PostgreSQL: ${report.database.connected ? 'conectado' : report.database.issue}, OIDC: ${report.oidc.configured ? 'configurado' : report.oidc.issue})`,
);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await vite.close().catch(() => {});
  await backend.teardown();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void shutdown();
  });
}
