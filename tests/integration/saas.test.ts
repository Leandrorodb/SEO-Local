import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { LocalPostgres as EmbeddedPostgres, freeTestPort } from '../../infra/test-postgres.js';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { makePool, transaction, assertRuntimeRole } from '../../packages/db/index.js';
import { migrate } from '../../packages/db/migrate.js';
import { Authenticator } from '../../apps/api/auth.js';
import { buildApp } from '../../apps/api/app.js';
import { processOne, recoverLeases, scheduleOne } from '../../apps/worker/worker.js';
import { buildWorkerHttp } from '../../apps/worker/server.js';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { PNG } from 'pngjs';
import { browserFlow } from './browser-flow.js';
import type { RankProvider, ProviderResult } from '../../packages/rank-providers/index.js';
import type { RankQuery } from '../../packages/contracts/index.js';
import type pg from 'pg';
const ids = {
  owner: randomUUID(),
  admin: randomUUID(),
  analyst: randomUUID(),
  viewer: randomUUID(),
  other: randomUUID(),
  a: randomUUID(),
  b: randomUUID(),
  plan: randomUUID(),
};
const password = randomBytes(24).toString('hex'),
  port = await freeTestPort(),
  dir = path.resolve('work/tests/' + randomUUID());
mkdirSync(dir, { recursive: true });
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(dir, 'pg'),
  user: 'postgres',
  password,
  port,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: (x) => {
    if (String(x).includes('FATAL')) console.error(String(x));
  },
});
let admin: pg.Pool, pool: pg.Pool, auth: Authenticator, privateKey: CryptoKey, publicKey: CryptoKey;
let poolsClosed = false;
let started = false;
let calls = 0;
const fixture: RankProvider = {
  id: 'TEST_FIXTURE',
  demo: true,
  supports: (s) => s === 'MAPS',
  quote: async () => ({ maxCostMicros: 100, depth: 20 }),
  resolve: async (url) => [
    {
      name: 'Loja Sintética',
      city: 'Cidade de Teste',
      address: 'Rua de Teste, 1',
      lat: -21,
      lng: -45,
      cid: new URL(url).searchParams.get('cid'),
      placeId: null,
    },
  ],
  measure: async (q, key): Promise<ProviderResult> => {
    calls++;
    return {
      observedAt: new Date().toISOString(),
      taskRef: key,
      depth: 20,
      complete: true,
      costMicros: 80,
      items: [
        { name: 'Concorrente Sintético', cid: '99999', position: 1 },
        { name: 'Loja Sintética', cid: q.cid!, position: 2 },
      ],
    };
  },
};
async function token(subject = 'admin', mfa = true, age = 0) {
  return new SignJWT({
    amr: mfa ? ['pwd', 'otp'] : ['pwd'],
    auth_time: Math.floor(Date.now() / 1000) - age,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer('https://test-idp.invalid')
    .setAudience('lrt')
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey);
}
const app = () => buildApp({ pool, auth, provider: fixture, environment: 'test' });
async function request(
  server: ReturnType<typeof app>,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  body?: unknown,
  subject = 'admin',
  org: string = ids.a,
  mfa = true,
  key = randomUUID(),
) {
  return server.inject({
    method,
    url,
    headers: {
      authorization: 'Bearer ' + (await token(subject, mfa)),
      'x-organization-id': org,
      'idempotency-key': key,
    },
    ...(body === undefined ? {} : { payload: body as object }),
  });
}
async function location(
  server: ReturnType<typeof app>,
  cid = String(Math.floor(Math.random() * 1e12) + 1),
  org = ids.a,
  subject = 'admin',
) {
  const r = await request(
    server,
    'POST',
    '/v1/locations',
    {
      name: 'Loja Sintética',
      city: 'Cidade de Teste',
      address: 'Rua de Teste, 1',
      mapsUrl: 'https://www.google.com/maps?cid=' + cid,
      lat: -21,
      lng: -45,
    },
    subject,
    org,
  );
  assert.equal(r.statusCode, 201, r.body);
  return r.json().data;
}
async function configured(server: ReturnType<typeof app>) {
  const l = await location(server);
  assert.equal(
    (await request(server, 'POST', `/v1/locations/${l.id}/confirm`, { externalId: l.cid }))
      .statusCode,
    200,
  );
  const pasted = await request(server, 'POST', `/v1/locations/${l.id}/keywords:paste`, {
    content: 'loja de teste',
    preview: false,
  });
  assert.equal(pasted.statusCode, 200, pasted.body);
  const k = (await request(server, 'GET', `/v1/locations/${l.id}/keywords`)).json().data[0];
  await request(server, 'PATCH', '/v1/keywords/' + k.id, { status: 'VALIDATED' });
  await request(server, 'PATCH', '/v1/keywords/' + k.id, { status: 'ACTIVE' });
  const grid = (
    await request(server, 'POST', `/v1/locations/${l.id}/grids`, { spacingM: 100 })
  ).json().data;
  return {
    l,
    k,
    grid,
    input: { gridId: grid.id, surface: 'MAPS', maxProviderBudgetUsdMicros: 10000 },
  };
}
before(async () => {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase('test_lrt');
  admin = makePool(`postgresql://postgres:${password}@127.0.0.1:${port}/test_lrt`);
  await migrate(admin);
  await migrate(admin);
  await admin.query(`ALTER ROLE lrt_app LOGIN PASSWORD '${password}'`);
  pool = makePool(`postgresql://lrt_app:${password}@127.0.0.1:${port}/test_lrt`);
  await assertRuntimeRole(pool);
  const keys = await generateKeyPair('RS256');
  privateKey = keys.privateKey;
  publicKey = keys.publicKey;
  const jwk = await exportJWK(keys.publicKey);
  auth = new Authenticator(
    'https://test-idp.invalid',
    'lrt',
    createLocalJWKSet({ keys: [{ ...jwk, kid: 'test', alg: 'RS256' }] }),
  );
  for (const [subject, id] of Object.entries(ids).filter(([k]) =>
    ['owner', 'admin', 'analyst', 'viewer', 'other'].includes(k),
  ))
    await admin.query(
      'INSERT INTO users(id,auth_subject,email,platform_owner) VALUES($1,$2,$3,$4)',
      [id, subject, subject + '@test.invalid', subject === 'owner'],
    );
  await admin.query(
    "INSERT INTO plans(id,code,max_locations,max_keywords,max_monthly_queries,max_users,monthly_budget_micros) VALUES($1,'TEST_ONLY',100,1000,10000,10,10000000)",
    [ids.plan],
  );
  for (const [id, name] of [
    [ids.a, 'A'],
    [ids.b, 'B'],
  ]) {
    await admin.query('INSERT INTO organizations(id,name,slug) VALUES($1,$2,$2)', [id, name]);
    await admin.query(
      "INSERT INTO subscriptions(organization_id,plan_id,billing_status,entitlement_status,paid_through) VALUES($1,$2,'PAID','ACTIVE',now()+interval '1 month')",
      [id, ids.plan],
    );
  }
  for (const [user, role] of [
    [ids.admin, 'org_admin'],
    [ids.analyst, 'analyst'],
    [ids.viewer, 'client_viewer'],
  ])
    await admin.query(
      'INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)',
      [ids.a, user, role],
    );
  await admin.query(
    "INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'org_admin')",
    [ids.b, ids.other],
  );
  await admin.query(
    "INSERT INTO provider_settings(id,enabled,authorized,license_tag,retention_days,global_daily_budget,global_monthly_budget) VALUES('TEST_FIXTURE',true,true,'SYNTHETIC_TEST_ONLY',1,100000000,100000000)",
  );
});
after(async () => {
  if (!poolsClosed) {
    await pool?.end();
    await admin?.end();
  }
  if (started) await postgres.stop();
});
test('P0: JWT required, MFA administrative, no self-assigned role and revocation live', async () => {
  const s = app();
  try {
    assert.equal((await s.inject('/v1/locations')).statusCode, 401);
    assert.equal(
      (await request(s, 'GET', '/v1/locations', undefined, 'admin', ids.a, false)).statusCode,
      403,
    );
    assert.equal(
      (await request(s, 'GET', '/v1/platform/organizations', undefined, 'analyst')).statusCode,
      403,
    );
    assert.equal(
      (await request(s, 'GET', '/v1/me/organizations')).json().data.organizations.length,
      1,
    );
    await admin.query("UPDATE organization_members SET status='REVOKED' WHERE user_id=$1", [
      ids.analyst,
    ]);
    assert.equal((await request(s, 'GET', '/v1/locations', undefined, 'analyst')).statusCode, 403);
    await admin.query("UPDATE organization_members SET status='ACTIVE' WHERE user_id=$1", [
      ids.analyst,
    ]);
  } finally {
    await s.close();
  }
});
test('P0: tenant and location ACL stop reads, writes, reports, foreign references and spoofed body', async () => {
  const s = app();
  try {
    const a = await location(s),
      b = await location(s, undefined, ids.b, 'other');
    assert.equal(
      (await request(s, 'GET', '/v1/locations', undefined, 'admin', ids.b)).statusCode,
      403,
    );
    for (const tail of ['keywords', 'rankings', 'competitors', 'reports', 'audits'])
      assert.equal(
        (await request(s, 'GET', `/v1/locations/${b.id}/${tail}`)).statusCode,
        404,
        tail,
      );
    assert.equal(
      (
        await request(s, 'POST', `/v1/locations/${b.id}/keywords:paste`, {
          content: 'loja',
          preview: false,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await request(s, 'GET', `/v1/locations/${a.id}/rankings`, undefined, 'viewer')).statusCode,
      404,
    );
    assert.equal(
      (await request(s, 'GET', '/v1/locations', undefined, 'viewer')).json().data.length,
      0,
    );
    await admin.query(
      'INSERT INTO location_acl(organization_id,location_id,user_id) VALUES($1,$2,$3)',
      [ids.a, a.id, ids.viewer],
    );
    assert.equal(
      (await request(s, 'GET', `/v1/locations/${a.id}/rankings`, undefined, 'viewer')).statusCode,
      200,
    );
    assert.equal(
      (await request(s, 'POST', '/v1/locations', { organization_id: ids.b })).statusCode,
      422,
    );
    await transaction(pool, { org: ids.a }, async (tx) => {
      assert.equal(
        (await tx.query('SELECT * FROM business_locations WHERE id=$1', [b.id])).rowCount,
        0,
      );
    });
    await assert.rejects(() =>
      transaction(pool, { org: ids.a }, (tx) =>
        tx.query(
          "INSERT INTO keyword_clusters(organization_id,location_id,name,normalized_key,intent) VALUES($1,$2,'x','x','commercial')",
          [ids.a, b.id],
        ),
      ),
    );
    assert.equal((await pool.query('SELECT * FROM business_locations')).rowCount, 0);
  } finally {
    await s.close();
  }
});
test('P0: suspension blocks reads/export/jobs; legal request survives; reactivation preserves records', async () => {
  const s = app();
  try {
    const l = await location(s);
    await admin.query(
      "UPDATE subscriptions SET paid_through=now()-interval '1 second' WHERE organization_id=$1",
      [ids.a],
    );
    assert.equal((await request(s, 'GET', '/v1/locations')).statusCode, 402);
    assert.equal((await request(s, 'GET', `/v1/locations/${l.id}/reports`)).statusCode, 402);
    assert.equal(
      (await request(s, 'POST', '/v1/legal/data-requests', { requestType: 'ACCESS' })).statusCode,
      200,
    );
    assert.equal(
      (await request(s, 'GET', '/v1/platform/organizations', undefined, 'owner')).statusCode,
      200,
    );
    await admin.query(
      "UPDATE subscriptions SET paid_through=now()+interval '1 month' WHERE organization_id=$1",
      [ids.a],
    );
    assert.ok(
      (await request(s, 'GET', '/v1/locations'))
        .json()
        .data.some((x: { id: string }) => x.id === l.id),
    );
  } finally {
    await s.close();
  }
});
test('P0: manual billing duplicate and stale events cannot extend or reactivate license', async () => {
  const s = app();
  try {
    const version = (
      await admin.query('SELECT version FROM subscriptions WHERE organization_id=$1', [ids.a])
    ).rows[0].version;
    const body = {
        expectedVersion: version,
        status: 'ACTIVE',
        paidThrough: new Date(Date.now() + 86400000).toISOString(),
        reason: 'Pagamento confirmado em teste',
        amountCents: 50000,
        currency: 'BRL',
      },
      key = randomUUID();
    assert.equal(
      (
        await request(
          s,
          'PATCH',
          `/v1/platform/organizations/${ids.a}/license`,
          body,
          'owner',
          ids.a,
          true,
          key,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await request(
          s,
          'PATCH',
          `/v1/platform/organizations/${ids.a}/license`,
          body,
          'owner',
          ids.a,
          true,
          key,
        )
      ).json().data.replayed,
      true,
    );
    assert.equal(
      (
        await request(
          s,
          'PATCH',
          `/v1/platform/organizations/${ids.a}/license`,
          { ...body, status: 'SUSPENDED' },
          'owner',
        )
      ).statusCode,
      409,
    );
    const staleToken = await token('owner', true, 600);
    assert.equal(
      (
        await s.inject({
          method: 'PATCH',
          url: `/v1/platform/organizations/${ids.a}/license`,
          headers: { authorization: 'Bearer ' + staleToken, 'idempotency-key': randomUUID() },
          payload: body,
        })
      ).statusCode,
      403,
    );
  } finally {
    await s.close();
  }
});
test('P0/P1: audit -> 25 immutable measurements -> reviewed report -> real PDF, idempotent worker', async () => {
  const s = app();
  try {
    const { l, input } = await configured(s),
      key = randomUUID();
    const pre = await request(s, 'POST', `/v1/locations/${l.id}/audits`, {
      ...input,
      dryRun: true,
    });
    assert.equal(pre.statusCode, 200, pre.body);
    assert.equal(pre.json().data.plannedTasks, 25);
    const run = await request(
      s,
      'POST',
      `/v1/locations/${l.id}/audits`,
      input,
      'admin',
      ids.a,
      true,
      key,
    );
    assert.equal(run.statusCode, 202, run.body);
    const runId = run.json().data.runId;
    assert.equal(
      (
        await request(s, 'POST', `/v1/locations/${l.id}/audits`, input, 'admin', ids.a, true, key)
      ).json().data.runId,
      runId,
    );
    const before = calls;
    while (await processOne(pool, fixture, 'test')) {}
    assert.equal(calls - before, 25);
    assert.equal(await processOne(pool, fixture, 'test'), false);
    const measurements = (
      await admin.query('SELECT * FROM rank_measurements WHERE run_id=$1', [runId])
    ).rows;
    assert.equal(measurements.length, 25);
    assert.ok(measurements.every((m) => m.status === 'VERIFIED' && m.position === 2 && m.is_demo));
    assert.equal((await request(s, 'GET', '/v1/audits/' + runId)).json().data.status, 'COMPLETED');
    await assert.rejects(
      () => admin.query('UPDATE rank_measurements SET position=1 WHERE run_id=$1', [runId]),
      /append-only/,
    );
    const report = (await request(s, 'POST', `/v1/locations/${l.id}/reports`, { runId })).json()
      .data;
    assert.equal((await request(s, 'GET', `/v1/reports/${report.id}/pdf`)).statusCode, 409);
    assert.equal((await request(s, 'POST', `/v1/reports/${report.id}/approve`)).statusCode, 409);
    assert.equal((await request(s, 'POST', `/v1/reports/${report.id}/review`)).statusCode, 200);
    const approve = await request(s, 'POST', `/v1/reports/${report.id}/approve`);
    assert.equal(approve.statusCode, 200, approve.body);
    const pdf = await request(s, 'GET', `/v1/reports/${report.id}/pdf`);
    assert.equal(pdf.statusCode, 200, pdf.body);
    assert.equal(
      pdf.headers['x-content-sha256'],
      createHash('sha256').update(pdf.rawPayload).digest('hex'),
    );
    assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');
    assert.match(
      (await request(s, 'GET', `/v1/reports/${report.id}/whatsapp`)).json().data.text,
      /DEMO/,
    );
    assert.equal(
      (await request(s, 'GET', `/v1/reports/${report.id}/pdf`, undefined, 'other', ids.b))
        .statusCode,
      404,
    );
  } finally {
    await s.close();
  }
});
test('P0: provider disabled, production demo gate, budget and revoked queued tasks', async () => {
  const s = app();
  try {
    assert.throws(() => buildApp({ pool, auth, provider: fixture, environment: 'production' }));
    const { l, input } = await configured(s);
    const no = buildApp({ pool, auth, environment: 'test' });
    assert.equal(
      (await request(no, 'POST', `/v1/locations/${l.id}/audits`, input)).statusCode,
      503,
    );
    await no.close();
    assert.equal(
      (
        await request(s, 'POST', `/v1/locations/${l.id}/audits`, {
          ...input,
          maxProviderBudgetUsdMicros: 1,
        })
      ).statusCode,
      402,
    );
    const run = await request(s, 'POST', `/v1/locations/${l.id}/audits`, input);
    assert.equal(run.statusCode, 202);
    await admin.query(
      "UPDATE subscriptions SET entitlement_status='SUSPENDED' WHERE organization_id=$1",
      [ids.a],
    );
    const before = calls;
    while (await processOne(pool, fixture, 'test')) {}
    assert.equal(calls, before);
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int n FROM usage_ledger WHERE run_id=$1 AND state='RELEASED'",
          [run.json().data.runId],
        )
      ).rows[0].n,
      25,
    );
    await admin.query(
      "UPDATE subscriptions SET entitlement_status='ACTIVE' WHERE organization_id=$1",
      [ids.a],
    );
  } finally {
    await s.close();
  }
});

test('Security: invalid signature, wrong audience, untrusted MFA and expired tokens fail closed', async () => {
  const s = app();
  try {
    for (const [audience, expiration, amr] of [
      ['wrong', '15m', ['otp']],
      ['lrt', '-1h', ['otp']],
      ['lrt', '15m', ['pwd']],
      ['lrt', '15m', ['otp']],
    ] as const) {
      const jwt = await new SignJWT({
        amr,
        auth_time: Math.floor(Date.now() / 1000),
        role: 'platform_owner',
        organization_id: ids.a,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer('https://test-idp.invalid')
        .setAudience(audience)
        .setSubject('admin')
        .setIssuedAt()
        .setExpirationTime(expiration)
        .sign(privateKey);
      const r = await s.inject({
        url: '/v1/locations',
        headers: { authorization: 'Bearer ' + jwt, 'x-organization-id': ids.a },
      });
      assert.ok([401, 403].includes(r.statusCode));
    }
    const t = await token();
    assert.equal(
      (
        await s.inject({
          url: '/v1/locations',
          headers: {
            authorization: 'Bearer ' + t.slice(0, -10) + 'XXXXXXXXXX',
            'x-organization-id': ids.a,
          },
        })
      ).statusCode,
      401,
    );
    await assert.rejects(() => assertRuntimeRole(admin), /Unsafe database role/);
  } finally {
    await s.close();
  }
});

test('Concurrency: query reservation is atomic and parallel workers do not duplicate observations', async () => {
  const s = app();
  try {
    const { l, input } = await configured(s);
    const used = (
      await admin.query(
        "SELECT count(*)::int n FROM usage_ledger WHERE organization_id=$1 AND state<>'RELEASED'",
        [ids.a],
      )
    ).rows[0].n;
    await admin.query('UPDATE plans SET max_monthly_queries=$2 WHERE id=$1', [ids.plan, used + 25]);
    const results = await Promise.all([
      request(s, 'POST', `/v1/locations/${l.id}/audits`, input),
      request(s, 'POST', `/v1/locations/${l.id}/audits`, input),
    ]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [202, 429]);
    const run = results.find((r) => r.statusCode === 202)!.json().data.runId;
    await admin.query('UPDATE plans SET max_monthly_queries=10000 WHERE id=$1', [ids.plan]);
    const before = calls;
    let pending = true;
    while (pending) {
      pending = (
        await Promise.all([
          processOne(pool, fixture, 'test'),
          processOne(pool, fixture, 'test'),
          processOne(pool, fixture, 'test'),
        ])
      ).some(Boolean);
    }
    assert.equal(calls - before, 25);
    assert.equal((await request(s, 'GET', '/v1/audits/' + run)).json().data.status, 'COMPLETED');
    assert.equal(
      (await admin.query('SELECT count(*)::int n FROM rank_measurements WHERE run_id=$1', [run]))
        .rows[0].n,
      25,
    );
  } finally {
    await admin.query('UPDATE plans SET max_monthly_queries=10000 WHERE id=$1', [ids.plan]);
    await s.close();
  }
});

test('Worker: forged task identity and revoked membership cannot buy queries; abandoned leases never retry blindly', async () => {
  const s = app();
  try {
    const { l, input } = await configured(s);
    let run = (await request(s, 'POST', `/v1/locations/${l.id}/audits`, input)).json().data.runId;
    await admin.query(
      "UPDATE audit_tasks SET query_snapshot=jsonb_set(query_snapshot,'{cid}','\"wrong-unit\"') WHERE run_id=$1",
      [run],
    );
    const before = calls;
    while (await processOne(pool, fixture, 'test')) {}
    assert.equal(calls, before);
    run = (await request(s, 'POST', `/v1/locations/${l.id}/audits`, input)).json().data.runId;
    await admin.query(
      "UPDATE organization_members SET status='REVOKED' WHERE organization_id=$1 AND user_id=$2",
      [ids.a, ids.admin],
    );
    while (await processOne(pool, fixture, 'test')) {}
    assert.equal(calls, before);
    await admin.query(
      "UPDATE organization_members SET status='ACTIVE' WHERE organization_id=$1 AND user_id=$2",
      [ids.a, ids.admin],
    );
    run = (await request(s, 'POST', `/v1/locations/${l.id}/audits`, input)).json().data.runId;
    await admin.query(
      "UPDATE audit_tasks SET state='RUNNING',lease_until=now()-interval '1 second' WHERE run_id=$1",
      [run],
    );
    assert.equal(await recoverLeases(pool), 25);
    assert.equal(await processOne(pool, fixture, 'test'), false);
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int n FROM usage_ledger WHERE run_id=$1 AND state='RESERVED'",
          [run],
        )
      ).rows[0].n,
      25,
    );
  } finally {
    await admin.query(
      "UPDATE organization_members SET status='ACTIVE' WHERE organization_id=$1 AND user_id=$2",
      [ids.a, ids.admin],
    );
    await s.close();
  }
});

