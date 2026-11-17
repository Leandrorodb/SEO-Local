import Fastify, { type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import type pg from 'pg';
import { transaction, type Tx } from '../../packages/db/index.js';
import {
  Authenticator,
  administrative,
  withTenant,
  locationAccess,
  entitlement,
  log,
  type Context,
  type Principal,
} from './auth.js';
import { AppError, requireThat } from '../../packages/domain/errors.js';
import {
  uuid,
  text,
  locationInput,
  pasteInput,
  auditInput,
} from '../../packages/contracts/index.js';
import { parseMapsUrl, grid5x5 } from '../../packages/domain/maps.js';
import { parsePaste } from '../../packages/domain/keywords.js';
import { hash, planAudit } from '../../packages/domain/audits.js';
import { DisabledProvider, type RankProvider } from '../../packages/rank-providers/index.js';
import { localPreviewEnabled } from '../../packages/rank-providers/local-chrome-preview.js';
import { coordinatesFromMapsUrl } from '../../packages/rank-providers/maps-detail.js';
import { suggestKeywords as suggestAutomaticKeywords, listNiches } from '../../packages/domain/auto-keywords.js';
import { registerAnalytics } from './analytics.js';
import { registerOwner } from './owner.js';
import { registerBranding } from './branding.js';
import { collectHelmetConnectSrc, parseAllowedOrigins } from './runtime-config.js';
import { captureOpenApi } from '../../packages/contracts/openapi.js';
export const readers = ['org_admin', 'analyst', 'client_viewer'],
  writers = ['org_admin', 'analyst'];
export type Dependencies = {
  pool: pg.Pool;
  auth: Authenticator;
  provider?: RankProvider;
  environment?: string;
  webOrigin?: string;
  logging?: boolean;
};
export type Services = {
  pool: pg.Pool;
  provider: RankProvider;
  environment: string;
  tenant: <T>(
    req: FastifyRequest,
    roles: string[],
    fn: (tx: Tx, c: Context) => Promise<T>,
    legal?: boolean,
  ) => Promise<T>;
  principal: (req: FastifyRequest) => Promise<Principal>;
  key: (req: FastifyRequest) => string;
};
export function buildApp(d: Dependencies) {
  const provider: RankProvider = d.provider ?? new DisabledProvider(),
    environment = d.environment ?? process.env.NODE_ENV ?? 'development';
  requireThat(
    !provider.demo || ['test', 'staging'].includes(environment) ||
      (environment === 'development' && provider.id === 'local_chrome_preview' && localPreviewEnabled()),
    500,
    'DEMO_PROVIDER_FORBIDDEN',
  );
  const app = Fastify({
    bodyLimit: 150000,
    trustProxy: false,
    logger: d.logging
      ? {
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'body',
            'res.headers["set-cookie"]',
          ],
        }
      : false,
  });
  captureOpenApi(app);
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: collectHelmetConnectSrc(process.env),
        frameAncestors: ["'none'"],
      },
    },
  });
  app.register(cors, {
    origin: parseAllowedOrigins(d.webOrigin),
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Organization-Id', 'Idempotency-Key'],
    methods: ['GET', 'POST', 'PATCH'],
  });
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.setErrorHandler((error, req, reply) => {
    const e = error as Error & { code?: string; statusCode?: number };
    let status = 500,
      code = 'INTERNAL_ERROR';
    if (e instanceof AppError) {
      status = e.status;
      code = e.code;
    } else if (e instanceof z.ZodError) {
      status = 422;
      code = 'INVALID_INPUT';
    } else if (e.code === '23505') {
      status = 409;
      code = 'DUPLICATE';
    } else if (e.code === '23503' || e.code === '23514' || e.code === '22P02') {
      status = 422;
      code = 'INVALID_REFERENCE';
    } else if (e.statusCode && e.statusCode < 500) {
      status = e.statusCode;
      code = status === 429 ? 'RATE_LIMIT' : 'INVALID_REQUEST';
    }
    if (status === 500)
      req.log.error({ err: e, requestId: req.id, route: req.routeOptions?.url }, 'Request failed');
    reply.status(status).send({ error: { code, message: code, requestId: req.id } });
  });
  const principal = (req: FastifyRequest) => d.auth.authenticate(req, d.pool);
  const services: Services = {
    pool: d.pool,
    provider,
    environment,
    principal,
    tenant: async (req, roles, fn, legal = false) =>
      withTenant(d.pool, await principal(req), req, roles, fn, legal),
    key: (req) =>
      z
        .string()
        .min(8)
        .max(128)
        .regex(/^[a-zA-Z0-9:_-]+$/)
        .parse(req.headers['idempotency-key']),
  };
  const wrap = <T>(req: FastifyRequest, data: T) => ({ data, meta: { requestId: req.id } });
  app.get('/health', async () => ({ status: 'ok', service: 'Local Rank Tracker' }));
  app.get('/v1/me/organizations', async (req) => {
    const p = await principal(req);
    const orgs = await transaction(
      d.pool,
      { subject: p.subject },
      async (tx) =>
        (
          await tx.query(
            "SELECT o.id,o.name,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1 AND m.status='ACTIVE' ORDER BY o.name",
            [p.id],
          )
        ).rows,
    );
    return wrap(req, { organizations: orgs, owner: p.owner, mfa: p.mfa, email: p.email });
  });
  app.get('/v1/brands', async (req) =>
    wrap(
      req,
      await services.tenant(
        req,
        writers,
        async (tx, c) =>
          (
            await tx.query('SELECT id,name FROM brands WHERE organization_id=$1 ORDER BY name,id', [
              c.org,
            ])
          ).rows,
      ),
    ),
  );
  app.post('/v1/brands', async (req, reply) => {
    const brand = await services.tenant(req, writers, async (tx, c) => {
      const { name } = z
        .object({ name: z.string().trim().min(1).max(120) })
        .strict()
        .parse(req.body);
      const row = (
        await tx.query('INSERT INTO brands(organization_id,name) VALUES($1,$2) RETURNING id,name', [
          c.org,
          name,
        ])
      ).rows[0];
      await log(tx, c, 'brand.created', row.id);
      return row;
    });
    return reply.code(201).send(wrap(req, brand));
  });
  app.get('/v1/locations', async (req) =>
    wrap(
      req,
      await services.tenant(
        req,
        readers,
        async (tx, c) =>
          (
            await tx.query(
              "SELECT l.* FROM business_locations l WHERE organization_id=$1 AND ($2<>'client_viewer' OR EXISTS(SELECT 1 FROM location_acl a WHERE a.organization_id=l.organization_id AND a.location_id=l.id AND a.user_id=$3)) ORDER BY l.created_at DESC LIMIT 500",
              [c.org, c.role, c.principal.id],
            )
          ).rows,
      ),
    ),
  );
  app.post('/v1/locations/resolve', async (req) => {
    const input = z.object({ mapsUrl: z.string().trim().min(1).max(2000) }).strict().parse(req.body);
    const parsed = parseMapsUrl(input.mapsUrl);
    // Never keep a tenant DB transaction open while Chrome navigates Maps.
    // Authorization is checked and the DB transaction closed BEFORE browsing.
    const configured = await services.tenant(req, writers, async (tx) => {
      const settings = (await tx.query(
        'SELECT enabled,authorized,license_tag FROM provider_settings WHERE id=$1', [provider.id],
      )).rows[0];
      return Boolean(settings?.enabled && settings?.authorized && settings?.license_tag && provider.resolve);
    });
    if (!configured) return wrap(req, { ...parsed, candidates: [], status: 'PROVIDER_UNAVAILABLE' });
    const result = provider.resolveWithDiagnostics
      ? await provider.resolveWithDiagnostics(parsed.url)
      : { status: 'REVIEW_REQUIRED', candidates: await provider.resolve!(parsed.url) };
    return wrap(req, { ...parsed, ...result });
  });
  // Optional operator-attested registration for the LOCAL, NONCOMMERCIAL pilot.
  // Never present user-entered data as extracted/verified by Google. The stable
  // CID is derived server-side from the Maps URL; actual ranking still needs
  // strict CID/name and visual evidence from the browser.
  app.post('/v1/locations/register-attested', async (req, reply) => {
    requireThat(provider.id === 'local_chrome_preview' && localPreviewEnabled(),
      403, 'MANUAL_ATTESTATION_LOCAL_ONLY');
    const input = z.object({
      mapsUrl: z.string().trim().min(1).max(2000),
      name: text, city: text, address: text,
      lat: z.number().min(-85).max(85), lng: z.number().min(-180).max(180),
      attested: z.literal(true),
    }).strict().parse(req.body);
    const parsed = parseMapsUrl(input.mapsUrl);
    requireThat(!!parsed.cid, 422, 'MANUAL_ATTESTATION_REQUIRES_CID');
    // A viewport center is not business coordinates and must never be trusted
    // as such. If the URL contains precise coordinates, enforce consistency.
    const precise = coordinatesFromMapsUrl(parsed.url);
    if (precise?.source === 'LISTING') {
      const meters = Math.hypot((precise.lat - input.lat) * 111320,
        (precise.lng - input.lng) * 111320 * Math.cos(precise.lat * Math.PI / 180));
      requireThat(meters <= 500, 422, 'MANUAL_COORDINATES_MISMATCH');
    }
    const result = await services.tenant(req, writers, async (tx, c) => {
      const settings = (await tx.query(
        'SELECT enabled,authorized,license_tag FROM provider_settings WHERE id=$1', [provider.id],
      )).rows[0];
      requireThat(settings?.enabled && settings?.authorized && settings?.license_tag,
        503, 'PROVIDER_UNAVAILABLE');
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [c.org, parsed.cid]);
      const existing = (await tx.query(
        'SELECT * FROM business_locations WHERE organization_id=$1 AND cid=$2 ORDER BY created_at LIMIT 1 FOR UPDATE',
        [c.org, parsed.cid],
      )).rows[0];
      if (existing?.identity_status === 'CONFIRMED')
        return { location: existing, created: false };
      if (existing) {
        const location = (await tx.query(
          `UPDATE business_locations SET name=$3,city=$4,address=$5,
             maps_url=$6,lat=$7,lng=$8,identity_status='CONFIRMED',source='user_attested_cid'
           WHERE organization_id=$1 AND id=$2 RETURNING *`,
          [c.org, existing.id, input.name, input.city, input.address, parsed.url, input.lat, input.lng],
        )).rows[0];
        await log(tx, c, 'location.user_attested', location.id, { evidence: 'user_confirmation_of_url_cid' });
        return { location, created: false };
      }
      const license = await entitlement(tx, c.org, true);
      const count = (await tx.query(
        'SELECT count(*)::int n FROM business_locations WHERE organization_id=$1', [c.org],
      )).rows[0].n;
      requireThat(count < license.max_locations, 429, 'LOCATION_QUOTA_EXCEEDED');
      const location = (await tx.query(
        `INSERT INTO business_locations
         (organization_id,name,city,address,maps_url,cid,lat,lng,identity_status,source)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'CONFIRMED','user_attested_cid') RETURNING *`,
        [c.org, input.name, input.city, input.address, parsed.url, parsed.cid, input.lat, input.lng],
      )).rows[0];
      await log(tx, c, 'location.user_attested', location.id, { evidence: 'user_confirmation_of_url_cid' });
      return { location, created: true };
    });
    return reply.code(result.created ? 201 : 200).send(wrap(req, result));
  });
  app.post('/v1/locations', async (req, reply) => {
    const data = await services.tenant(req, writers, async (tx, c) => {
      const b = locationInput.parse(req.body),
        url = parseMapsUrl(b.mapsUrl),
        license = await entitlement(tx, c.org, true);
      const count = (
        await tx.query('SELECT count(*)::int n FROM business_locations WHERE organization_id=$1', [
          c.org,
        ])
      ).rows[0].n;
      requireThat(count < license.max_locations, 429, 'LOCATION_QUOTA_EXCEEDED');
      const row = (
        await tx.query(
          'INSERT INTO business_locations(organization_id,brand_id,name,city,address,maps_url,cid,place_id,lat,lng) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
          [
            c.org,
            b.brandId ?? null,
            b.name,
            b.city,
            b.address,
            url.url,
            url.cid,
            url.placeId,
            b.lat,
            b.lng,
          ],
        )
      ).rows[0];
      await log(tx, c, 'location.created', row.id);
      return row;
    });
    return reply.code(201).send(wrap(req, data));
  });
  // Universal Maps registration must be atomic. Previously the UI created an
  // UNRESOLVED location and then issued a second request to confirm it. A
  // failed confirmation left a real row in the database and repeated clicks
  // could surface an opaque INTERNAL_ERROR.
  app.post('/v1/locations/register-confirmed', async (req, reply) => {
    const input = z.object({
      mapsUrl: z.string().trim().min(1).max(2000),
      externalId: text,
    }).strict().parse(req.body);
    const parsed = parseMapsUrl(input.mapsUrl);
    // Authenticate and enforce authorization before opening a local browser.
    await services.tenant(req, writers, async (tx) => {
      const settings = (
        await tx.query('SELECT enabled,authorized,license_tag FROM provider_settings WHERE id=$1', [provider.id])
      ).rows[0];
      requireThat(
        settings?.enabled && settings?.authorized && settings?.license_tag && provider.resolve,
        503,
        'PROVIDER_UNAVAILABLE',
      );
    });
    const matches = (await provider.resolve!(parsed.url)).filter((hit) =>
      hit.cid === input.externalId || hit.placeId === input.externalId,
    );
    requireThat(matches.length === 1, 409, 'AMBIGUOUS_IDENTITY');
    const hit = matches[0];
    requireThat(hit.cid || hit.placeId, 422, 'MISSING_STABLE_ID');
    if (parsed.cid) requireThat(parsed.cid === hit.cid, 409, 'MAPS_IDENTITY_MISMATCH');
    if (parsed.placeId) requireThat(parsed.placeId === hit.placeId, 409, 'MAPS_IDENTITY_MISMATCH');
    const verified = locationInput.parse({
      name: hit.name,
      city: hit.city,
      address: hit.address,
      mapsUrl: parsed.url,
      lat: hit.lat,
      lng: hit.lng,
    });
    const result = await services.tenant(req, writers, async (tx, c) => {
      // Two simultaneous clicks for the same Maps identity must not create
      // two locations or leave half-confirmed records behind.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [
        c.org,
        hit.cid ?? hit.placeId,
      ]);
      const existing = (
        await tx.query(
          `SELECT * FROM business_locations
           WHERE organization_id=$1 AND
             (($2::text IS NOT NULL AND cid=$2) OR
              ($3::text IS NOT NULL AND place_id=$3) OR maps_url=$4)
           ORDER BY created_at LIMIT 1 FOR UPDATE`,
          [c.org, hit.cid, hit.placeId, parsed.url],
        )
      ).rows[0];
      if (existing) {
        requireThat(
          (!existing.cid || existing.cid === hit.cid) &&
            (!existing.place_id || existing.place_id === hit.placeId),
          409,
          'LOCATION_IDENTITY_CONFLICT',
        );
        if (existing.identity_status === 'CONFIRMED') return { location: existing, created: false };
        const updated = (
          await tx.query(
            `UPDATE business_locations SET name=$3,city=$4,address=$5,
              lat=$6,lng=$7,cid=$8,place_id=$9,
              identity_status='CONFIRMED',source=$10,primary_category=$11
             WHERE organization_id=$1 AND id=$2 RETURNING *`,
            [c.org, existing.id, verified.name, verified.city, verified.address,
              verified.lat, verified.lng, hit.cid, hit.placeId, provider.id, hit.category ?? null],
          )
        ).rows[0];
        await log(tx, c, 'location.identity_confirmed', existing.id, { provider: provider.id });
        return { location: updated, created: false };
      }
      const license = await entitlement(tx, c.org, true);
      const count = (
        await tx.query('SELECT count(*)::int n FROM business_locations WHERE organization_id=$1', [c.org])
      ).rows[0].n;
      requireThat(count < license.max_locations, 429, 'LOCATION_QUOTA_EXCEEDED');
      const location = (
        await tx.query(
          `INSERT INTO business_locations
           (organization_id,name,city,address,maps_url,cid,place_id,lat,lng,identity_status,source,primary_category)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'CONFIRMED',$10,$11) RETURNING *`,
          [c.org, verified.name, verified.city, verified.address, parsed.url,
            hit.cid, hit.placeId, verified.lat, verified.lng, provider.id, hit.category ?? null],
        )
      ).rows[0];
      await log(tx, c, 'location.created_and_confirmed', location.id, { provider: provider.id });
      return { location, created: true };
    });
    return reply.code(result.created ? 201 : 200).send(wrap(req, result));
  });
  app.post<{ Params: { id: string } }>('/v1/locations/:id/confirm', async (req) =>
    wrap(
      req,
      await services.tenant(req, writers, async (tx, c) => {
        const l = await locationAccess(tx, c, req.params.id);
        const b = z.object({ externalId: text }).strict().parse(req.body);
        const s = (await tx.query('SELECT * FROM provider_settings WHERE id=$1', [provider.id]))
          .rows[0];
        requireThat(
          s?.enabled && s.authorized && s.license_tag && provider.resolve,
          503,
          'PROVIDER_UNAVAILABLE',
        );
        const candidates = await provider.resolve(l.maps_url);
        const matches = candidates.filter(
          (x) => x.cid === b.externalId || x.placeId === b.externalId,
        );
        requireThat(matches.length === 1, 409, 'AMBIGUOUS_IDENTITY');
        const hit = matches[0];
        locationInput.parse({
          name: hit.name,
          city: hit.city,
          address: hit.address,
          mapsUrl: l.maps_url,
          lat: hit.lat,
          lng: hit.lng,
        });
        requireThat(hit.cid || hit.placeId, 422, 'MISSING_STABLE_ID');
        const row = (
          await tx.query(
            "UPDATE business_locations SET name=$3,city=$4,address=$5,lat=$6,lng=$7,cid=$8,place_id=$9,identity_status='CONFIRMED',source=$10,primary_category=$11 WHERE organization_id=$1 AND id=$2 RETURNING *",
            [
              c.org,
              l.id,
              hit.name,
              hit.city,
              hit.address,
              hit.lat,
              hit.lng,
              hit.cid,
              hit.placeId,
              provider.id,
              hit.category ?? null,
            ],
          )
        ).rows[0];
        await log(tx, c, 'location.identity_confirmed', l.id, { provider: provider.id });
        return row;
      }),
    ),
  );
  app.get('/v1/provider/status', async (req) =>
    wrap(
      req,
      await services.tenant(req, readers, async (tx) => {
        const settings = (
          await tx.query('SELECT enabled,authorized,license_tag FROM provider_settings WHERE id=$1', [provider.id])
        ).rows[0];
        const configured = Boolean(settings?.enabled && settings?.authorized && settings?.license_tag);
        const local = provider.id === 'local_chrome_preview';
        const runtimeReady = !provider.demo || environment === 'test' || environment === 'staging' ||
          (environment === 'development' && local && localPreviewEnabled());
        const enabled = configured && runtimeReady && provider.id !== 'disabled';
        return {
          enabled,
          provider: provider.id,
          mode: local ? 'LOCAL_EXPERIMENTAL' : provider.demo ? 'SYNTHETIC_TEST' : 'COMMERCIAL',
          canResolve: enabled && typeof provider.resolve === 'function',
          canMeasureMaps: enabled && provider.supports('MAPS'),
          noPaidApi: local,
          reason: enabled ? null : configured ? 'RUNTIME_RESTRICTED' : 'PROVIDER_NOT_CONFIGURED',
        };
      }),
    ),
  );
  app.get('/v1/niches', async (req) =>
    wrap(req, await services.tenant(req, writers, async () => listNiches())),
  );
  app.post<{ Params: { id: string } }>('/v1/locations/:id/keywords::suggest', async (req) =>
    wrap(
      req,
      await services.tenant(req, writers, async (tx, c) => {
        const l = await locationAccess(tx, c, req.params.id);
        const b = z
          .object({
            niche: z.string().trim().min(1).max(80)
              .refine((v) => v === 'auto' || listNiches().some((n) => n.value === v), 'UNKNOWN_NICHE')
              .default('auto'),
            products: z.array(text).max(30).default([]),
            neighborhood: z.string().trim().max(100).optional(),
            limit: z.number().int().min(1).max(100).default(40),
          })
          .strict()
          .parse(req.body);
        return {
          status: 'SUGGESTED',
          ...suggestAutomaticKeywords({
            name: l.name,
            city: l.city,
            primaryCategory: l.primary_category ?? undefined,
            niche: b.niche,
            services: b.products,
            neighborhood: b.neighborhood,
            limit: b.limit,
          }),
        };
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/locations/:id/keywords', async (req) =>
    wrap(
      req,
      await services.tenant(req, readers, async (tx, c) => {
        await locationAccess(tx, c, req.params.id);
        return (
          await tx.query(
            'SELECT k.*,cl.name cluster FROM keywords k JOIN keyword_clusters cl ON cl.organization_id=k.organization_id AND cl.id=k.cluster_id WHERE k.organization_id=$1 AND k.location_id=$2 ORDER BY cl.name,k.term',
            [c.org, req.params.id],
          )
        ).rows;
      }),
    ),
  );
  app.post<{ Params: { id: string } }>('/v1/locations/:id/keywords::paste', async (req) =>
    wrap(
      req,
      await services.tenant(req, writers, async (tx, c) => {
        const l = await locationAccess(tx, c, req.params.id),
          b = pasteInput.parse(req.body),
          parsed = parsePaste(b.content, l.id, l.name);
        const existing = (
          await tx.query(
            'SELECT normalized_key FROM keywords WHERE organization_id=$1 AND location_id=$2',
            [c.org, l.id],
          )
        ).rows;
        const keys = new Set(existing.map((x) => x.normalized_key));
        const terms = parsed.terms.filter((t) => !keys.has(t.normalizedKey));
        if (b.preview)
          return {
            ...parsed,
            newCount: terms.length,
            existingDuplicates: parsed.terms.length - terms.length,
          };
        await entitlement(tx, c.org, true);
        let inserted = 0;
        for (const t of terms) {
          const cl = (
            await tx.query(
              'INSERT INTO keyword_clusters(organization_id,location_id,name,normalized_key,intent) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,location_id,normalized_key) DO UPDATE SET name=excluded.name RETURNING id',
              [c.org, l.id, t.cluster, t.clusterKey, t.intent],
            )
          ).rows[0];
          const result = await tx.query(
            'INSERT INTO keywords(organization_id,location_id,cluster_id,term,normalized_key,kind,priority,language) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(organization_id,location_id,normalized_key) DO NOTHING',
            [c.org, l.id, cl.id, t.term, t.normalizedKey, t.kind, t.priority, t.language],
          );
          inserted += result.rowCount ?? 0;
        }
        await log(tx, c, 'keywords.pasted', l.id, { inserted, contentHash: hash(b.content) });
        return { inserted, duplicates: parsed.terms.length - inserted + parsed.duplicates };
      }),
    ),
  );
  app.post<{ Params: { id: string } }>('/v1/locations/:id/keywords::activate-reviewed', async (req) =>
    wrap(req,
      await services.tenant(req, writers, async (tx,c) => {
        const l = await locationAccess(tx,c,req.params.id);
        z.object({ confirmed: z.literal(true) }).strict().parse(req.body);
        const license = await entitlement(tx,c.org,true);
        const total = (await tx.query(
          "SELECT count(*)::int n FROM keywords WHERE organization_id=$1 AND status='ACTIVE'",
          [c.org],
        )).rows[0].n;
        const pending = (await tx.query(
          "SELECT count(*)::int n FROM keywords WHERE organization_id=$1 AND location_id=$2 AND status IN ('SUGGESTED','VALIDATED')",
          [c.org,l.id],
        )).rows[0].n;
        requireThat(total + pending <= license.max_keywords,429,'KEYWORD_QUOTA_EXCEEDED');
        const result = await tx.query(
          "UPDATE keywords SET status='ACTIVE' WHERE organization_id=$1 AND location_id=$2 AND status IN ('SUGGESTED','VALIDATED')",
          [c.org,l.id],
        );
        await log(tx,c,'keywords.bulk_activated_after_review',l.id,{ count: result.rowCount ?? 0 });
        return { activated: result.rowCount ?? 0 };
      }),
    ),
  );
  app.patch<{ Params: { id: string } }>('/v1/keywords/:id', async (req) =>
    wrap(
      req,
      await services.tenant(req, writers, async (tx, c) => {
        const b = z
          .object({
            status: z.enum(['SUGGESTED', 'VALIDATED', 'ACTIVE', 'INACTIVE']),
            kind: z.enum(['BRAND', 'COMMERCIAL']).optional(),
          })
          .strict()
          .parse(req.body);
        const license = await entitlement(tx, c.org, true);
        const k = (
          await tx.query('SELECT * FROM keywords WHERE organization_id=$1 AND id=$2', [
            c.org,
            uuid.parse(req.params.id),
          ])
        ).rows[0];
        requireThat(k, 404, 'KEYWORD_NOT_FOUND');
        await locationAccess(tx, c, k.location_id);
        requireThat(
          b.status !== 'ACTIVE' || ['VALIDATED', 'ACTIVE', 'INACTIVE'].includes(k.status),
          409,
          'REVIEW_KEYWORD_FIRST',
        );
        if (b.status === 'ACTIVE' && k.status !== 'ACTIVE') {
          const count = (
            await tx.query(
              "SELECT count(*)::int n FROM keywords WHERE organization_id=$1 AND status='ACTIVE'",
              [c.org],
            )
          ).rows[0].n;
          requireThat(count < license.max_keywords, 429, 'KEYWORD_QUOTA_EXCEEDED');
        }
        await tx.query(
          'UPDATE keywords SET status=$3,kind=coalesce($4,kind) WHERE organization_id=$1 AND id=$2',
          [c.org, k.id, b.status, b.kind ?? null],
        );
        await log(tx, c, 'keyword.reviewed', k.id, b);
        return { id: k.id, ...b };
      }),
    ),
  );
  app.get<{ Params: { id: string } }>('/v1/locations/:id/grids', async (req) =>
    wrap(
      req,
      await services.tenant(req, readers, async (tx, c) => {
        await locationAccess(tx, c, req.params.id);
        return (
          await tx.query(
            'SELECT * FROM search_grids WHERE organization_id=$1 AND location_id=$2 ORDER BY created_at DESC',
            [c.org, req.params.id],
          )
        ).rows;
      }),
    ),
  );
  app.post<{ Params: { id: string } }>('/v1/locations/:id/grids', async (req) =>
    wrap(
      req,
      await services.tenant(req, writers, async (tx, c) => {
        const l = await locationAccess(tx, c, req.params.id),
          b = z
            .object({
              spacingM: z.number().int().min(50).max(10000),
              mode: z.enum(['single','grid5x5']).default('grid5x5'),
            })
            .strict()
            .parse(req.body);
        const points = b.mode === 'single'
          ? [{ sequence: 0, lat: l.lat, lng: l.lng }]
          : grid5x5(l.lat, l.lng, b.spacingM);
        const row = (
          await tx.query(
            'INSERT INTO search_grids(organization_id,location_id,spacing_m,points) VALUES($1,$2,$3,$4) RETURNING *',
            [c.org, l.id, b.spacingM, JSON.stringify(points)],
          )
        ).rows[0];
        await log(tx, c, 'grid.created', row.id);
        return row;
      }),
    ),
  );
  app.post<{ Params: { id: string } }>('/v1/locations/:id/audits', async (req, reply) => {
    const input = auditInput.parse(req.body),
      key = services.key(req);
    const result = await services.tenant(req, writers, (tx, c) =>
      planAudit(tx, c, req.params.id, input, key, provider, environment),
    );
    return reply.code(input.dryRun ? 200 : 202).send(wrap(req, result));
  });
  app.get<{ Params: { id: string } }>('/v1/audits/:id', async (req) =>
    wrap(
      req,
      await services.tenant(req, readers, async (tx, c) => {
        const run = (
          await tx.query('SELECT * FROM audit_runs WHERE organization_id=$1 AND id=$2', [
            c.org,
            uuid.parse(req.params.id),
          ])
        ).rows[0];
        requireThat(run, 404, 'AUDIT_NOT_FOUND');
        await locationAccess(tx, c, run.location_id);
        const totals = (
          await tx.query(
            'SELECT state,count(*)::int count FROM audit_tasks WHERE organization_id=$1 AND run_id=$2 GROUP BY state',
            [c.org, run.id],
          )
        ).rows;
        return { ...run, totals };
      }),
    ),
  );
  app.get('/v1/usage', async (req) =>
    wrap(
      req,
      await services.tenant(req, ['org_admin'], async (tx, c) => ({
        license: await entitlement(tx, c.org),
        ledger: (
          await tx.query(
            "SELECT state,count(*)::int units,coalesce(sum(cost),0) cost,coalesce(sum(reserved_cost),0) reserved FROM usage_ledger WHERE organization_id=$1 AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' GROUP BY state",
            [c.org],
          )
        ).rows,
      })),
    ),
  );
  app.post('/v1/legal/data-requests', async (req) =>
    wrap(
      req,
      await services.tenant(
        req,
        readers,
        async (tx, c) => {
          const b = z
            .object({ requestType: z.enum(['ACCESS', 'PORTABILITY', 'DELETION', 'CORRECTION']) })
            .strict()
            .parse(req.body);
          const row = (
            await tx.query(
              'INSERT INTO legal_data_requests(organization_id,requestor,request_type) VALUES($1,$2,$3) RETURNING id,status',
              [c.org, c.principal.id, b.requestType],
            )
          ).rows[0];
          await log(tx, c, 'legal.requested', row.id, { type: b.requestType });
          return row;
        },
        true,
      ),
    ),
  );
  registerOwner(app, services);
  registerBranding(app, services);
  registerAnalytics(app, services);
  return app;
}
