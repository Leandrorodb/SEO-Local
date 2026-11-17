import { z } from 'zod';
import { makePool } from '../packages/db/index.js';
const subject = z.string().min(1).parse(process.env.OWNER_SUBJECT),
  email = z.email().parse(process.env.OWNER_EMAIL);
if (!process.env.MIGRATION_DATABASE_URL) throw Error('MIGRATION_DATABASE_URL required');
const pool = makePool(process.env.MIGRATION_DATABASE_URL);
const tx = await pool.connect();
try {
  await tx.query('BEGIN');
  const row = (
    await tx.query(
      'INSERT INTO users(auth_subject,email,platform_owner) VALUES($1,$2,true) ON CONFLICT(auth_subject) DO UPDATE SET platform_owner=true RETURNING id',
      [subject, email],
    )
  ).rows[0];
  await tx.query(
    "INSERT INTO audit_logs(actor,action,resource_id,trace_id) VALUES('bootstrap','owner.provisioned',$1,'cli')",
    [row.id],
  );
  await tx.query('COMMIT');
  console.log('Owner provisioned. Real IdP authentication and MFA remain mandatory.');
} catch (e) {
  await tx.query('ROLLBACK');
  throw e;
} finally {
  tx.release();
  await pool.end();
}
