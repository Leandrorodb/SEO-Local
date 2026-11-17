import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

// Build artifacts are enumerated at startup. A request never selects a filesystem path.
export async function serveWeb(app: FastifyInstance, root: string) {
  const html = await readFile(path.join(root, 'index.html'));
  for (const route of [
    '/',
    '/auth/callback',
    '/measure',
    '/locations',
    '/terms',
    '/audits',
    '/results',
    '/competitors',
    '/opportunities',
    '/reports',
    '/automation',
    '/team',
    '/billing',
    '/owner',
  ]) {
    app.get(route, async (_, reply) => reply.type('text/html; charset=utf-8').send(html));
  }
  const dir = path.join(root, 'assets');
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^[A-Za-z0-9_-]+\.(js|css)$/.test(entry.name)) continue;
    const data = await readFile(path.join(dir, entry.name));
    const type = entry.name.endsWith('.css') ? 'text/css' : 'text/javascript';
    app.get('/assets/' + entry.name, async (_, reply) =>
      reply.type(type + '; charset=utf-8').send(data),
    );
  }
}
