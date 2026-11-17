import { createHash, randomUUID } from 'node:crypto';
import type { Tx } from '../db/index.js';
import type { AuditInput, RankQuery } from '../contracts/index.js';
import type { RankProvider } from '../rank-providers/index.js';
import { entitlement, locationAccess, log, type Context } from '../../apps/api/auth.js';
import { requireThat } from './errors.js';
import { localPreviewEnabled } from '../rank-providers/local-chrome-preview.js';
function canonical(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonical(x)]),
    );
  return v;
}
export const hash = (v: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(v)))
    .digest('hex');
export async function planAudit(
  tx: Tx,
  c: Context,
  locationId: string,
  input: AuditInput,
  key: string,
  provider: RankProvider,
  environment: string,
) {
  const location = await locationAccess(tx, c, locationId);
  const license = await entitlement(tx, c.org, true);
  const requestHash = hash({ locationId, input });
  const previous = (
    await tx.query('SELECT * FROM audit_runs WHERE organization_id=$1 AND request_key=$2', [
      c.org,
      key,
    ])
  ).rows[0];
  if (previous) {
    requireThat(previous.request_hash === requestHash, 409, 'IDEMPOTENCY_CONFLICT');
    return {
      runId: previous.id,
      status: previous.status,
      replayed: true,
      plannedTasks: previous.config_snapshot.plannedTasks,
    };
  }
  const grid = (
    await tx.query(
      'SELECT * FROM search_grids WHERE organization_id=$1 AND location_id=$2 AND id=$3',
      [c.org, locationId, input.gridId],
    )
  ).rows[0];
  requireThat(grid, 404, 'GRID_NOT_FOUND');
  const keywords = (
    await tx.query(
      "SELECT k.*,c.name cluster FROM keywords k JOIN keyword_clusters c ON c.organization_id=k.organization_id AND c.id=k.cluster_id WHERE k.organization_id=$1 AND k.location_id=$2 AND k.status='ACTIVE' AND k.language=$3 ORDER BY k.id",
      [c.org, locationId, input.language],
    )
  ).rows;
  requireThat(keywords.length, 422, 'NO_ACTIVE_KEYWORDS');
  const queries: RankQuery[] = keywords.flatMap((k) =>
    grid.points.map((p: { sequence: number; lat: number; lng: number }) => ({
      term: k.term,
      keywordId: k.id,
      kind: k.kind,
      cluster: k.cluster,
      surface: input.surface,
      language: input.language,
      device: input.device,
      lat: p.lat,
      lng: p.lng,
      depth: 20,
      cid: location.cid,
      placeId: location.place_id,
      expectedName: location.name,
      point: p.sequence,
      algorithmVersion: 'v3.1',
    })),
  );
  if (provider.id === 'local_chrome_preview')
    requireThat(queries.length <= 100, 422, 'LOCAL_PREVIEW_MAX_100_TASKS');
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['provider-budget:' + provider.id]);
  const settings = (await tx.query('SELECT * FROM provider_settings WHERE id=$1', [provider.id]))
    .rows[0];
  const available =
    settings?.enabled &&
    settings?.authorized &&
    settings?.license_tag &&
    provider.id !== 'disabled' &&
    (!provider.demo || environment === 'test' || environment === 'staging' ||
      (environment === 'development' && provider.id === 'local_chrome_preview' && localPreviewEnabled()));
  if (!available) {
    requireThat(input.dryRun, 503, 'PROVIDER_UNAVAILABLE');
    return {
      status: 'PROVIDER_UNAVAILABLE',
      plannedTasks: queries.length,
      keywordCount: keywords.length,
      gridPoints: grid.points.length,
      estimatedCostUsdMicros: null,
    };
  }
  requireThat(provider.supports(input.surface), 422, 'UNSUPPORTED_SURFACE');
  requireThat(
    location.identity_status === 'CONFIRMED' && (location.cid || location.place_id),
    409,
    'IDENTITY_UNCONFIRMED',
  );
  const quote = await provider.quote(queries[0]);
  requireThat(
    Number.isSafeInteger(quote.maxCostMicros) &&
      quote.maxCostMicros >= 0 &&
      Number.isInteger(quote.depth) &&
      quote.depth >= 1 &&
      quote.depth <= 100,
    503,
    'PRICE_UNAVAILABLE',
  );
  // Contract: quote is a hard maximum for every query in this surface/depth batch.
  queries.forEach((q) => (q.depth = quote.depth));
  const cost = queries.length * quote.maxCostMicros;
  requireThat(cost <= input.maxProviderBudgetUsdMicros, 402, 'REQUEST_BUDGET_EXCEEDED');
  const used = (
    await tx.query(
      "SELECT count(*) FILTER(WHERE state<>'RELEASED')::int units,coalesce(sum(CASE WHEN state='RESERVED' THEN reserved_cost WHEN state='SETTLED' THEN cost ELSE 0 END),0)::bigint cost FROM usage_ledger WHERE organization_id=$1 AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
      [c.org],
    )
  ).rows[0];
  requireThat(
    used.units + queries.length <= license.max_monthly_queries,
    429,
    'QUERY_QUOTA_EXCEEDED',
  );
  requireThat(
    Number(used.cost) + cost <= Number(license.monthly_budget_micros),
    402,
    'TENANT_BUDGET_EXCEEDED',
  );
  // Cross-tenant totals use a narrowly scoped SECURITY DEFINER function, not bypassing RLS here.
  const globalUsage = (await tx.query('SELECT * FROM lrt_global_usage()')).rows[0];
  requireThat(globalUsage, 503, 'BUDGET_UNAVAILABLE');
  requireThat(
    Number(globalUsage.cost) + cost <= Number(settings.global_monthly_budget) &&
      Number(globalUsage.daily) + cost <= Number(settings.global_daily_budget),
    402,
    'GLOBAL_BUDGET_EXCEEDED',
  );
  const summary = {
    plannedTasks: queries.length,
    keywordCount: keywords.length,
    gridPoints: grid.points.length,
    estimatedCostUsdMicros: cost,
    provider: provider.id,
    isDemo: provider.demo,
  };
  if (input.dryRun) return { ...summary, status: 'PREFLIGHT_OK' };
  const runId = randomUUID();
  await tx.query(
    'INSERT INTO audit_runs(id,organization_id,location_id,created_by,request_key,request_hash,config_snapshot,provider,is_demo,estimated_cost) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      runId,
      c.org,
      locationId,
      c.principal.id,
      key,
      requestHash,
      JSON.stringify({
        ...input,
        ...summary,
        budgetDayUtc: new Date().toISOString().slice(0, 10),
        location: {
          name: location.name,
          city: location.city,
          address: location.address,
          cid: location.cid,
          placeId: location.place_id,
        },
      }),
      provider.id,
      provider.demo,
      cost,
    ],
  );
  for (const q of queries) {
    const taskId = randomUUID();
    await tx.query(
      'INSERT INTO audit_tasks(id,organization_id,run_id,keyword_id,query_snapshot,idempotency_key,reserved_cost) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        taskId,
        c.org,
        runId,
        q.keywordId,
        JSON.stringify(q),
        hash({ runId, keyword: q.keywordId, point: q.point, surface: q.surface }),
        quote.maxCostMicros,
      ],
    );
    await tx.query(
      'INSERT INTO usage_ledger(organization_id,task_id,run_id,reserved_cost) VALUES($1,$2,$3,$4)',
      [c.org, taskId, runId, quote.maxCostMicros],
    );
  }
  await log(tx, c, 'audit.queued', runId, summary);
  return { ...summary, runId, status: 'QUEUED' };
}
