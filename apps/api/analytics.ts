import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { uuid, auditInput } from '../../packages/contracts/index.js';
import { requireThat } from '../../packages/domain/errors.js';
import { hash, planAudit } from '../../packages/domain/audits.js';
import { alertRules, signals, budgetLevel } from './signals.js';
import { administrative, entitlement, locationAccess, log, type Context } from './auth.js';
import { readers, writers, type Services } from './app.js';
import { maskLegacyBrowserRank, trustedBrowserReport } from '../../packages/domain/trusted-measurement.js';
import type { Tx } from '../../packages/db/index.js';
export type Measurement = {
  id: string;
  run_id: string;
  status: string;
  position: number | null;
  observed_at: string;
  result_depth: number;
  provider: string;
  is_demo: boolean;
  query_snapshot: {
    term: string;
    kind: string;
    surface: string;
    lat: number;
    lng: number;
    language: string;
    device: string;
    cluster: string;
    algorithmVersion: string;
  };
  [key: string]: unknown;
};
export function sliceKey(m: Measurement) {
  const q = m.query_snapshot;
  return JSON.stringify([
    q.term,
    q.kind,
    q.surface,
    q.lat,
    q.lng,
    q.language,
    q.device,
    m.result_depth,
    q.algorithmVersion,
    m.provider,
    m.is_demo,
  ]);
}
/** Old experimental measurements remain immutable, but are never trusted. */
export function hideUnprovenBrowserRank(m: Measurement): Measurement {
  return maskLegacyBrowserRank(m);
}
function requireCurrentBrowserProof(content: { provider?: string; rows?: Measurement[] }) {
  requireThat(trustedBrowserReport(content), 409, 'LEGACY_BROWSER_REPORT_REQUIRES_REMEASUREMENT');
}

