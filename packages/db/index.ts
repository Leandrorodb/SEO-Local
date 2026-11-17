import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
export type Tx = pg.PoolClient;
export const makePool = (url: string) =>
  new pg.Pool({
    connectionString: url,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
export const typedDatabase = (pool: pg.Pool) => drizzle(pool);
export async function transaction<T>(
  pool: pg.Pool,
  context: { subject?: string; org?: string; owner?: boolean; system?: boolean },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(
      "SELECT set_config('app.subject',$1,true),set_config('app.organization_id',$2,true),set_config('app.owner',$3,true),set_config('app.system',$4,true)",
      [
        context.subject ?? '',
        context.org ?? '',
        String(context.owner ?? false),
        String(context.system ?? false),
      ],
    );
    const value = await fn(tx);
    await tx.query('COMMIT');
    return value;
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally {
    tx.release();
  }
}
export async function assertRuntimeRole(pool: pg.Pool) {
  const { rows } = await pool.query(
    "SELECT r.rolsuper,r.rolbypassrls,EXISTS(SELECT 1 FROM pg_tables t WHERE t.schemaname='public' AND t.tableowner=current_user) owns_tables FROM pg_roles r WHERE r.rolname=current_user",
  );
  if (!rows[0] || rows[0].rolsuper || rows[0].rolbypassrls || rows[0].owns_tables)
    throw Error('Unsafe database role: runtime must not own tables, be superuser or BYPASSRLS');
}
