import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { FastifyRequest } from 'fastify';
import type pg from 'pg';
import { transaction, type Tx } from '../../packages/db/index.js';
import { AppError, requireThat } from '../../packages/domain/errors.js';
import { uuid } from '../../packages/contracts/index.js';
import { isPlaceholderValue } from './runtime-config.js';
export type Principal = {
  id: string;
  subject: string;
  email: string;
  owner: boolean;
  mfa: boolean;
  authTime: number;
};
export type Context = { principal: Principal; org: string; role: string; requestId: string };
export class Authenticator {
  constructor(
    private issuer: string,
    private audience: string,
    private key: JWTVerifyGetKey,
    private mfaAcr = '',
  ) {}
  static fromEnv(env: Record<string, string | undefined> = process.env) {
    for (const k of ['OIDC_ISSUER', 'OIDC_AUDIENCE', 'OIDC_JWKS_URL'])
      if (!env[k]) throw Error(k + ' required');
    const issuerUrl = new URL(env.OIDC_ISSUER!);
    const url = new URL(env.OIDC_JWKS_URL!);
    if (isPlaceholderValue(issuerUrl.hostname) || isPlaceholderValue(url.hostname)) {
      throw Error('OIDC configuration uses a placeholder host');
    }
    // The production trust boundary ALWAYS requires HTTPS. A locally hosted
    // development IdP is permitted only with an explicit opt-in and exact
    // loopback issuer + JWKS address. Never allow a remote HTTP JWKS.
    const localDev =
      env.NODE_ENV === 'development' &&
      env.LRT_LOCAL_OIDC === 'I_UNDERSTAND_LOCAL_TEST_ONLY' &&
      env.OIDC_ISSUER === 'http://127.0.0.1:4181' &&
      url.href === 'http://127.0.0.1:4181/jwks';
    if (url.protocol !== 'https:' && !localDev) throw Error('JWKS requires HTTPS');
    return new Authenticator(
      env.OIDC_ISSUER!,
      env.OIDC_AUDIENCE!,
      createRemoteJWKSet(url),
      env.OIDC_MFA_ACR,
    );
  }
  async authenticate(req: FastifyRequest, pool: pg.Pool): Promise<Principal> {
    const token = /^Bearer ([^ ]+)$/.exec(req.headers.authorization ?? '')?.[1];
    requireThat(token, 401, 'UNAUTHENTICATED');
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'auth_time'],
        maxTokenAge: '1h',
        clockTolerance: 5,
      }));
    } catch {
      throw new AppError(401, 'INVALID_TOKEN');
    }
    requireThat(
      typeof payload.sub === 'string' &&
        typeof payload.auth_time === 'number' &&
        payload.auth_time <= Date.now() / 1000 + 5,
      401,
      'INVALID_TOKEN',
    );
    const user = await transaction(
      pool,
      { subject: payload.sub },
      async (tx) =>
        (await tx.query('SELECT * FROM users WHERE auth_subject=$1', [payload.sub])).rows[0],
    );
    requireThat(user && !user.disabled, 401, 'USER_NOT_PROVISIONED');
    const amr = Array.isArray(payload.amr) ? payload.amr : [];
    const mfa =
      amr.includes('mfa') ||
      (amr.includes('pwd') && amr.some((x) => ['otp', 'totp', 'hwk'].includes(String(x)))) ||
      Boolean(this.mfaAcr && payload.acr === this.mfaAcr) ||
      // Local homol. only: trusted loopback device sign-in. NOT real MFA.
      (this.issuer === 'http://127.0.0.1:4181' &&
        process.env.NODE_ENV === 'development' &&
        process.env.LRT_LOCAL_OIDC === 'I_UNDERSTAND_LOCAL_TEST_ONLY' &&
        process.env.LRT_LOCAL_EASY_LOGIN === 'LOCAL_MACHINE_ONLY' &&
        amr.includes('local_device'));
    return {
      id: user.id,
      subject: payload.sub,
      email: user.email,
      owner: user.platform_owner,
      mfa,
      authTime: payload.auth_time,
    };
  }
}
export function administrative(p: Principal, recent = false) {
  requireThat(p.mfa, 403, 'MFA_REQUIRED');
  if (recent) requireThat(Date.now() / 1000 - p.authTime < 300, 403, 'REAUTHENTICATION_REQUIRED');
}
export async function entitlement(tx: Tx, org: string, lock = false) {
  const row = (
    await tx.query(
      `SELECT s.*,p.max_locations,p.max_keywords,p.max_users,p.max_monthly_queries,p.monthly_budget_micros FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE organization_id=$1 ${lock ? 'FOR UPDATE OF s' : ''}`,
      [org],
    )
  ).rows[0];
  requireThat(
    row &&
      row.entitlement_status === 'ACTIVE' &&
      row.billing_status === 'PAID' &&
      new Date(row.paid_through).getTime() > Date.now(),
    402,
    'LICENSE_SUSPENDED',
  );
  return row;
}
export async function withTenant<T>(
  pool: pg.Pool,
  p: Principal,
  req: FastifyRequest,
  roles: string[],
  fn: (tx: Tx, c: Context) => Promise<T>,
  legal = false,
) {
  const org = uuid.parse(req.headers['x-organization-id']);
  return transaction(pool, { subject: p.subject, org }, async (tx) => {
    const member = (
      await tx.query(
        "SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE'",
        [org, p.id],
      )
    ).rows[0];
    requireThat(member, 403, 'TENANT_ACCESS_DENIED');
    if (member.role === 'org_admin') administrative(p);
    requireThat(roles.includes(member.role), 403, 'ROLE_DENIED');
    if (!legal) await entitlement(tx, org);
    return fn(tx, { principal: p, org, role: member.role, requestId: req.id });
  });
}
export async function locationAccess(tx: Tx, c: Context, id: string) {
  uuid.parse(id);
  const location = (
    await tx.query('SELECT * FROM business_locations WHERE organization_id=$1 AND id=$2', [
      c.org,
      id,
    ])
  ).rows[0];
  requireThat(location, 404, 'LOCATION_NOT_FOUND');
  if (c.role === 'client_viewer') {
    const acl = await tx.query(
      'SELECT 1 FROM location_acl WHERE organization_id=$1 AND location_id=$2 AND user_id=$3',
      [c.org, id, c.principal.id],
    );
    requireThat(acl.rowCount, 404, 'LOCATION_NOT_FOUND');
  }
  return location;
}
export async function log(
  tx: Tx,
  c: Context,
  action: string,
  id: string,
  metadata: Record<string, unknown> = {},
) {
  await tx.query(
    'INSERT INTO audit_logs(organization_id,actor,action,resource_id,trace_id,metadata) VALUES($1,$2,$3,$4,$5,$6)',
    [c.org, c.principal.id, action, id, c.requestId, JSON.stringify(metadata)],
  );
}
