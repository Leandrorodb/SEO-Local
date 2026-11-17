import { LocalPostgres as EmbeddedPostgres } from './test-postgres.js';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { makePool } from '../packages/db/index.js';
import { migrate } from '../packages/db/migrate.js';
if (process.env.NODE_ENV === 'production') throw Error('Local database is development only');
const root = path.resolve('work/local-db');
mkdirSync(root, { recursive: true });
const secrets = path.join(root, 'connection.json');
const config = existsSync(secrets)
  ? JSON.parse(readFileSync(secrets, 'utf8'))
  : { password: randomBytes(32).toString('hex'), appPassword: randomBytes(32).toString('hex') };
if (!existsSync(secrets)) writeFileSync(secrets, JSON.stringify(config), { mode: 0o600 });
const dbDir = path.join(root, 'postgres');
const postgres = new EmbeddedPostgres({
  databaseDir: dbDir,
  user: 'postgres',
  password: config.password,
  port: 55432,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
const fresh = !existsSync(path.join(dbDir, 'PG_VERSION'));
if (fresh) await postgres.initialise();
await postgres.start();
// A prior interrupted startup may have initialized PG_VERSION but not the database.
const catalog = postgres.getPgClient('postgres', '127.0.0.1');
let exists = false;
try {
  await catalog.connect();
  const result = await catalog.query('SELECT 1 FROM pg_database WHERE datname=$1', ['lrt']);
  exists = (result.rowCount ?? 0) > 0;
} finally {
  await catalog.end();
}
if (!exists) await postgres.createDatabase('lrt');
const url = `postgresql://postgres:${config.password}@127.0.0.1:55432/lrt`;
const admin = makePool(url);
await migrate(admin);
await admin.query(`ALTER ROLE lrt_app LOGIN PASSWORD '${config.appPassword}'`);
await admin.end();
writeFileSync(
  path.join(root, 'database.env'),
  `DATABASE_URL=postgresql://lrt_app:${config.appPassword}@127.0.0.1:55432/lrt\nMIGRATION_DATABASE_URL=${url}\n`,
  { mode: 0o600 },
);
console.log(
  'PostgreSQL development ready on 127.0.0.1:55432. Private connection config: work/local-db/database.env. No accounts, client data or rankings seeded.',
);
let stop = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (stop) return;
    stop = true;
    await postgres.stop();
    process.exit(0);
  });
setInterval(() => {}, 60_000);
