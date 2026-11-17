import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
const mode = process.argv[2],
  file = path.resolve(process.argv[3] ?? 'work/backups/lrt.dump');
if (!['backup', 'restore'].includes(mode))
  throw Error('Usage: tsx infra/backup-restore.ts backup|restore FILE');
const raw = process.env.MIGRATION_DATABASE_URL;
if (!raw) throw Error('MIGRATION_DATABASE_URL required');
const url = new URL(raw);
const env = {
  ...process.env,
  PGPASSWORD: decodeURIComponent(url.password),
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username),
  PGDATABASE: url.pathname.slice(1),
};
const bin = process.env.PG_BIN_DIR ?? '';
const executable = (name: string) =>
  bin ? path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
if (mode === 'backup') {
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) throw Error('Refusing to overwrite an existing backup');
  const r = spawnSync(executable('pg_dump'), ['--format=custom', '--no-owner', '--file', file], {
    env,
    stdio: 'inherit',
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error('Backup failed');
  console.log('Backup created: ' + file);
} else {
  if (process.env.RESTORE_CONFIRMED_EMPTY_DATABASE !== url.pathname.slice(1))
    throw Error(
      'Set RESTORE_CONFIRMED_EMPTY_DATABASE to the newly created, empty restore target. Existing database must not be replaced.',
    );
  const { makePool } = await import('../packages/db/index.js');
  const target = makePool(raw);
  try {
    const check = await target.query(
      "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','S','v','m','f') LIMIT 1",
    );
    if (check.rowCount) throw Error('Restore target already contains user objects');
  } finally {
    await target.end();
  }
  const r = spawnSync(
    executable('pg_restore'),
    [
      '--single-transaction',
      '--exit-on-error',
      '--no-owner',
      '--dbname',
      url.pathname.slice(1),
      file,
    ],
    { env, stdio: 'inherit' },
  );
  if (r.error) throw r.error;
  if (r.status !== 0) throw Error('Restore failed');
  console.log('Restore completed; run integrity checks before use.');
}
