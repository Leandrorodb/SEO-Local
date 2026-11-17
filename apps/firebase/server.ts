import { firebaseServices, Store } from './store.js';
import { buildFirebaseApp } from './api.js';
import { getCloudProvider } from './provider.js';

const { db, auth } = firebaseServices();
const store = new Store(db);
const provider = getCloudProvider();

const app = buildFirebaseApp({
  store,
  auth,
  provider,
  logging: process.env.NODE_ENV !== 'production' || process.env.LOG_LEVEL === 'debug',
});

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 10000);

await app.listen({ host, port });
console.log(`SEO-Local API listening on ${host}:${port} [provider: ${provider.id}, enabled: ${provider.enabled}]`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  });
}
