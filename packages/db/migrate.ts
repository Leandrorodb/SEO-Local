import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { makePool } from './index.js';
import type pg from 'pg';
export async function migrate(pool: pg.Pool) {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query('SELECT pg_advisory_xact_lock(8835001)');
    await tx.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of (await readdir(new URL('./migrations/', import.meta.url)))
      .filter((x) => x.endsWith('.sql'))
      .sort()) {
      const sql = await readFile(new URL('./migrations/' + name, import.meta.url), 'utf8'),
        hash = createHash('sha256').update(sql).digest('hex');
      const old = await tx.query('SELECT sha256 FROM schema_migrations WHERE name=$1', [name]);
      if (old.rows[0]) {
        if (old.rows[0].sha256 !== hash) throw Error('Migration modified: ' + name);
        continue;
      }
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)', [name, hash]);
    }
    await tx.query('REVOKE ALL ON schema_migrations FROM lrt_app');
    await tx.query('COMMIT');
  } catch (e) {
    await tx.query('ROLLBACK');
    throw e;
  } finally {
    tx.release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.MIGRATION_DATABASE_URL) throw Error('MIGRATION_DATABASE_URL required');
  const pool = makePool(process.env.MIGRATION_DATABASE_URL);
  try {
    await migrate(pool);
    console.log('Migrations applied');
  } finally {
    await pool.end();
  }
}
