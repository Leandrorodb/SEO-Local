import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Services } from './app.js';
import { transaction, type Tx } from '../../packages/db/index.js';
import { uuid, text } from '../../packages/contracts/index.js';
import { administrative, log, type Context, entitlement } from './auth.js';
import { requireThat } from '../../packages/domain/errors.js';
import { hash } from '../../packages/domain/audits.js';
export function registerOwner(app: FastifyInstance, s: Services) {
  const wrap = <T>(r: FastifyRequest, data: T) => ({ data, meta: { requestId: r.id } });
  async function owner<T>(
    r: FastifyRequest,
    fn: (tx: Tx, c: Context) => Promise<T>,
    recent = false,
  ) {
    const p = await s.principal(r);
    requireThat(p.owner, 403, 'OWNER_REQUIRED');
    administrative(p, recent);
    return transaction(s.pool, { subject: p.subject, owner: true }, (tx) =>
      fn(tx, { principal: p, org: '', role: 'platform_owner', requestId: r.id }),
    );
  }
  app.get('/v1/platform/organizations', async (r) =>
    wrap(
      r,
      await owner(
        r,
        async (tx) =>
          (
            await tx.query(
              'SELECT o.*,s.entitlement_status,s.billing_status,s.paid_through,s.version,s.plan_id FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id ORDER BY o.name',
            )
          ).rows,
      ),
    ),
  );
  app.get('/v1/platform/plans', async (r) =>
    wrap(
      r,
      await owner(r, async (tx) => (await tx.query('SELECT * FROM plans ORDER BY code')).rows),
    ),
  );
  app.post('/v1/platform/plans', async (r) =>
    wrap(
      r,
      await owner(
        r,
        async (tx, c) => {
          const b = z
            .object({
              code: text,
              maxLocations: z.number().int().positive(),
              maxKeywords: z.number().int().positive(),
              maxMonthlyQueries: z.number().int().positive(),
              maxUsers: z.number().int().positive(),
              monthlyBudgetMicros: z.number().int().nonnegative().max(1e12),
            })
            .strict()
            .parse(r.body);
          const row = (
            await tx.query(
              'INSERT INTO plans(code,max_locations,max_keywords,max_monthly_queries,max_users,monthly_budget_micros) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
              [
                b.code,
                b.maxLocations,
                b.maxKeywords,
                b.maxMonthlyQueries,
                b.maxUsers,
                b.monthlyBudgetMicros,
              ],
            )
          ).rows[0];
          await tx.query(
            'INSERT INTO audit_logs(actor,action,resource_id,trace_id) VALUES($1,$2,$3,$4)',
            [c.principal.id, 'plan.created', row.id, c.requestId],
          );
          return row;
        },
        true,
      ),
    ),
  );
  app.post('/v1/organizations', async (r) =>
    wrap(
      r,
      await owner(
        r,
        async (tx, c) => {
          const b = z
            .object({
              name: text,
              slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
              planId: uuid,
              paidThrough: z.string().datetime(),
              adminSubject: text,
              adminEmail: z.email(),
              reason: z.string().trim().min(8).max(500),
            })
            .strict()
            .parse(r.body);
          requireThat(Date.parse(b.paidThrough) > Date.now(), 422, 'PAID_PERIOD_REQUIRED');
          const key = s.key(r),
            digest = hash(b);
          await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['org:' + b.slug]);
          const old = (await tx.query('SELECT * FROM organizations WHERE slug=$1', [b.slug]))
            .rows[0];
          if (old) {
            const event = (
              await tx.query(
                'SELECT * FROM subscription_events WHERE organization_id=$1 AND event_key=$2',
                [old.id, key],
              )
            ).rows[0];
            requireThat(event?.request_hash === digest, 409, 'ORGANIZATION_CONFLICT');
            return old;
          }
          const plan = (await tx.query('SELECT * FROM plans WHERE id=$1', [b.planId])).rows[0];
          requireThat(plan, 422, 'PLAN_NOT_FOUND');
          const org = (
            await tx.query('INSERT INTO organizations(name,slug) VALUES($1,$2) RETURNING *', [
              b.name,
              b.slug,
            ])
          ).rows[0];
          const user = (
            await tx.query(
              'INSERT INTO users(auth_subject,email) VALUES($1,$2) ON CONFLICT(auth_subject) DO UPDATE SET email=users.email RETURNING *',
              [b.adminSubject, b.adminEmail],
            )
          ).rows[0];
          requireThat(!user.disabled, 409, 'USER_DISABLED');
          await tx.query(
            "INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'org_admin')",
            [org.id, user.id],
          );
          await tx.query(
            "INSERT INTO subscriptions(organization_id,plan_id,billing_status,entitlement_status,paid_through) VALUES($1,$2,'PAID','ACTIVE',$3)",
            [org.id, b.planId, b.paidThrough],
          );
          await tx.query(
            'INSERT INTO subscription_events(organization_id,event_key,request_hash,payload) VALUES($1,$2,$3,$4)',
            [
              org.id,
              key,
              digest,
              JSON.stringify({
                type: 'MANUAL_CONTRACT',
                paidThrough: b.paidThrough,
                reason: b.reason,
              }),
            ],
          );
          await log(tx, { ...c, org: org.id }, 'organization.provisioned', org.id);
          return org;
        },
        true,
      ),
    ),
  );
  app.patch<{ Params: { id: string } }>('/v1/platform/organizations/:id/license', async (r) =>
    wrap(
      r,
      await owner(
        r,
        async (tx, c) => {
          const org = uuid.parse(r.params.id),
            b = z
              .object({
                expectedVersion: z.number().int().positive(),
                status: z.enum(['ACTIVE', 'SUSPENDED']),
                paidThrough: z.string().datetime(),
                reason: z.string().trim().min(8).max(500),
                amountCents: z.number().int().nonnegative(),
                currency: z.literal('BRL'),
              })
              .strict()
              .parse(r.body),
            key = s.key(r),
            digest = hash(b);
          const sub = (
            await tx.query('SELECT * FROM subscriptions WHERE organization_id=$1 FOR UPDATE', [org])
          ).rows[0];
          requireThat(sub, 404, 'SUBSCRIPTION_NOT_FOUND');
          const previous = (
            await tx.query(
              'SELECT * FROM subscription_events WHERE organization_id=$1 AND event_key=$2',
              [org, key],
            )
          ).rows[0];
          if (previous) {
            requireThat(previous.request_hash === digest, 409, 'IDEMPOTENCY_CONFLICT');
            return { replayed: true, ...previous.payload };
          }
          requireThat(sub.version === b.expectedVersion, 409, 'STALE_LICENSE_VERSION');
          requireThat(
            b.status !== 'ACTIVE' || Date.parse(b.paidThrough) > Date.now(),
            422,
            'PAID_PERIOD_REQUIRED',
          );
          const updated = (
            await tx.query(
              'UPDATE subscriptions SET entitlement_status=$2,billing_status=$3,paid_through=$4,version=version+1 WHERE organization_id=$1 RETURNING *',
              [org, b.status, b.status === 'ACTIVE' ? 'PAID' : 'UNPAID', b.paidThrough],
            )
          ).rows[0];
          await tx.query(
            'INSERT INTO subscription_events(organization_id,event_key,request_hash,payload) VALUES($1,$2,$3,$4)',
            [org, key, digest, JSON.stringify({ ...b, version: updated.version })],
          );
          await log(tx, { ...c, org }, 'license.changed', org, { ...b, version: updated.version });
          return updated;
        },
        true,
      ),
    ),
  );
  app.get('/v1/platform/audit-logs', async (r) =>
    wrap(
      r,
      await owner(
        r,
        async (tx) =>
          (await tx.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200')).rows,
      ),
    ),
  );
  app.get('/v1/platform/legal-requests', async (r) =>
    wrap(
      r,
      await owner(
        r,
        async (tx) =>
          (await tx.query('SELECT * FROM legal_data_requests ORDER BY created_at DESC LIMIT 200'))
            .rows,
      ),
    ),
  );
  app.post('/v1/webhooks/billing', async () => {
    requireThat(false, 503, 'BILLING_GATEWAY_NOT_CONFIGURED');
  });
  app.get('/v1/team', async (r) =>
    wrap(
      r,
      await s.tenant(
        r,
        ['org_admin'],
        async (tx, c) =>
          (
            await tx.query(
              'SELECT m.user_id,m.role,m.status FROM organization_members m WHERE organization_id=$1',
              [c.org],
            )
          ).rows,
      ),
    ),
  );
  app.post('/v1/team', async (r) =>
    wrap(
      r,
      await s.tenant(r, ['org_admin'], async (tx, c) => {
        administrative(c.principal, true);
        const b = z
          .object({
            userId: uuid,
            role: z.enum(['org_admin', 'analyst', 'client_viewer']),
            locationIds: z.array(uuid).max(500),
          })
          .strict()
          .parse(r.body);
        const license = await entitlement(tx, c.org, true);
        const old = (
          await tx.query(
            'SELECT * FROM organization_members WHERE organization_id=$1 AND user_id=$2',
            [c.org, b.userId],
          )
        ).rows[0];
        if (!old || old.status !== 'ACTIVE') {
          const count = (
            await tx.query(
              "SELECT count(*)::int n FROM organization_members WHERE organization_id=$1 AND status='ACTIVE'",
              [c.org],
            )
          ).rows[0].n;
          requireThat(count < license.max_users, 429, 'USER_QUOTA_EXCEEDED');
        }
        requireThat(
          b.userId !== c.principal.id || b.role === 'org_admin',
          409,
          'CANNOT_DEMOTE_SELF',
        );
        await tx.query(
          "INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,status='ACTIVE'",
          [c.org, b.userId, b.role],
        );
        await tx.query('DELETE FROM location_acl WHERE organization_id=$1 AND user_id=$2', [
          c.org,
          b.userId,
        ]);
        for (const id of new Set(b.locationIds))
          await tx.query(
            'INSERT INTO location_acl(organization_id,location_id,user_id) VALUES($1,$2,$3)',
            [c.org, id, b.userId],
          );
        await log(tx, c, 'membership.changed', b.userId, { role: b.role });
        return { userId: b.userId };
      }),
    ),
  );
  app.patch<{ Params: { id: string } }>('/v1/team/:id/revoke', async (r) =>
    wrap(
      r,
      await s.tenant(r, ['org_admin'], async (tx, c) => {
        administrative(c.principal, true);
        const id = uuid.parse(r.params.id);
        requireThat(id !== c.principal.id, 409, 'CANNOT_REVOKE_SELF');
        await tx.query(
          "UPDATE organization_members SET status='REVOKED' WHERE organization_id=$1 AND user_id=$2",
          [c.org, id],
        );
        await log(tx, c, 'membership.revoked', id);
        return { revoked: true };
      }),
    ),
  );
  app.post('/v1/platform/users', async (r) =>
    wrap(
      r,
      await owner(
        r,
        async (tx, c) => {
          const b = z.object({ subject: text, email: z.email() }).strict().parse(r.body);
          const user = (
            await tx.query(
              'INSERT INTO users(auth_subject,email) VALUES($1,$2) RETURNING id,email',
              [b.subject, b.email],
            )
          ).rows[0];
          await tx.query(
            'INSERT INTO audit_logs(actor,action,resource_id,trace_id) VALUES($1,$2,$3,$4)',
            [c.principal.id, 'user.provisioned', user.id, c.requestId],
          );
          return user;
        },
        true,
      ),
    ),
  );
}
