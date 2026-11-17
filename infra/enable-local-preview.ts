import { makePool } from '../packages/db/index.js';
import { localPreviewEnabled } from '../packages/rank-providers/local-chrome-preview.js';

if (!localPreviewEnabled()) throw Error('Enable staging-only, explicit opt-in before activation');
if (!process.env.MIGRATION_DATABASE_URL) throw Error('MIGRATION_DATABASE_URL required');
const u = new URL(process.env.MIGRATION_DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))
  throw Error('Local-preview configuration must target a local PostgreSQL database');
const pool = makePool(process.env.MIGRATION_DATABASE_URL);
try {
  await pool.query(`
    INSERT INTO provider_settings
      (id, enabled, authorized, license_tag, retention_days, global_daily_budget, global_monthly_budget)
    VALUES ('local_chrome_preview', true, true, 'LOCAL_EXPERIMENT_ONLY', 0, 0, 0)
    ON CONFLICT (id) DO UPDATE SET
      enabled=true, authorized=true, license_tag='LOCAL_EXPERIMENT_ONLY',
      retention_days=0, global_daily_budget=0, global_monthly_budget=0
  `);
  console.log('Local Chrome preview enabled in the local database. Cost cap: 0 API USD. Staging-only.');
} finally { await pool.end(); }
