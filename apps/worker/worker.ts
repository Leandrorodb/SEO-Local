import type pg from 'pg';
import { transaction, type Tx } from '../../packages/db/index.js';
import { entitlement, type Context } from '../api/auth.js';
import { requireThat, AppError } from '../../packages/domain/errors.js';
import { normalizeResult, type RankProvider } from '../../packages/rank-providers/index.js';
import { localPreviewEnabled } from '../../packages/rank-providers/local-chrome-preview.js';
import { BROWSER_PARSER_VERSION } from '../../packages/domain/trusted-measurement.js';
import { planAudit, hash } from '../../packages/domain/audits.js';
import { auditInput, type RankQuery } from '../../packages/contracts/index.js';
async function finishRun(tx: Tx, run: string) {
  // Compatible with FK KEY SHARE locks held by parallel inserts for this run.
  await tx.query('SELECT id FROM audit_runs WHERE id=$1 FOR NO KEY UPDATE', [run]);
  await tx.query(
    `UPDATE audit_runs r SET actual_cost=(SELECT coalesce(sum(cost),0) FROM usage_ledger WHERE run_id=r.id),status=CASE WHEN EXISTS(SELECT 1 FROM audit_tasks WHERE run_id=r.id AND state IN ('QUEUED','RUNNING')) THEN 'RUNNING' WHEN EXISTS(SELECT 1 FROM audit_tasks WHERE run_id=r.id AND state IN ('UNCERTAIN','CANCELLED')) THEN 'FAILED' WHEN EXISTS(SELECT 1 FROM rank_measurements WHERE run_id=r.id AND status<>'VERIFIED') THEN 'COMPLETED_WITH_WARNINGS' ELSE 'COMPLETED' END,ended_at=CASE WHEN EXISTS(SELECT 1 FROM audit_tasks WHERE run_id=r.id AND state IN ('QUEUED','RUNNING')) THEN NULL ELSE now() END WHERE id=$1`,
    [run],
  );
}
export async function processOne(
  pool: pg.Pool,
  provider: RankProvider,
  environment: string,
  taskId?: string,
) {
  requireThat(
    !provider.demo || ['test', 'staging'].includes(environment) ||
      (environment === 'development' && provider.id === 'local_chrome_preview' && localPreviewEnabled()),
    500,
    'DEMO_PROVIDER_FORBIDDEN',
  );
  const claim = await transaction(pool, { system: true }, async (tx) => {
    const task = (
      await tx.query(
        "SELECT t.*,r.created_by,r.provider,r.location_id,r.config_snapshot FROM audit_tasks t JOIN audit_runs r ON r.organization_id=t.organization_id AND r.id=t.run_id WHERE t.state='QUEUED' AND ($1::uuid IS NULL OR t.id=$1) ORDER BY r.created_at,t.id FOR UPDATE OF t SKIP LOCKED LIMIT 1",
        [taskId ?? null],
      )
    ).rows[0];
    if (!task) return null;
    try {
      await entitlement(tx, task.organization_id, true);
      requireThat(
        task.config_snapshot.budgetDayUtc === new Date().toISOString().slice(0, 10),
        409,
        'EXPIRED_BUDGET_RESERVATION',
      );
      const member = (
        await tx.query(
          "SELECT m.role,u.disabled FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='ACTIVE'",
          [task.organization_id, task.created_by],
        )
      ).rows[0];
      requireThat(
        member && !member.disabled && ['org_admin', 'analyst'].includes(member.role),
        403,
        'MEMBERSHIP_REVOKED',
      );
      const config = (await tx.query('SELECT * FROM provider_settings WHERE id=$1', [provider.id]))
        .rows[0];
      requireThat(
        task.provider === provider.id && config?.enabled && config.authorized && config.license_tag,
        503,
        'PROVIDER_UNAVAILABLE',
      );
      requireThat(provider.supports(task.query_snapshot.surface), 422, 'UNSUPPORTED_SURFACE');
      const q = task.query_snapshot as RankQuery;
      const keyword = await tx.query(
        'SELECT 1 FROM keywords WHERE organization_id=$1 AND location_id=$2 AND id=$3',
        [task.organization_id, task.location_id, task.keyword_id],
      );
      requireThat(
        keyword.rowCount &&
          q.keywordId === task.keyword_id &&
          q.cid === task.config_snapshot.location.cid &&
          q.placeId === task.config_snapshot.location.placeId &&
          task.idempotency_key ===
            hash({
              runId: task.run_id,
              keyword: task.keyword_id,
              point: q.point,
              surface: q.surface,
            }),
        403,
        'TASK_SCOPE_MISMATCH',
      );
      await tx.query(
        "UPDATE audit_tasks SET state='RUNNING',attempts=attempts+1,lease_until=now()+interval '3 minutes' WHERE id=$1",
        [task.id],
      );
      await tx.query("UPDATE audit_runs SET status='RUNNING' WHERE id=$1", [task.run_id]);
      return { ...task, config };
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      await tx.query("UPDATE audit_tasks SET state='CANCELLED' WHERE id=$1", [task.id]);
      await tx.query("UPDATE usage_ledger SET state='RELEASED' WHERE task_id=$1", [task.id]);
      await tx.query(
        'INSERT INTO audit_logs(organization_id,actor,action,resource_id,trace_id,metadata) VALUES($1,$2,$3,$4,$4,$5)',
        [
          task.organization_id,
          'worker',
          'task.cancelled',
          task.id,
          JSON.stringify({ code: e.code }),
        ],
      );
      await finishRun(tx, task.run_id);
      return { cancelled: true };
    }
  });
  if (!claim) return false;
  if (claim.cancelled) return true;
  const q = claim.query_snapshot as RankQuery;
  try {
    // The adapter must implement a bounded timeout and pass this idempotency key to its provider.
    const result = await provider.measure(q, claim.idempotency_key),
      normalized = normalizeResult(q, result);
    requireThat(
      result.costMicros <= Number(claim.reserved_cost),
      502,
      'PROVIDER_COST_EXCEEDS_RESERVATION',
    );
    await transaction(pool, { system: true }, async (tx) => {
      const task = (await tx.query('SELECT * FROM audit_tasks WHERE id=$1 FOR UPDATE', [claim.id]))
        .rows[0];
      if (task.state === 'DONE') return;
      requireThat(task.state === 'RUNNING', 409, 'TASK_LEASE_LOST');
      const inserted = (
        await tx.query(
          'INSERT INTO rank_measurements(organization_id,run_id,task_id,keyword_id,location_id,query_snapshot,observed_at,status,position,result_depth,identity_match,provider,provider_task_ref,cost,is_demo,parser_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id',
          [
            claim.organization_id,
            claim.run_id,
            claim.id,
            claim.keyword_id,
            claim.location_id,
            JSON.stringify(q),
            result.observedAt,
            normalized.status,
            normalized.position,
            result.depth,
            normalized.identityMatch,
            provider.id,
            result.taskRef,
            result.costMicros,
            provider.demo,
            provider.id === 'local_chrome_preview' ? BROWSER_PARSER_VERSION : 'v3.1',
          ],
        )
      ).rows[0];
      if (claim.config.retention_days > 0)
        for (const item of result.items.filter(
          (x) =>
            !x.sponsored &&
            (x.cid || x.placeId) &&
            !(q.cid && x.cid === q.cid) &&
            !(q.placeId && x.placeId === q.placeId),
        )) {
          await tx.query(
            "INSERT INTO rank_competitor_observations(organization_id,measurement_id,external_id,name,position,retention_until,source) VALUES($1,$2,$3,$4,$5,now()+($6 * interval '1 day'),$7)",
            [
              claim.organization_id,
              inserted.id,
              item.cid ?? item.placeId,
              item.name,
              item.position,
              claim.config.retention_days,
              claim.config.license_tag,
            ],
          );
        }
      await tx.query("UPDATE usage_ledger SET state='SETTLED',cost=$2 WHERE task_id=$1", [
        claim.id,
        result.costMicros,
      ]);
      await tx.query("UPDATE audit_tasks SET state='DONE',lease_until=NULL WHERE id=$1", [
        claim.id,
      ]);
      await finishRun(tx, claim.run_id);
    });
  } catch (e) {
    await transaction(pool, { system: true }, async (tx) => {
      await tx.query("UPDATE audit_tasks SET state='UNCERTAIN' WHERE id=$1 AND state='RUNNING'", [
        claim.id,
      ]);
      await tx.query(
        'INSERT INTO audit_logs(organization_id,actor,action,resource_id,trace_id,metadata) VALUES($1,$2,$3,$4,$4,$5)',
        [
          claim.organization_id,
          'worker',
          'task.uncertain',
          claim.id,
          JSON.stringify({
            code: e instanceof AppError ? e.code : 'PROVIDER_ERROR_RECONCILIATION_REQUIRED',
          }),
        ],
      );
      await finishRun(tx, claim.run_id);
    });
  }
  return true;
}
export async function recoverLeases(pool: pg.Pool) {
  return transaction(pool, { system: true }, async (tx) => {
    const expired = (
      await tx.query(
        "UPDATE audit_tasks SET state='UNCERTAIN' WHERE state='RUNNING' AND lease_until<now() RETURNING run_id",
      )
    ).rows;
    for (const r of expired) await finishRun(tx, r.run_id);
    await tx.query('DELETE FROM rank_competitor_observations WHERE retention_until<now()');
    return expired.length;
  });
}
export async function reconcileExpiredLicenses(pool: pg.Pool) {
  return transaction(pool, { system: true }, async (tx) => {
    const rows = (
      await tx.query(
        "UPDATE subscriptions SET entitlement_status='SUSPENDED',billing_status='UNPAID',version=version+1 WHERE entitlement_status='ACTIVE' AND billing_status='PAID' AND paid_through<=now() RETURNING organization_id,version",
      )
    ).rows;
    for (const row of rows)
      await tx.query(
        "INSERT INTO audit_logs(organization_id,actor,action,resource_id,trace_id,metadata) VALUES($1,'worker','license.expired',$1::uuid::text,'license-reconciler',$2)",
        [row.organization_id, JSON.stringify({ version: row.version })],
      );
    return rows.length;
  });
}
export function nextOccurrence(from: Date, frequency: string) {
  const next = new Date(from);
  if (frequency === 'MONTHLY') {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, last));
  } else next.setUTCDate(next.getUTCDate() + (frequency === 'WEEKLY' ? 7 : 1));
  return next;
}
export async function scheduleOne(pool: pg.Pool, provider: RankProvider, environment: string) {
  return transaction(pool, { system: true }, async (tx) => {
    const row = (
      await tx.query(
        'SELECT * FROM audit_schedules WHERE enabled AND next_run_at<=now() ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 1',
      )
    ).rows[0];
    if (!row) return false;
    const member = (
      await tx.query(
        "SELECT u.*,m.role FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='ACTIVE'",
        [row.organization_id, row.created_by],
      )
    ).rows[0];
    try {
      requireThat(
        member && !member.disabled && member.role === 'org_admin',
        403,
        'MEMBERSHIP_REVOKED',
      );
      const c: Context = {
        org: row.organization_id,
        principal: {
          id: member.id,
          subject: member.auth_subject,
          email: member.email,
          owner: false,
          mfa: true,
          authTime: 0,
        },
        role: member.role,
        requestId: 'schedule:' + row.id,
      };
      await planAudit(
        tx,
        c,
        row.location_id,
        auditInput.parse(row.config),
        'schedule:' + row.id + ':' + new Date(row.next_run_at).getTime(),
        provider,
        environment,
      );
      let next = nextOccurrence(new Date(row.next_run_at), row.frequency);
      while (next.getTime() <= Date.now()) next = nextOccurrence(next, row.frequency);
      await tx.query('UPDATE audit_schedules SET next_run_at=$2,last_error=NULL WHERE id=$1', [
        row.id,
        next,
      ]);
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      await tx.query('UPDATE audit_schedules SET enabled=false,last_error=$2 WHERE id=$1', [
        row.id,
        e.code,
      ]);
    }
    return true;
  });
}
