import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError, requireThat } from '../../packages/domain/errors.js';

// Collections are accessed only by the server. Every tenant path is derived
// from a verified Firebase token and an active membership, never from a body.
export type Doc = Record<string, any>;
export type Principal = { uid: string; email: string; owner: boolean; mfa: boolean; authTime: number };
export type Context = { principal: Principal; org: string; role: string; member: Doc; organization: Doc };
export const now = () => Timestamp.now();
export const id = () => randomUUID();
export const docId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function canonical(value: any): any {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const wire = canonical;
export const millis = (value: any) => value instanceof Timestamp ? value.toMillis() : Date.parse(value);
export const readers = ['org_admin', 'analyst', 'client_viewer'];
export const writers = ['org_admin', 'analyst'];
export function firebaseServices() {
  const app = getApps()[0] ?? initializeApp();
  return { db: getFirestore(app), auth: getAuth(app) };
}
export class Store {
  constructor(public db: Firestore) {}
  org(org: string) { return this.db.collection('organizations').doc(docId.parse(org)); }
  col(org: string, collection: string) { return this.org(org).collection(collection); }
  ref(org: string, collection: string, key: string) { return this.col(org, collection).doc(docId.parse(key)); }
  async get(org: string, collection: string, key: string): Promise<Doc> {
    const s = await this.ref(org, collection, key).get();
    requireThat(s.exists, 404, 'RESOURCE_NOT_FOUND');
    return { ...s.data(), id: s.id };
  }
  async list(org: string, collection: string, locationId?: string): Promise<Doc[]> {
    let q: FirebaseFirestore.Query = this.col(org, collection);
    if (locationId) q = q.where('location_id', '==', docId.parse(locationId));
    const s = await q.limit(2000).get();
    return s.docs.map(d => ({ ...d.data(), id: d.id }));
  }
  async log(c: Context, action: string, resourceId: string, metadata: Doc = {}) {
    await this.col(c.org, 'audit_logs').add({ actor: c.principal.uid, action, resource_id: resourceId, metadata, created_at: now() });
  }
  async authenticate(token: DecodedIdToken): Promise<Principal> {
    requireThat(token.email_verified === true, 403, 'EMAIL_VERIFICATION_REQUIRED');
    const ref = this.db.collection('users').doc(docId.parse(token.uid));
    let user = await ref.get();
    const expectedOwner = process.env.OWNER_EMAIL?.trim().toLowerCase();
    if (!user.exists && expectedOwner && token.email?.toLowerCase() === expectedOwner) {
      const orgId = digest({ owner: token.uid }).slice(0, 32);
      await this.db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (existing.exists) return;
        tx.create(ref, { email: token.email, platform_owner: true, disabled: false, created_at: now() });
        tx.create(this.org(orgId), {
          name: 'Minha agência', slug: 'minha-agencia', version: 1,
          entitlement_status: 'ACTIVE', billing_status: 'INTERNAL', internal_owner_uid: token.uid,
          paid_through: Timestamp.fromDate(new Date('2099-01-01T00:00:00Z')),
          max_locations: 100, max_keywords: 5000, max_users: 20, max_monthly_queries: 10000,
          monthly_budget_micros: 0, created_at: now(),
          counts: { locations: 0, keywords: 0, active_keywords: 0, members: 1 },
        });
        tx.create(this.ref(orgId, 'members', token.uid), { user_id: token.uid, role: 'org_admin', status: 'ACTIVE', location_ids: [], created_at: now() });
      });
      user = await ref.get();
    }
    requireThat(user.exists && !user.data()?.disabled, 401, 'USER_NOT_PROVISIONED');
    return { uid: token.uid, email: token.email ?? '', owner: user.data()!.platform_owner === true,
      mfa: typeof token.firebase?.sign_in_second_factor === 'string', authTime: token.auth_time };
  }
  async context(p: Principal, org: string, roles = readers, legal = false): Promise<Context> {
    const [organization, member] = await this.db.getAll(this.org(org), this.ref(org, 'members', p.uid));
    requireThat(organization.exists && member.exists && member.data()?.status === 'ACTIVE', 403, 'TENANT_ACCESS_DENIED');
    const data = organization.data()!;
    requireThat(roles.includes(member.data()!.role), 403, 'ROLE_DENIED');
    if (!legal) requireThat(data.entitlement_status === 'ACTIVE' && millis(data.paid_through) > Date.now(), 402, 'LICENSE_SUSPENDED');
    if (member.data()!.role === 'org_admin' && roles !== readers) requireThat(p.mfa, 403, 'MFA_REQUIRED');
    return { principal: p, org, role: member.data()!.role, member: member.data()!, organization: data };
  }
  async location(c: Context, locationId: string) {
    requireThat(c.role !== 'client_viewer' || c.member.location_ids?.includes(locationId), 404, 'LOCATION_NOT_FOUND');
    return this.get(c.org, 'locations', locationId);
  }
  async assertActive(tx: Transaction, c: Context) {
    const [o, m, u] = await tx.getAll(this.org(c.org), this.ref(c.org, 'members', c.principal.uid), this.db.doc('users/' + c.principal.uid));
    requireThat(u.exists && !u.data()?.disabled && m.data()?.status === 'ACTIVE' && m.data()?.role === c.role, 403, 'TENANT_ACCESS_DENIED');
    requireThat(o.data()?.entitlement_status === 'ACTIVE' && millis(o.data()?.paid_through) > Date.now(), 402, 'LICENSE_SUSPENDED');
    return o.data()!;
  }
  async mutate<T>(c: Context, operation: (tx: Transaction, organization: Doc) => Promise<T>) {
    return this.db.runTransaction(async tx => operation(tx, await this.assertActive(tx, c)));
  }
}