test('Saving automation and its initial audit is atomic under retries, disabled provider and budget rejection', async () => {
  const server = app();
  try {
    const { l, input } = await configured(server);
    const body = {
      locationId: l.id,
      config: input,
      frequency: 'WEEKLY',
      timezone: 'America/Sao_Paulo',
      nextRunAt: new Date(Date.now() + 86400000).toISOString(),
      startNow: true,
    };
    const save = (key: ReturnType<typeof randomUUID>, payload = body) =>
      request(server, 'POST', '/v1/audit-schedules', payload, 'admin', ids.a, true, key);
    const counts = async () =>
      (
        await admin.query(
          'SELECT (SELECT count(*)::int FROM audit_schedules WHERE location_id=$1) AS schedules,(SELECT count(*)::int FROM audit_runs WHERE location_id=$1) AS runs,(SELECT count(*)::int FROM usage_ledger u JOIN audit_runs r ON r.id=u.run_id WHERE r.location_id=$1) AS reservations',
          [l.id],
        )
      ).rows[0];
    const key = randomUUID();
    assert.equal(
      (await save(key, { ...body, config: { ...input, maxProviderBudgetUsdMicros: 0 } }))
        .statusCode,
      402,
    );
    await admin.query("UPDATE provider_settings SET enabled=false WHERE id='TEST_FIXTURE'");
    assert.equal((await save(key)).statusCode, 503);
    assert.deepEqual(await counts(), { schedules: 0, runs: 0, reservations: 0 });
    await admin.query("UPDATE provider_settings SET enabled=true WHERE id='TEST_FIXTURE'");
    const result = await Promise.all([save(key), save(key)]);
    for (const res of result) assert.equal(res.statusCode, 200, res.body);
    assert.ok(result[0].json().data.initial_run_id);
    assert.equal(result[0].json().data.initial_run_id, result[1].json().data.initial_run_id);
    assert.equal((await save(key, { ...body, frequency: 'MONTHLY' })).statusCode, 409);
    assert.deepEqual(await counts(), { schedules: 1, runs: 1, reservations: 25 });
    while (await processOne(pool, fixture, 'test')) {}
  } finally {
    await admin.query("UPDATE provider_settings SET enabled=true WHERE id='TEST_FIXTURE'");
    await server.close();
  }
});
test('Scheduler: duplicate delivery produces one run and unsupported provider disables schedule with reason', async () => {
  const s = app();
  try {
    const { l, input } = await configured(s);
    const r = await request(s, 'POST', '/v1/audit-schedules', {
      locationId: l.id,
      config: input,
      frequency: 'WEEKLY',
      timezone: 'America/Sao_Paulo',
      nextRunAt: new Date(Date.now() + 3600000).toISOString(),
    });
    assert.equal(r.statusCode, 200, r.body);
    const id = r.json().data.id;
    await admin.query(
      "UPDATE audit_schedules SET next_run_at=now()-interval '1 second' WHERE id=$1",
      [id],
    );
    const before = (await admin.query('SELECT count(*)::int n FROM audit_runs')).rows[0].n;
    await Promise.all([scheduleOne(pool, fixture, 'test'), scheduleOne(pool, fixture, 'test')]);
    assert.equal(
      (await admin.query('SELECT count(*)::int n FROM audit_runs')).rows[0].n,
      before + 1,
    );
    while (await processOne(pool, fixture, 'test')) {}
    await admin.query(
      "UPDATE audit_schedules SET next_run_at=now()-interval '1 second' WHERE id=$1",
      [id],
    );
    await admin.query("UPDATE provider_settings SET enabled=false WHERE id='TEST_FIXTURE'");
    await scheduleOne(pool, fixture, 'test');
    const disabled = (await admin.query('SELECT * FROM audit_schedules WHERE id=$1', [id])).rows[0];
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.last_error, 'PROVIDER_UNAVAILABLE');
  } finally {
    await admin.query("UPDATE provider_settings SET enabled=true WHERE id='TEST_FIXTURE'");
    await s.close();
  }
});

