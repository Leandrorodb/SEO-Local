/**
 * Creates a private, isolated test workspace for the current Windows account.
 * Local development only; it is NEVER a paid subscription or a commercial license.
 * Idempotent: other organizations and customer data are left untouched.
 */
import { makePool } from '../packages/db/index.js';

const localOnly =
  process.env.NODE_ENV === 'development' &&
  process.env.LRT_LOCAL_OIDC === 'I_UNDERSTAND_LOCAL_TEST_ONLY' &&
  process.env.LRT_LOCAL_EASY_LOGIN === 'LOCAL_MACHINE_ONLY' &&
  process.env.OWNER_SUBJECT === 'lrt-local-owner';
if (!localOnly) throw Error('Local bootstrap is disabled outside the explicitly authorized Windows test environment');
const url = process.env.MIGRATION_DATABASE_URL;
if (!url || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname))
  throw Error('Refusing to provision a nonlocal database');
const pool = makePool(url);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const user = (await client.query(
    'SELECT id FROM users WHERE auth_subject=$1 AND platform_owner=true AND disabled=false',
    ['lrt-local-owner'],
  )).rows[0];
  if (!user) throw Error('Owner must be provisioned before creating a local workspace');

  const plan = (await client.query(`
    INSERT INTO plans(code,max_locations,max_keywords,max_monthly_queries,max_users,monthly_budget_micros)
    VALUES ('LOCAL_TEST_ONLY',500,20000,10000,10,0)
    ON CONFLICT(code) DO UPDATE SET
      max_locations=500,max_keywords=20000,max_monthly_queries=10000,max_users=10,
      monthly_budget_micros=0
    RETURNING id
  `)).rows[0];
  const org = (await client.query(`
    INSERT INTO organizations(name,slug) VALUES('Meu ambiente local','meu-ambiente-local')
    ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id
  `)).rows[0];
  await client.query(`
    INSERT INTO organization_members(organization_id,user_id,role,status)
    VALUES ($1,$2,'org_admin','ACTIVE')
    ON CONFLICT(organization_id,user_id) DO UPDATE SET role='org_admin',status='ACTIVE'
  `,[org.id,user.id]);
  await client.query(`
    INSERT INTO subscriptions(organization_id,plan_id,billing_status,entitlement_status,paid_through)
    VALUES ($1,$2,'PAID','ACTIVE',now()+interval '365 days')
    ON CONFLICT(organization_id) DO UPDATE SET
      plan_id=EXCLUDED.plan_id, billing_status='PAID',entitlement_status='ACTIVE',
      paid_through=GREATEST(subscriptions.paid_through,now()+interval '365 days')
  `,[org.id,plan.id]);
  await client.query('COMMIT');
  console.log('Ambiente de teste local preparado. Nenhum pagamento foi realizado ou simulado.');
} catch(e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