export function compareHistory(rows: Measurement[]) {
  const last = new Map<string, Measurement>();
  const history = rows.map((r) => {
    const key = sliceKey(r),
      prior = last.get(key);
    last.set(key, r);
    const delta =
      prior?.status === 'VERIFIED' && r.status === 'VERIFIED'
        ? Number(prior.position) - Number(r.position)
        : null;
    return { ...r, delta };
  });
  const latest = [...last.values()];
  const commercial = latest.filter((x) => x.query_snapshot.kind === 'COMMERCIAL');
  const verified = commercial.filter((x) => x.status === 'VERIFIED');
  return {
    latest,
    history,
    summary: {
      samples: commercial.length,
      verified: verified.length,
      top1: verified.filter((x) => x.position === 1).length,
      top3: verified.filter((x) => Number(x.position) <= 3).length,
      top5: verified.filter((x) => Number(x.position) <= 5).length,
      top10: verified.filter((x) => Number(x.position) <= 10).length,
      brandSamples: latest.length - commercial.length,
    },
  };
}
export function feedbackText(content: {
  name: string;
  city: string;
  isDemo: boolean;
  provider?: string;
  rows: Measurement[];
  agency?: string;
}) {
  return (
    `${content.provider === 'local_chrome_preview'
      ? 'COLETA EXPERIMENTAL LOCAL — NÃO HOMOLOGADA PARA USO COMERCIAL\nResultados observados no navegador, sujeitos a revisão.\n\n'
      : content.isDemo ? 'DEMO — DADOS SINTÉTICOS\n\n' : ''}${content.agency ? content.agency + '\n' : ''}Local Rank Tracker | ${content.name}\n${content.city}\n\n` +
    content.rows
      .map(
        (m) =>
          `${m.status === 'VERIFIED' && m.position != null ? `${m.position}º` : `INCONCLUSIVO (${m.status})`} • ${m.query_snapshot.term}${m.query_snapshot.kind === 'BRAND' ? ' [marca]' : ''}\n${m.query_snapshot.cluster} · ${m.query_snapshot.surface} · ${m.query_snapshot.lat}, ${m.query_snapshot.lng}\n${m.provider} · ${new Date(m.observed_at).toISOString()} · ${m.query_snapshot.language} · ${m.query_snapshot.device} · profundidade ${m.result_depth}`,
      )
      .join('\n\n') +
    '\n\nPosições observadas nos pontos e datas indicados. Não representam garantia para toda a cidade. Apenas identidade estável e resultados verificados; posição orgânica (anúncios excluídos).'
  );
}
export async function pdfBytes(text: string, logoBase64?: string | null, createdAt?: Date) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 45,
    info: {
      Title: 'Local Rank Tracker — Relatório',
      ...(createdAt ? { CreationDate: createdAt } : {}),
    },
  });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (x) => chunks.push(x));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  if (logoBase64) {
    doc.image(Buffer.from(logoBase64, 'base64'), 45, 35, { fit: [150, 55] });
    doc.y = 105;
  }
  doc.fontSize(11).text(text, { lineGap: 4 });
  doc.end();
  return finished;
}
export function registerAnalytics(app: FastifyInstance, s: Services) {
  const wrap = <T>(r: FastifyRequest, data: T) => ({ data, meta: { requestId: r.id } });
  async function measurements(tx: Tx, c: Context, id: string) {
    await locationAccess(tx, c, id);
    return (
      await tx.query(
        'SELECT * FROM (SELECT * FROM rank_measurements WHERE organization_id=$1 AND location_id=$2 ORDER BY observed_at DESC,id DESC LIMIT 10000) m ORDER BY observed_at,id',
        [c.org, id],
      )
    ).rows.map((m: Measurement) => hideUnprovenBrowserRank(m));
  }
  app.get<{ Params: { id: string } }>('/v1/locations/:id/rankings', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) =>
        compareHistory(await measurements(tx, c, r.params.id)),
      ),
    ),
  );
  app.get<{ Params: { orgId: string } }>('/v1/organizations/:orgId/summary', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) => {
        requireThat(r.params.orgId === c.org, 403, 'TENANT_ACCESS_DENIED');
        const units = (
          await tx.query(
            `
          WITH visible AS (
            SELECT l.id,l.name,l.brand_id,b.name AS brand FROM business_locations l LEFT JOIN brands b ON b.id=l.brand_id AND b.organization_id=l.organization_id
            WHERE l.organization_id=$1 AND ($2<>'client_viewer' OR EXISTS (SELECT 1 FROM location_acl a WHERE a.organization_id=l.organization_id AND a.location_id=l.id AND a.user_id=$3))
          ), sliced AS (
            SELECT m.location_id,
            CASE WHEN m.provider='local_chrome_preview' AND m.parser_version<>'rank-proof-v2' THEN NULL ELSE m.position END AS position,
            CASE WHEN m.provider='local_chrome_preview' AND m.parser_version<>'rank-proof-v2' THEN 'REVIEW' ELSE m.status END AS status,
            m.query_snapshot->>'kind' AS kind,
            row_number() OVER (PARTITION BY m.location_id,m.provider,m.is_demo,m.result_depth,
              m.query_snapshot->>'term',m.query_snapshot->>'kind',m.query_snapshot->>'surface',m.query_snapshot->>'lat',m.query_snapshot->>'lng',
              m.query_snapshot->>'language',m.query_snapshot->>'device',m.query_snapshot->>'algorithmVersion' ORDER BY m.observed_at DESC,m.id DESC) AS rn
            FROM rank_measurements m JOIN visible v ON v.id=m.location_id WHERE m.organization_id=$1
          )
          SELECT v.id,v.name,v.brand,v.brand_id,count(*) FILTER(WHERE s.kind='COMMERCIAL')::int AS samples,
          count(*) FILTER(WHERE s.kind='COMMERCIAL' AND s.status='VERIFIED')::int AS verified,
          count(*) FILTER(WHERE s.kind='COMMERCIAL' AND s.status='VERIFIED' AND s.position=1)::int AS top1,
          count(*) FILTER(WHERE s.kind='COMMERCIAL' AND s.status='VERIFIED' AND s.position<=3)::int AS top3,
          count(*) FILTER(WHERE s.kind='COMMERCIAL' AND s.status='VERIFIED' AND s.position<=5)::int AS top5,
          count(*) FILTER(WHERE s.kind='COMMERCIAL' AND s.status='VERIFIED' AND s.position<=10)::int AS top10,
          count(*) FILTER(WHERE s.kind='BRAND')::int AS "brandSamples"
          FROM visible v LEFT JOIN sliced s ON s.location_id=v.id AND s.rn=1 GROUP BY v.id,v.name,v.brand,v.brand_id ORDER BY v.name,v.id
        `,
            [c.org, c.role, c.principal.id],
          )
        ).rows;
        return {
          units,
          provider: s.provider.id,
          providerEnabled: s.provider.id !== 'disabled',
          isDemo: s.provider.demo,
        };
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/locations/:id/competitors', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) => {
        await locationAccess(tx, c, r.params.id);
        return (
          await tx.query(
            `SELECT o.*,m.query_snapshot,m.observed_at,m.is_demo FROM rank_competitor_observations o JOIN rank_measurements m ON m.organization_id=o.organization_id AND m.id=o.measurement_id WHERE m.organization_id=$1 AND m.location_id=$2 AND o.retention_until>now() AND (m.provider<>'local_chrome_preview' OR m.parser_version='rank-proof-v2') ORDER BY m.observed_at DESC,o.position LIMIT 500`,
            [c.org, r.params.id],
          )
        ).rows;
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/locations/:id/alert-rules', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) =>
        alertRules.parse((await locationAccess(tx, c, r.params.id)).alert_rules),
      ),
    ),
  );
  app.patch<{ Params: { id: string } }>('/v1/locations/:id/alert-rules', async (r) =>
    wrap(
      r,
      await s.tenant(r, ['org_admin'], async (tx, c) => {
        const l = await locationAccess(tx, c, r.params.id);
        const rules = alertRules.parse(r.body);
        await tx.query(
          'UPDATE business_locations SET alert_rules=$3 WHERE organization_id=$1 AND id=$2',
          [c.org, l.id, JSON.stringify(rules)],
        );
        await log(tx, c, 'alert_rules.updated', l.id, rules);
        return rules;
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/locations/:id/opportunities', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) => {
        const latest = compareHistory(await measurements(tx, c, r.params.id)).latest;
        const states = new Map(
          (
            await tx.query(
              'SELECT measurement_id,state FROM opportunity_actions WHERE organization_id=$1 AND location_id=$2',
              [c.org, r.params.id],
            )
          ).rows.map((row) => [row.measurement_id, row.state]),
        );
        return latest
          .filter(
            (m) =>
              m.status === 'VERIFIED' &&
              m.query_snapshot.kind === 'COMMERCIAL' &&
              Number(m.position) > 3 &&
              Number(m.position) <= 10,
          )
          .map((m) => ({
            measurementId: m.id,
            term: m.query_snapshot.term,
            score: 11 - Number(m.position),
            is_demo: m.is_demo,
            state: states.get(m.id) ?? 'OPEN',
            reason: 'VERIFIED_POSITION_4_TO_10',
            suggestion:
              'Revisar consistência da categoria, serviços e conteúdo confirmado da ficha. Não há garantia de ganho.',
          }));
      }),
    ),
  );
  app.patch<{ Params: { id: string; measurementId: string } }>(
    '/v1/locations/:id/opportunities/:measurementId',
    async (r) =>
      wrap(
        r,
        await s.tenant(r, writers, async (tx, c) => {
          const l = await locationAccess(tx, c, r.params.id),
            id = uuid.parse(r.params.measurementId);
          const { state } = z
            .object({ state: z.enum(['IN_PROGRESS', 'DONE', 'DISMISSED']) })
            .strict()
            .parse(r.body);
          const m = await tx.query(
            "SELECT 1 FROM rank_measurements WHERE organization_id=$1 AND location_id=$2 AND id=$3 AND status='VERIFIED' AND position BETWEEN 4 AND 10 AND query_snapshot->>'kind'='COMMERCIAL' AND (provider<>'local_chrome_preview' OR parser_version='rank-proof-v2')",
            [c.org, l.id, id],
          );
          requireThat(m.rowCount, 404, 'OPPORTUNITY_NOT_FOUND');
          await tx.query(
            'INSERT INTO opportunity_actions(organization_id,location_id,measurement_id,state,changed_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,location_id,measurement_id) DO UPDATE SET state=excluded.state,changed_by=excluded.changed_by,updated_at=now()',
            [c.org, l.id, id, state, c.principal.id],
          );
          await log(tx, c, 'opportunity.updated', id, { state });
          return { state };
        }),
      ),
  );
  app.get<{ Params: { id: string } }>('/v1/locations/:id/alerts', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) => {
        const l = await locationAccess(tx, c, r.params.id);
        const rules = alertRules.parse(l.alert_rules);
        const out = signals(compareHistory(await measurements(tx, c, l.id)).history, rules);
        if (c.role === 'org_admin' && rules.upcoming) {
          const due = (
            await tx.query(
              "SELECT id,next_run_at FROM audit_schedules WHERE organization_id=$1 AND location_id=$2 AND enabled AND next_run_at BETWEEN now() AND now()+interval '24 hours' ORDER BY next_run_at LIMIT 50",
              [c.org, l.id],
            )
          ).rows;
          out.unshift(
            ...due.map((x) => ({
              measurementId: x.id,
              kind: 'UPCOMING_AUDIT',
              term: 'Auditoria nas próximas 24 horas',
              delta: null,
              observedAt: new Date(x.next_run_at).toISOString(),
            })),
          );
        }
        if (c.role === 'org_admin' && rules.budget) {
          const license = await entitlement(tx, c.org);
          const row = (
            await tx.query(
              "SELECT coalesce(sum(CASE WHEN state='RESERVED' THEN reserved_cost WHEN state='SETTLED' THEN cost ELSE 0 END),0) AS used FROM usage_ledger WHERE organization_id=$1 AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
              [c.org],
            )
          ).rows[0];
          const level = budgetLevel(Number(row.used), Number(license.monthly_budget_micros));
          if (level)
            out.unshift({
              measurementId: c.org,
              kind: 'MONTHLY_BUDGET',
              term:
                'O consumo e as reservas da organização atingiram ' +
                level +
                '% do orçamento mensal.',
              delta: null,
              observedAt: new Date().toISOString(),
            });
        }
        return out.slice(0, 500);
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/locations/:id/audits', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) => {
        await locationAccess(tx, c, r.params.id);
        return (
          await tx.query(
            'SELECT id,status,provider,is_demo,created_at,estimated_cost,actual_cost,config_snapshot FROM audit_runs WHERE organization_id=$1 AND location_id=$2 ORDER BY created_at DESC LIMIT 100',
            [c.org, r.params.id],
          )
        ).rows;
      }),
    ),
  );
  app.post<{ Params: { id: string } }>('/v1/locations/:id/reports', async (r) =>
    wrap(
      r,
      await s.tenant(r, writers, async (tx, c) => {
        const l = await locationAccess(tx, c, r.params.id),
          b = z.object({ runId: uuid }).strict().parse(r.body);
        const run = (
          await tx.query(
            'SELECT * FROM audit_runs WHERE organization_id=$1 AND location_id=$2 AND id=$3',
            [c.org, l.id, b.runId],
          )
        ).rows[0];
        requireThat(
          run && ['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(run.status),
          409,
          'RUN_NOT_COMPLETED',
        );
        const rows = (
          await tx.query(
            "SELECT * FROM rank_measurements WHERE organization_id=$1 AND run_id=$2 AND status='VERIFIED' AND (provider<>'local_chrome_preview' OR parser_version='rank-proof-v2') ORDER BY position,observed_at,id",
            [c.org, b.runId],
          )
        ).rows;
        requireThat(rows.length, 409, 'NO_VERIFIED_MEASUREMENTS');
        const branding = (
          await tx.query('SELECT * FROM organization_branding WHERE organization_id=$1', [c.org])
        ).rows[0];
        const content = {
          agency: branding?.display_name ?? null,
          logoBase64: branding?.logo_png?.toString('base64') ?? null,
          name: run.config_snapshot.location.name,
          city: run.config_snapshot.location.city,
          isDemo: run.is_demo,
          provider: run.provider,
          rows,
          version: '3.1',
          runId: b.runId,
        };
        const row = (
          await tx.query(
            'INSERT INTO report_drafts(organization_id,location_id,run_id,content_json,hash) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [c.org, l.id, b.runId, JSON.stringify(content), hash(content)],
          )
        ).rows[0];
        await log(tx, c, 'report.drafted', row.id);
        return row;
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/locations/:id/reports', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) => {
        await locationAccess(tx, c, r.params.id);
        return (
          await tx.query(
            "SELECT id,state,hash,created_at,run_id FROM report_drafts WHERE organization_id=$1 AND location_id=$2 AND ($3<>'client_viewer' OR state='APPROVED') ORDER BY created_at DESC",
            [c.org, r.params.id, c.role],
          )
        ).rows;
      }),
    ),
  );
  async function report(tx: Tx, c: Context, id: string) {
    const row = (
      await tx.query('SELECT * FROM report_drafts WHERE organization_id=$1 AND id=$2', [
        c.org,
        uuid.parse(id),
      ])
    ).rows[0];
    requireThat(row, 404, 'REPORT_NOT_FOUND');
    await locationAccess(tx, c, row.location_id);
    return row;
  }
  app.post<{ Params: { id: string } }>('/v1/reports/:id/review', async (r) =>
    wrap(
      r,
      await s.tenant(r, writers, async (tx, c) => {
        const row = await report(tx, c, r.params.id);
        requireThat(row.state === 'DRAFT', 409, 'INVALID_REPORT_TRANSITION');
        await tx.query(
          "UPDATE report_drafts SET state='IN_REVIEW' WHERE organization_id=$1 AND id=$2",
          [c.org, row.id],
        );
        await log(tx, c, 'report.submitted', row.id);
        return { state: 'IN_REVIEW' };
      }),
    ),
  );
  app.post<{ Params: { id: string } }>('/v1/reports/:id/approve', async (r) =>
    wrap(
      r,
      await s.tenant(r, ['org_admin'], async (tx, c) => {
        administrative(c.principal, true);
        const row = await report(tx, c, r.params.id);
        requireThat(row.state === 'IN_REVIEW', 409, 'INVALID_REPORT_TRANSITION');
        requireThat(row.hash === hash(row.content_json), 409, 'REPORT_HASH_MISMATCH');
        requireCurrentBrowserProof(row.content_json);
        await tx.query(
          "UPDATE report_drafts SET state='APPROVED',approved_by=$3 WHERE organization_id=$1 AND id=$2",
          [c.org, row.id, c.principal.id],
        );
        await log(tx, c, 'report.approved', row.id, { hash: row.hash });
        return { state: 'APPROVED' };
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/reports/:id', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) => {
        const row = await report(tx, c, r.params.id);
        requireThat(
          c.role !== 'client_viewer' || row.state === 'APPROVED',
          404,
          'REPORT_NOT_FOUND',
        );
        requireCurrentBrowserProof(row.content_json);
        return { ...row, text: feedbackText(row.content_json) };
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/reports/:id/whatsapp', async (r) =>
    wrap(
      r,
      await s.tenant(r, readers, async (tx, c) => {
        const row = await report(tx, c, r.params.id);
        requireThat(row.state === 'APPROVED', 409, 'REPORT_NOT_APPROVED');
        requireCurrentBrowserProof(row.content_json);
        return { text: feedbackText(row.content_json), hash: row.hash };
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/reports/:id/pdf', async (r, reply) => {
    const data = await s.tenant(r, readers, async (tx, c) => {
      const row = await report(tx, c, r.params.id);
      requireThat(row.state === 'APPROVED', 409, 'REPORT_NOT_APPROVED');
      requireCurrentBrowserProof(row.content_json);
      await log(tx, c, 'report.pdf_download', row.id, { snapshotHash: row.hash });
      return pdfBytes(
        feedbackText(row.content_json),
        row.content_json.logoBase64,
        new Date(row.created_at),
      );
    });
    reply
      .header('Content-Disposition', 'attachment; filename="local-rank-tracker.pdf"')
      .header('X-Content-SHA256', createHash('sha256').update(data).digest('hex'))
      .type('application/pdf');
    return data;
  });
  app.get('/v1/audit-schedules', async (r) =>
    wrap(
      r,
      await s.tenant(
        r,
        ['org_admin'],
        async (tx, c) =>
          (
            await tx.query(
              'SELECT * FROM audit_schedules WHERE organization_id=$1 ORDER BY next_run_at',
              [c.org],
            )
          ).rows,
      ),
    ),
  );
  app.post('/v1/audit-schedules', async (r) =>
    wrap(
      r,
      await s.tenant(r, ['org_admin'], async (tx, c) => {
        const b = z
          .object({
            locationId: uuid,
            config: auditInput,
            startNow: z.boolean().default(false),
            frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
            timezone: z.string().max(100),
            nextRunAt: z.string().datetime(),
          })
          .strict()
          .parse(r.body);
        await locationAccess(tx, c, b.locationId);
        const fingerprint = hash(b);
        const key =
          r.headers['idempotency-key'] === undefined && !b.startNow ? fingerprint : s.key(r);
        await entitlement(tx, c.org, true);
        const existing = (
          await tx.query(
            'SELECT * FROM audit_schedules WHERE organization_id=$1 AND created_by=$2 AND request_key=$3',
            [c.org, c.principal.id, key],
          )
        ).rows[0];
        if (existing) {
          requireThat(existing.request_hash === fingerprint, 409, 'IDEMPOTENCY_CONFLICT');
          return existing;
        }
        try {
          new Intl.DateTimeFormat('en', { timeZone: b.timezone });
        } catch {
          requireThat(false, 422, 'INVALID_TIMEZONE');
        }
        requireThat(Date.parse(b.nextRunAt) > Date.now(), 422, 'SCHEDULE_MUST_BE_FUTURE');
        const grid = await tx.query(
          'SELECT 1 FROM search_grids WHERE organization_id=$1 AND location_id=$2 AND id=$3',
          [c.org, b.locationId, b.config.gridId],
        );
        requireThat(grid.rowCount, 404, 'GRID_NOT_FOUND');
        const initial = b.startNow
          ? await planAudit(
              tx,
              c,
              b.locationId,
              { ...b.config, dryRun: false },
              'schedule-start:' + hash([c.principal.id, key]),
              s.provider,
              s.environment,
            )
          : null;
        const initialRunId = initial && 'runId' in initial ? initial.runId : null;
        requireThat(!b.startNow || initialRunId, 500, 'INITIAL_RUN_NOT_QUEUED');
        const row = (
          await tx.query(
            'INSERT INTO audit_schedules(organization_id,location_id,created_by,config,frequency,timezone,next_run_at,request_key,request_hash,initial_run_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
            [
              c.org,
              b.locationId,
              c.principal.id,
              JSON.stringify({ ...b.config, dryRun: false }),
              b.frequency,
              b.timezone,
              b.nextRunAt,
              key,
              fingerprint,
              initialRunId,
            ],
          )
        ).rows[0];
        await log(tx, c, 'schedule.created', row.id, { initialRunId, startNow: b.startNow });
        return row;
      }),
    ),
  );
  app.patch<{ Params: { id: string } }>('/v1/audit-schedules/:id', async (r) =>
    wrap(
      r,
      await s.tenant(r, ['org_admin'], async (tx, c) => {
        const b = z.object({ enabled: z.boolean() }).strict().parse(r.body);
        const row = (
          await tx.query(
            'UPDATE audit_schedules SET enabled=$3,version=version+1 WHERE organization_id=$1 AND id=$2 RETURNING *',
            [c.org, uuid.parse(r.params.id), b.enabled],
          )
        ).rows[0];
        requireThat(row, 404, 'SCHEDULE_NOT_FOUND');
        await log(tx, c, 'schedule.changed', row.id, b);
        return row;
      }),
    ),
  );
}