test('40 active terms produce a 1000-query preflight with no measurements or paid work', async () => {
  const s = app();
  try {
    const { l, input } = await configured(s);
    await request(s, 'POST', `/v1/locations/${l.id}/keywords:paste`, {
      content: Array.from({ length: 39 }, (_, i) => 'serviço sintético ' + i).join('\n'),
      preview: false,
    });
    await admin.query("UPDATE keywords SET status='ACTIVE' WHERE location_id=$1", [l.id]);
    const before = calls;
    const r = await request(s, 'POST', `/v1/locations/${l.id}/audits`, {
      ...input,
      maxProviderBudgetUsdMicros: 1000000,
      dryRun: true,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().data.plannedTasks, 1000);
    assert.equal(calls, before);
  } finally {
    await s.close();
  }
});

test('Branding is tenant-scoped and rejects non-PNG payloads', async () => {
  const s = app();
  try {
    assert.equal(
      (
        await request(s, 'POST', '/v1/branding', {
          displayName: 'Agência teste',
          logoBase64: Buffer.from('<svg><script>bad</script></svg>').toString('base64'),
        })
      ).statusCode,
      422,
    );
    assert.equal(
      (
        await request(s, 'POST', '/v1/branding', {
          displayName: 'Agência de teste',
          logoBase64: PNG.sync.write(new PNG({ width: 2, height: 2 })).toString('base64'),
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await request(s, 'GET', '/v1/branding')).json().data.displayName,
      'Agência de teste',
    );
    assert.equal(
      (await request(s, 'GET', '/v1/branding', undefined, 'other', ids.b)).json().data,
      null,
    );
  } finally {
    await s.close();
  }
});

test(
  'Compiled production HTTP serves the frontend and refuses private files and unauthenticated API calls',
  { timeout: 20000 },
  async () => {
    assert.ok(existsSync('dist/apps/api/main.js'), 'Run pnpm build before integration tests');
    const apiPort = await freeTestPort();
    const child = spawn(process.execPath, ['dist/apps/api/main.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(apiPort),
        DATABASE_URL: `postgresql://lrt_app:${password}@127.0.0.1:${port}/test_lrt`,
        OIDC_ISSUER: 'https://test-idp.invalid',
        OIDC_AUDIENCE: 'lrt',
        OIDC_JWKS_URL: 'https://test-idp.invalid/keys',
        RANK_PROVIDER: 'disabled',
      },
      stdio: 'ignore',
    });
    const done = once(child, 'exit');
    try {
      const base = 'http://127.0.0.1:' + apiPort;
      let healthy = false;
      for (let i = 0; i < 80 && child.exitCode === null; i++) {
        try {
          if ((await (await fetch(base + '/health')).json()).service === 'Local Rank Tracker') {
            healthy = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(healthy, true, 'compiled API startup');
      const html = await (await fetch(base + '/auth/callback')).text();
      const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
      assert.ok(asset);
      const js = await fetch(base + asset);
      assert.equal(js.status, 200);
      assert.match(js.headers.get('content-type') ?? '', /javascript/);
      for (const p of [
        '/.env',
        '/legacy/data',
        '/apps/api/main.ts',
        '/assets/%2e%2e%2f.env',
        asset + '.map',
        '/internal/tick',
      ])
        assert.equal((await fetch(base + p)).status, 404, p);
      assert.equal((await fetch(base + '/v1/locations')).status, 401);
    } finally {
      if (child.exitCode === null) child.kill();
      await done;
    }
  },
);
test('Opportunities, configurable alerts and dashboard use verified same-unit data', async () => {
  const s = app();
  try {
    const { l, input } = await configured(s);
    const p = '/v1/locations/' + l.id;
    const run = await request(s, 'POST', p + '/audits', input);
    assert.equal(run.statusCode, 202);
    const otherFixture: RankProvider = {
      ...fixture,
      measure: async (q, k) => {
        const r = await fixture.measure(q, k);
        r.items[1].position = 6;
        return r;
      },
    };
    while (await processOne(pool, otherFixture, 'test')) {}
    const data = (await request(s, 'GET', p + '/opportunities')).json().data;
    assert.equal(data.length, 25);
    const first = data[0];
    assert.equal(first.score, 5);
    assert.equal(first.is_demo, true);
    const action = p + '/opportunities/' + first.measurementId;
    assert.equal(
      (await request(s, 'PATCH', action, { state: 'DONE' }, 'other', ids.b)).statusCode,
      404,
    );
    assert.equal((await request(s, 'PATCH', action, { state: 'DONE' }, 'viewer')).statusCode, 403);
    assert.equal((await request(s, 'PATCH', action, { state: 'DONE' })).json().data.state, 'DONE');
    assert.equal(
      (await request(s, 'GET', p + '/opportunities'))
        .json()
        .data.find((x: { measurementId: string }) => x.measurementId === first.measurementId).state,
      'DONE',
    );
    assert.equal(
      (await request(s, 'PATCH', p + '/alert-rules', { materialDrop: 5 }, 'analyst')).statusCode,
      403,
    );
    assert.equal(
      (await request(s, 'PATCH', p + '/alert-rules', { materialDrop: 0 })).statusCode,
      422,
    );
    assert.equal(
      (await request(s, 'PATCH', p + '/alert-rules', { materialDrop: 5 })).json().data.materialDrop,
      5,
    );
    const stats = await request(s, 'GET', '/v1/organizations/' + ids.a + '/summary');
    assert.equal(stats.statusCode, 200, stats.body);
    const unit = stats.json().data.units.find((u: { id: string }) => u.id === l.id);
    assert.equal(unit.top5, 0);
    assert.equal(unit.top10, 25);
    const row = (
      await admin.query('SELECT * FROM rank_measurements WHERE id=$1', [first.measurementId])
    ).rows[0];
    await assert.rejects(
      () =>
        admin.query(
          'INSERT INTO rank_measurements SELECT (jsonb_populate_record(NULL::rank_measurements,$1::jsonb)).*',
          [JSON.stringify({ ...row, id: randomUUID(), position: null })],
        ),
      (e: { code?: string; constraint?: string }) =>
        e.code === '23514' && e.constraint === 'verified_position_present',
    );
  } finally {
    await s.close();
  }
});
test('Networks are isolated even when tenants reuse a brand name', async () => {
  const s = app();
  try {
    const make = async (org: string, subject: string) =>
      (await request(s, 'POST', '/v1/brands', { name: 'Rede Demo' }, subject, org)).json().data.id;
    const a = await make(ids.a, 'admin'),
      b = await make(ids.b, 'other');
    assert.notEqual(a, b);
    assert.deepEqual(
      (await request(s, 'GET', '/v1/brands')).json().data.map((x: { id: string }) => x.id),
      [a],
    );
    assert.equal((await request(s, 'GET', '/v1/brands', undefined, 'viewer')).statusCode, 403);
    const data = {
      name: 'Unidade',
      city: 'Teste',
      address: 'Rua A',
      mapsUrl: 'https://www.google.com/maps?cid=1200',
      lat: 1,
      lng: 1,
    };
    assert.equal(
      (await request(s, 'POST', '/v1/locations', { ...data, brandId: b })).statusCode,
      422,
    );
    assert.equal(
      (await request(s, 'POST', '/v1/locations', { ...data, brandId: a })).json().data.brand_id,
      a,
    );
  } finally {
    await s.close();
  }
});
test('Worker HTTP requires the correct service identity; redelivery and license expiry are idempotent', async () => {
  const worker = buildWorkerHttp({
    pool,
    provider: fixture,
    environment: 'test',
    issuer: 'https://worker.invalid',
    audience: 'worker',
    subject: 'scheduler',
    key: createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' }],
    }),
  });
  const service = async (sub: string) =>
    new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer('https://worker.invalid')
      .setAudience('worker')
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
  const post = async (jwt: string, payload: object, route = '/internal/audit-task') =>
    worker.inject({
      method: 'POST',
      url: route,
      payload,
      headers: { authorization: 'Bearer ' + jwt },
    });
  try {
    const id =
      (await admin.query("SELECT id FROM audit_tasks WHERE state='DONE' LIMIT 1")).rows[0]?.id ??
      randomUUID();
    const jwt = await service('scheduler');
    assert.equal((await post(await token(), { taskId: id })).statusCode, 401);
    assert.equal((await post(await service('other'), { taskId: id })).statusCode, 401);
    assert.equal((await post(jwt, { taskId: id, organization_id: ids.a })).statusCode, 422);
    assert.deepEqual((await post(jwt, { taskId: id })).json(), { processed: false });
    await admin.query(
      "UPDATE subscriptions SET paid_through=now()-interval '1 second' WHERE organization_id=$1",
      [ids.b],
    );
    const tick = await post(jwt, {}, '/internal/tick');
    assert.equal(tick.statusCode, 200, tick.body);
    assert.equal(tick.json().expired, 1);
    assert.equal((await post(jwt, {}, '/internal/tick')).json().expired, 0);
    assert.equal(
      (
        await admin.query('SELECT entitlement_status FROM subscriptions WHERE organization_id=$1', [
          ids.b,
        ])
      ).rows[0].entitlement_status,
      'SUSPENDED',
    );
    assert.equal(
      (
        await admin.query(
          "SELECT id FROM audit_logs WHERE action='license.expired' AND organization_id=$1",
          [ids.b],
        )
      ).rowCount,
      1,
    );
  } finally {
    await worker.close();
  }
});
test(
  'Browser E2E: PKCE login, unit, terms, 5x5 audit, results, approval, PDF and both themes',
  { timeout: 120000 },
  async () => {
    await browserFlow(pool, privateKey, publicKey, fixture, dir);
    writeFileSync(path.resolve('work/latest-browser-artifacts.txt'), dir);
  },
);

test('Universal Maps registration is atomic, reuses existing CID and never leaves an orphan', async () => {
  // The earlier scheduler test deliberately expires this fixture tenant.
  // This registration scenario requires an active foreign tenant of its own.
  await admin.query("UPDATE subscriptions SET entitlement_status='ACTIVE', billing_status='PAID', paid_through=now()+interval '30 days' WHERE organization_id=$1", [ids.b]);
  const s = app();
  const cid = String(1000000000000 + Math.floor(Math.random() * 100000000));
  const input = { mapsUrl: `https://www.google.com/maps?cid=${cid}`, externalId: cid };
  try {
    const first = await request(s, 'POST', '/v1/locations/register-confirmed', input);
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(first.json().data.created, true);
    assert.equal(first.json().data.location.identity_status, 'CONFIRMED');
    const id = first.json().data.location.id;
    const second = await request(s, 'POST', '/v1/locations/register-confirmed', input);
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().data.created, false);
    assert.equal(second.json().data.location.id, id);
    const orphanCid = String(BigInt(cid) + 100000000n);
    const orphan = await location(s, orphanCid);
    assert.equal(orphan.identity_status, 'UNRESOLVED');
    const repaired = await request(s, 'POST', '/v1/locations/register-confirmed', {
      mapsUrl: `https://www.google.com/maps?cid=${orphanCid}`,
      externalId: orphanCid,
    });
    assert.equal(repaired.statusCode, 200, repaired.body);
    assert.equal(repaired.json().data.location.id, orphan.id);
    assert.equal(repaired.json().data.location.identity_status, 'CONFIRMED');
    const foreign = await request(s, 'POST', '/v1/locations/register-confirmed', input, 'other', ids.b);
    assert.equal(foreign.statusCode, 201, foreign.body);
    assert.notEqual(foreign.json().data.location.id, id);
    const distinct = await request(s, 'POST', '/v1/locations/register-confirmed', {
      mapsUrl: `https://www.google.com/maps?cid=${cid}7`,
      externalId: 'not-the-found-cid',
    });
    assert.equal(distinct.statusCode, 409, distinct.body);
    const records = (await request(s, 'GET', '/v1/locations')).json().data;
    assert.equal(records.filter((x: { cid: string }) => x.cid === cid).length, 1);
  } finally {
    await s.close();
  }
});

test(
  'Backup: stopped PostgreSQL physical backup restores records, immutable hashes and RLS',
  { timeout: 60000 },
  async () => {
    const expected = (await admin.query('SELECT id,hash FROM report_drafts ORDER BY id')).rows;
    const count = (await admin.query('SELECT count(*)::int n FROM rank_measurements')).rows[0].n;
    await pool.end();
    await admin.end();
    poolsClosed = true;
    await postgres.stop();
    started = false;
    const restoreDir = path.join(dir, 'restore');
    cpSync(path.join(dir, 'pg'), restoreDir, { recursive: true });
    const restorePort = await freeTestPort();
    const restored = new EmbeddedPostgres({
      databaseDir: restoreDir,
      user: 'postgres',
      password,
      port: restorePort,
      persistent: true,
      postgresFlags: ['-h', '127.0.0.1'],
      onLog: () => {},
      onError: () => {},
    });
    await restored.start();
    const restoredAdmin = makePool(
        `postgresql://postgres:${password}@127.0.0.1:${restorePort}/test_lrt`,
      ),
      restoredApp = makePool(`postgresql://lrt_app:${password}@127.0.0.1:${restorePort}/test_lrt`);
    try {
      assert.deepEqual(
        (await restoredAdmin.query('SELECT id,hash FROM report_drafts ORDER BY id')).rows,
        expected,
      );
      assert.equal(
        (await restoredAdmin.query('SELECT count(*)::int n FROM rank_measurements')).rows[0].n,
        count,
      );
      await assertRuntimeRole(restoredApp);
      assert.equal((await restoredApp.query('SELECT * FROM rank_measurements')).rowCount, 0);
      await assert.rejects(
        () => restoredAdmin.query('UPDATE rank_measurements SET position=1'),
        /append-only/,
      );
      writeFileSync(
        path.resolve('work/restore-evidence.json'),
        JSON.stringify(
          {
            reports: expected.length,
            measurements: count,
            rlsVerified: true,
            immutableVerified: true,
            method: 'PostgreSQL stopped physical copy',
            at: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } finally {
      await restoredApp.end();
      await restoredAdmin.end();
      await restored.stop();
    }
  },
);

