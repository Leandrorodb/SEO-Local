import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:4178';

const attachApiUnavailableHandler: ProxyOptions['configure'] = (proxy) => {
  proxy.on('error', (_err, _req, res) => {
    if ('writeHead' in res && !res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          error: {
            code: 'API_UNAVAILABLE',
            message:
              'API Fastify (apps/api/main.ts em 127.0.0.1:4178) não está em execução ou PostgreSQL (DATABASE_URL) não está conectado.',
          },
        }),
      );
    }
  });
};

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 3000),
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/v1': { target: apiTarget, configure: attachApiUnavailableHandler },
      '/health': { target: apiTarget, configure: attachApiUnavailableHandler },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/v1': 'http://127.0.0.1:4178', '/health': 'http://127.0.0.1:4178' },
  },
  build: { sourcemap: false },
});
