import Fastify, { type FastifyRequest, type FastifyReply, type HTTPMethods } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { Store, type Context, type Doc, type Principal, digest, id, now, wire, millis, readers, writers, docId } from './store.js';
import { DataForSeoProvider, getCloudProvider, type CloudProvider, candidateSchema } from './provider.js';
import { AppError, requireThat } from '../../packages/domain/errors.js';
import { locationInput, auditInput, pasteInput, text, uuid } from '../../packages/contracts/index.js';
import { parseMapsUrl, grid5x5 } from '../../packages/domain/maps.js';
import { parsePaste } from '../../packages/domain/keywords.js';
import { listNiches, suggestKeywords } from '../../packages/domain/auto-keywords.js';
import { compareHistory, feedbackText, pdfBytes } from '../api/analytics.js';
import { alertRules, signals } from '../api/signals.js';
import { registerFirebaseOwner } from './owner.js';
import { createAudit, dispatchAudit } from './worker.js';
import { localQueueProvider } from './queue-provider.js';

export type FirebaseApiOptions = { store: Store; auth: Auth; provider?: CloudProvider; logging?: boolean };
type Request = FastifyRequest<{ Params: Record<string, string> }>;
export type ApiServices = {
  store: Store; auth: Auth; provider: CloudProvider;
  principal(r: FastifyRequest): Promise<Principal>;
  context(r: FastifyRequest, roles?: string[], legal?: boolean): Promise<Context>;
  owner(r: FastifyRequest, recent?: boolean): Promise<Principal>;
};
const byDate = (rows: Doc[], field = 'created_at') => rows.sort((a,b) => millis(b[field]) - millis(a[field]));
const sorted = (rows: Doc[]) => rows.sort((a,b) => String(a.term ?? a.name).localeCompare(String(b.term ?? b.name),'pt-BR'));

export function buildFirebaseApp(options: FirebaseApiOptions) {
  const { store, auth } = options;
  const provider: CloudProvider = options.provider ?? getCloudProvider();
  // In Render the API enqueues only; Chrome is launched exclusively by a tenant-scoped local worker.
  const auditProvider = async (org: string): Promise<CloudProvider> =>
    (await localQueueProvider(store.db, org)) ?? provider;
  const app = Fastify({ logger: options.logging ?? false, bodyLimit: 200000, trustProxy: true });
  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
      if (/^https:\/\/seo-local-64b17\.(web\.app|firebaseapp\.com)$/.test(origin)) return cb(null, true);
      const custom = process.env.CORS_ALLOWED_ORIGIN;
      if (custom && origin === custom) return cb(null, true);
      return cb(new Error('CORS_NOT_ALLOWED'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Organization-Id', 'Idempotency-Key'],
  });
  app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } });
  app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.setErrorHandler((e, r, reply) => {
    if (e instanceof z.ZodError) return reply.code(422).send({error:{code:'INVALID_INPUT',requestId:r.id}});
    if (e instanceof AppError) return reply.code(e.status).send({error:{code:e.code,requestId:r.id}});
    r.log.error({err:e}, 'Request failed');
    return reply.code(500).send({error:{code:'INTERNAL_ERROR',requestId:r.id}});
  });
  const principal = async (r: FastifyRequest) => {
    const token = /^Bearer ([^ ]+)$/.exec(r.headers.authorization ?? '')?.[1];
    requireThat(token,401,'UNAUTHENTICATED');
    let decoded;
    try { decoded = await auth.verifyIdToken(token, true); } catch { throw new AppError(401,'INVALID_TOKEN'); }
    return store.authenticate(decoded);
  };
  const context = async (r: FastifyRequest, roles = readers, legal = false) =>
    store.context(await principal(r), docId.parse(r.headers['x-organization-id']), roles, legal);
  const owner = async (r: FastifyRequest, recent = true) => {
    const p = await principal(r);
    requireThat(p.owner,403,'OWNER_REQUIRED');
    requireThat(p.mfa,403,'MFA_REQUIRED');
    if (recent) requireThat(Date.now()/1000-p.authTime < 300,403,'REAUTHENTICATION_REQUIRED');
    return p;
  };
  const services: ApiServices = { store, auth, provider, principal, context, owner };
  const route = (method: HTTPMethods, url: string, fn: (r: Request, reply: FastifyReply) => Promise<unknown>) =>
    app.route({method,url,handler:async (r,reply) => {
      const result = await fn(r as Request,reply);
      if (!reply.sent) return {data:wire(result),meta:{requestId:r.id}};
    }});

  app.get('/health', async (_,reply) => {
    let connected = false;
    try { await store.db.doc('platform/health').get(); connected = true; } catch { /* no secrets in health */ }
    reply.header('Cache-Control','no-store').code(connected ? 200 : 503);
    return { status:connected?'ok':'degraded',service:'Local Rank Tracker',runtime:'firebase',
      api:{ready:connected,mode:'fastify'}, database:{configured:true,connected,roleVerified:true,schemaReady:connected,
        message:connected?'Cloud Firestore conectado.':'Cloud Firestore indisponível.'},
      oidc:{configured:true,message:'Firebase Authentication'},
      worker:{provider:provider.enabled?provider.id:'disabled',mode:provider.enabled?'cloud':'disabled',
        message:provider.enabled?'Duas capturas independentes por medição.':'Provedor real de ranking ainda não configurado.'},missing:connected?[]:['FIRESTORE_CONNECTION'] };
  });
  route('GET','/v1/me/organizations',async r => {
    const p = await principal(r);
    const memberships = await store.db.collectionGroup('members').where('user_id','==',p.uid).where('status','==','ACTIVE').limit(100).get();
    const organizations: Doc[] = [];
    for (const m of memberships.docs) {
      const ref = m.ref.parent.parent!;
      const organization = await ref.get();
      if (organization.exists) organizations.push({...organization.data(),id:ref.id,role:m.data().role});
    }
    return {organizations,owner:p.owner,mfa:p.mfa,email:p.email,uid:p.uid};
  });
  route('GET','/v1/provider/status', async r => {
    const c = await context(r);
    const active = await auditProvider(c.org);
    const local = active.id === 'local_chrome_preview';
    return {enabled:active.enabled,provider:active.enabled?active.id:'disabled',
      mode:local?'LOCAL_EXPERIMENTAL':'COMMERCIAL',
      canResolve:active.enabled && !local,canMeasureMaps:active.enabled,
      noPaidApi:local,reason:active.enabled?null:'PROVIDER_NOT_CONFIGURED'};
  });
  route('GET','/v1/brands',async r => {const c=await context(r);return sorted(await store.list(c.org,'brands'));});
  route('POST','/v1/brands',async r => {
    const c=await context(r,writers), b=z.object({name:text}).strict().parse(r.body);
    const row={id:id(),name:b.name,created_at:now()};
    await store.mutate(c,async tx=>{tx.create(store.ref(c.org,'brands',row.id),row);});
    return row;
  });
  route('GET','/v1/locations',async r=>{
    const c=await context(r),rows=await store.list(c.org,'locations');
    return sorted(rows.filter(l=>c.role!=='client_viewer'||c.member.location_ids.includes(l.id)));
  });
  // Local Chrome runs on the authorized user's PC, never inside the cloud API.
  // Resolution is queued in Firestore and polled from the authenticated browser.
  route('POST','/v1/locations/resolve',async r=>{
    const c=await context(r,writers);
    const b=z.object({mapsUrl:z.string().trim().min(1).max(2000)}).strict().parse(r.body);
    const parsed=parseMapsUrl(b.mapsUrl);
    const active=await auditProvider(c.org);
    if (!active.enabled) return {status:'PROVIDER_UNAVAILABLE',candidates:[],missing:['coletor ativo e autorizado']};
    if (active.id !== 'local_chrome_preview') {
      return {status:'REVIEW_REQUIRED',candidates:await active.resolve(parsed.url)};
    }
    const requestId=digest({org:c.org,actor:c.principal.uid,url:parsed.url,minute:Math.floor(Date.now()/60000)}).slice(0,40);
    const ref=store.ref(c.org,'resolve_requests',requestId);
    try {
      await ref.create({id:requestId,maps_url:parsed.url,requested_by:c.principal.uid,
        state:'QUEUED',provider:'local_chrome_preview',created_at:now()});
    } catch (err) {
      // Idempotent retry only for the exact same actor and normalized URL.
      const previous=await ref.get();
      if(!previous.exists || previous.data()?.requested_by!==c.principal.uid ||
        previous.data()?.maps_url!==parsed.url) throw err;
    }
    return {status:'QUEUED',requestId,candidates:[]};
  });
  route('GET','/v1/locations/resolve/:requestId',async r=>{
    const c=await context(r,writers);
    const request=await store.get(c.org,'resolve_requests',r.params.requestId);
    requireThat(request.requested_by===c.principal.uid,403,'RESOLVE_REQUEST_DENIED');
    if(request.state==='DONE') return {status:request.status??'REVIEW_REQUIRED',candidates:request.candidates??[],missing:request.missing??[]};
    if(request.state==='FAILED') return {status:'MAPS_LOOKUP_FAILED',candidates:[],missing:[request.failure??'identificação não concluída']};
    return {status:'QUEUED',candidates:[],requestId:r.params.requestId};
  });
  async function register(c:Context, b:z.infer<typeof locationInput>, hit?:z.infer<typeof candidateSchema>) {
    const parsed=parseMapsUrl(b.mapsUrl), newId=id();
    const identityKey=digest({cid:hit?.cid??parsed.cid,place:hit?.placeId??parsed.placeId,url:!(hit?.cid??parsed.cid)?parsed.url:null});
    return store.mutate(c,async(tx,org)=>{
      const identityRef=store.ref(c.org,'identities',identityKey);
      const existing=await tx.get(identityRef);
      if(existing.exists){const ref=store.ref(c.org,'locations',existing.data()!.location_id);const old=await tx.get(ref);return {location:{...old.data(),id:ref.id},created:false};}
      if(b.brandId) requireThat((await tx.get(store.ref(c.org,'brands',b.brandId))).exists,422,'BRAND_NOT_FOUND');
      requireThat((org.counts?.locations??0)<org.max_locations,429,'LOCATION_QUOTA_EXCEEDED');
      const location={id:newId,name:hit?.name??b.name,city:hit?.city??b.city,address:hit?.address??b.address,
        maps_url:parsed.url,lat:hit?.lat??b.lat,lng:hit?.lng??b.lng,cid:hit?.cid??parsed.cid,place_id:hit?.placeId??parsed.placeId,
        primary_category:hit?.category??null,brand_id:b.brandId??null,identity_status:hit?'CONFIRMED':'UNRESOLVED',
        source:hit?provider.id:'OPERATOR',created_at:now()};
      tx.create(store.ref(c.org,'locations',newId),location);
      tx.create(identityRef,{location_id:newId});
      tx.update(store.org(c.org),{'counts.locations':(org.counts?.locations??0)+1});
      return {location,created:true};
    });
  }
  route('POST','/v1/locations',async(r,reply)=>{const c=await context(r,writers);const result=await register(c,locationInput.parse(r.body));reply.code(result.created?201:200);return result.location;});
  route('POST','/v1/locations/register-attested',async(r,reply)=>{
    const c=await context(r,writers), b=z.object({mapsUrl:z.string().max(2000),name:text,city:text,address:text,
      lat:z.number().min(-85).max(85),lng:z.number().min(-180).max(180),attested:z.literal(true)}).strict().parse(r.body);
    const result=await register(c,locationInput.parse({name:b.name,city:b.city,address:b.address,mapsUrl:b.mapsUrl,lat:b.lat,lng:b.lng}));
    // Operator-supplied data are persisted but never promoted to independently
    // confirmed identity. Only the provider confirmation endpoint may do that.
    reply.code(result.created?201:200);return result;
  });
  route('POST','/v1/locations/register-confirmed',async(r,reply)=>{
    const c=await context(r,writers), b=z.object({mapsUrl:z.string().max(2000),externalId:text}).strict().parse(r.body);
    const parsed=parseMapsUrl(b.mapsUrl), hits=(await provider.resolve(parsed.url)).filter(x=>x.cid===b.externalId||x.placeId===b.externalId);
    requireThat(hits.length===1,409,'AMBIGUOUS_IDENTITY');const hit=hits[0];
    requireThat((!parsed.cid||parsed.cid===hit.cid)&&(!parsed.placeId||parsed.placeId===hit.placeId),409,'MAPS_IDENTITY_MISMATCH');
    const result=await register(c,{name:hit.name,address:hit.address,city:hit.city,mapsUrl:parsed.url,lat:hit.lat,lng:hit.lng},hit);
    reply.code(result.created?201:200);return result;
  });
  route('POST','/v1/locations/:id/confirm',async r=>{
    const c=await context(r,writers),l=await store.location(c,r.params.id),b=z.object({externalId:text}).strict().parse(r.body);
    const parsed=parseMapsUrl(l.maps_url),hits=(await provider.resolve(parsed.url)).filter(x=>x.cid===b.externalId||x.placeId===b.externalId);
    requireThat(hits.length===1,409,'AMBIGUOUS_IDENTITY');const hit=hits[0];
    requireThat((!parsed.cid||parsed.cid===hit.cid)&&(!parsed.placeId||parsed.placeId===hit.placeId),409,'MAPS_IDENTITY_MISMATCH');
    const update={name:hit.name,address:hit.address,city:hit.city,lat:hit.lat,lng:hit.lng,cid:hit.cid,place_id:hit.placeId,
      primary_category:hit.category??null,identity_status:'CONFIRMED',source:provider.id};
    await store.mutate(c,async tx=>{tx.update(store.ref(c.org,'locations',l.id),update);});return {...l,...update};
  });
  route('GET','/v1/niches',async r=>{await context(r,writers);return listNiches();});
  route('POST','/v1/locations/:id/keywords::suggest',async r=>{
    const c=await context(r,writers),l=await store.location(c,r.params.id);
    const b=z.object({niche:z.string().max(80).default('auto'),products:z.array(text).max(30).default([]),
      neighborhood:z.string().trim().max(100).optional(),limit:z.number().int().min(1).max(100).default(40)}).strict().parse(r.body);
    requireThat(b.niche==='auto'||listNiches().some(n=>n.value===b.niche),422,'UNKNOWN_NICHE');
    return {status:'SUGGESTED',...suggestKeywords({name:l.name,city:l.city,primaryCategory:l.primary_category??undefined,
      niche:b.niche,services:b.products,neighborhood:b.neighborhood,limit:b.limit})};
  });
  route('GET','/v1/locations/:id/keywords',async r=>{const c=await context(r);await store.location(c,r.params.id);return sorted(await store.list(c.org,'keywords',r.params.id));});
  route('POST','/v1/locations/:id/keywords::paste',async r=>{
    const c=await context(r,writers),l=await store.location(c,r.params.id),b=pasteInput.parse(r.body),parsed=parsePaste(b.content,l.id,l.name);
    requireThat(parsed.terms.length<=300,422,'TOO_MANY_KEYWORDS');
    return store.mutate(c,async(tx,org)=>{
      const refs=parsed.terms.map(t=>store.ref(c.org,'keywords',digest({location:l.id,key:t.normalizedKey})));
      const existing=refs.length?await tx.getAll(...refs):[];
      const additions=parsed.terms.map((t,i)=>({t,i})).filter(({i})=>!existing[i]?.exists);
      if(!b.preview){
        requireThat((org.counts?.keywords??0)+additions.length<=org.max_keywords,429,'KEYWORD_QUOTA_EXCEEDED');
        for(const {t,i}of additions)tx.create(refs[i],{id:refs[i].id,location_id:l.id,term:t.term,cluster:t.cluster,
          normalized_key:t.normalizedKey,kind:t.kind,status:'SUGGESTED',priority:t.priority,language:t.language,created_at:now()});
        tx.update(store.org(c.org),{'counts.keywords':(org.counts?.keywords??0)+additions.length});
      }
      return {...parsed,newCount:additions.length,inserted:b.preview?0:additions.length,existingDuplicates:existing.filter(x=>x.exists).length};
    });
  });
  route('POST','/v1/locations/:id/keywords::activate-reviewed',async r=>{
    const c=await context(r,writers);await store.location(c,r.params.id);z.object({confirmed:z.literal(true)}).strict().parse(r.body);
    return store.mutate(c,async(tx,org)=>{
      const rows=await tx.get(store.col(c.org,'keywords').where('location_id','==',r.params.id).where('status','in',['SUGGESTED','VALIDATED']).limit(301));
      requireThat(rows.size<=300,422,'TOO_MANY_KEYWORDS');requireThat((org.counts?.active_keywords??0)+rows.size<=org.max_keywords,429,'KEYWORD_QUOTA_EXCEEDED');
      rows.docs.forEach(d=>tx.update(d.ref,{status:'ACTIVE'}));tx.update(store.org(c.org),{'counts.active_keywords':(org.counts?.active_keywords??0)+rows.size});
      return {activated:rows.size};
    });
  });
  route('PATCH','/v1/keywords/:id',async r=>{
    const c=await context(r,writers),b=z.object({status:z.enum(['SUGGESTED','VALIDATED','ACTIVE','INACTIVE']),kind:z.enum(['BRAND','COMMERCIAL']).optional()}).strict().parse(r.body);
    const k=await store.get(c.org,'keywords',r.params.id);await store.location(c,k.location_id);
    return store.mutate(c,async(tx,org)=>{
      const ref=store.ref(c.org,'keywords',r.params.id),old=(await tx.get(ref)).data()!;
      requireThat(b.status!=='ACTIVE'||['VALIDATED','ACTIVE','INACTIVE'].includes(old.status),409,'REVIEW_KEYWORD_FIRST');
      const delta=Number(b.status==='ACTIVE')-Number(old.status==='ACTIVE');
      requireThat((org.counts?.active_keywords??0)+delta<=org.max_keywords,429,'KEYWORD_QUOTA_EXCEEDED');
      tx.update(ref,{...b});tx.update(store.org(c.org),{'counts.active_keywords':(org.counts?.active_keywords??0)+delta});return {id:r.params.id,...b};
    });
  });
  route('GET','/v1/locations/:id/grids',async r=>{const c=await context(r);await store.location(c,r.params.id);return byDate(await store.list(c.org,'grids',r.params.id));});
  route('POST','/v1/locations/:id/grids',async r=>{
    const c=await context(r,writers),l=await store.location(c,r.params.id),b=z.object({spacingM:z.number().int().min(50).max(10000),mode:z.enum(['single','grid5x5']).default('grid5x5')}).strict().parse(r.body);
    const row={id:id(),location_id:l.id,spacing_m:b.spacingM,points:b.mode==='single'?[{sequence:0,lat:l.lat,lng:l.lng}]:grid5x5(l.lat,l.lng,b.spacingM),created_at:now()};
    await store.mutate(c,async tx=>{tx.create(store.ref(c.org,'grids',row.id),row);});return row;
  });
  route('POST','/v1/locations/:id/audits',async(r,reply)=>{
    const c=await context(r,writers),b=auditInput.parse(r.body);
    const source = await auditProvider(c.org);
    const result=await createAudit(store,c,r.params.id,b,source,String(r.headers['idempotency-key']??''));
    if(!b.dryRun) {
      reply.code(201);
      if ('runId' in result && !('replayed' in result && result.replayed)) {
        await dispatchAudit(store, c.org, result.runId);
      }
    }
    return result;
  });
  route('GET','/v1/locations/:id/audits',async r=>{const c=await context(r);await store.location(c,r.params.id);return byDate(await store.list(c.org,'audits',r.params.id));});
  route('GET','/v1/audits/:id',async r=>{
    const c=await context(r),run=await store.get(c.org,'audits',r.params.id);await store.location(c,run.location_id);
    return {...run,totals:Object.entries(run.task_totals??{}).map(([state,count])=>({state,count}))};
  });
  async function rankings(c:Context,location:string){await store.location(c,location);const rows=await store.list(c.org,'measurements',location);return compareHistory(wire(rows.sort((a,b)=>millis(a.observed_at)-millis(b.observed_at))) as any);}
  route('GET','/v1/locations/:id/rankings',async r=>rankings(await context(r),r.params.id));
  route('GET','/v1/organizations/:orgId/summary',async r=>{
    const c=await context(r);requireThat(c.org===r.params.orgId,403,'TENANT_ACCESS_DENIED');
    const units=[];for(const l of await store.list(c.org,'locations')){if(c.role==='client_viewer'&&!c.member.location_ids.includes(l.id))continue;
      units.push({id:l.id,name:l.name,brand_id:l.brand_id,brand:null,...(await rankings(c,l.id)).summary});}
    return {units,provider:provider.enabled?provider.id:'disabled',providerEnabled:provider.enabled,isDemo:false};
  });
  route('GET','/v1/locations/:id/competitors',async r=>{
    const c=await context(r);await store.location(c,r.params.id);return byDate(await store.list(c.org,'competitors',r.params.id),'observed_at').filter(x=>millis(x.retention_until)>Date.now());
  });
  route('GET','/v1/locations/:id/alert-rules',async r=>{const c=await context(r),l=await store.location(c,r.params.id);return alertRules.parse(l.alert_rules??{});});
  route('PATCH','/v1/locations/:id/alert-rules',async r=>{const c=await context(r,['org_admin']);await store.location(c,r.params.id);const b=alertRules.parse(r.body);await store.mutate(c,async tx=>{tx.update(store.ref(c.org,'locations',r.params.id),{alert_rules:b});});return b;});
  route('GET','/v1/locations/:id/alerts',async r=>{const c=await context(r),l=await store.location(c,r.params.id);return signals((await rankings(c,l.id)).history,alertRules.parse(l.alert_rules??{}));});
  route('GET','/v1/locations/:id/opportunities',async r=>{
    const c=await context(r),rows=(await rankings(c,r.params.id)).latest.filter(m=>m.status==='VERIFIED'&&m.query_snapshot.kind==='COMMERCIAL');
    const actions=await store.list(c.org,'opportunities',r.params.id);
    return rows.filter(m=>m.position!>1).map(m=>({measurementId:m.id,term:m.query_snapshot.term,position:m.position,score:Math.max(0,100-m.position!*3),
      state:actions.find(a=>a.id===m.id)?.state??'OPEN',suggestion:'Revisar a pertinência do termo e as informações confirmadas da ficha. Sem garantia de posição.',observed_at:m.observed_at,is_demo:m.is_demo}));
  });
  route('PATCH','/v1/locations/:id/opportunities/:measurementId',async r=>{
    const c=await context(r,writers);await store.location(c,r.params.id);const m=await store.get(c.org,'measurements',r.params.measurementId);
    requireThat(m.location_id===r.params.id&&m.status==='VERIFIED',404,'MEASUREMENT_NOT_FOUND');
    const b=z.object({state:z.enum(['IN_PROGRESS','DONE','DISMISSED'])}).strict().parse(r.body);
    await store.mutate(c,async tx=>{tx.set(store.ref(c.org,'opportunities',m.id),{location_id:r.params.id,...b,updated_at:now()});});return b;
  });
  route('GET','/v1/measurements/:id/evidence',async r=>{
    const c=await context(r),m=await store.get(c.org,'measurements',r.params.id);await store.location(c,m.location_id);
    return store.get(c.org,'evidence',m.id);
  });
  route('GET','/v1/branding',async r=>{const c=await context(r);const s=await store.ref(c.org,'settings','branding').get();return s.data()??null;});
  route('POST','/v1/branding',async r=>{
    const c=await context(r,['org_admin']),b=z.object({displayName:text,logoBase64:z.string().max(120000).nullable()}).strict().parse(r.body);
    if(b.logoBase64){const png=Buffer.from(b.logoBase64,'base64');requireThat(png.length<=90000&&png.length>=24&&png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&png.readUInt32BE(16)<=1024&&png.readUInt32BE(20)<=1024,422,'INVALID_PNG');}
    await store.mutate(c,async tx=>{tx.set(store.ref(c.org,'settings','branding'),b);});return b;
  });
  route('POST','/v1/locations/:id/reports',async r=>{
    const c=await context(r,writers),l=await store.location(c,r.params.id),b=z.object({runId:uuid}).strict().parse(r.body),run=await store.get(c.org,'audits',b.runId);
    requireThat(run.location_id===l.id&&String(run.status).startsWith('COMPLETED'),409,'RUN_NOT_COMPLETED');
    const rows=(await store.list(c.org,'measurements',l.id)).filter(m=>m.run_id===run.id);requireThat(rows.length,409,'NO_MEASUREMENTS');
    const branding=(await store.ref(c.org,'settings','branding').get()).data();
    const content={agency:branding?.displayName??null,logoBase64:branding?.logoBase64??null,name:l.name,city:l.city,isDemo:run.is_demo,provider:run.provider,rows:wire(rows),runId:run.id,version:'firebase-rank-proof-v1'};
    const row={id:id(),location_id:l.id,run_id:run.id,content_json:content,hash:digest(content),state:'DRAFT',created_at:now()};
    await store.mutate(c,async tx=>{tx.create(store.ref(c.org,'reports',row.id),row);});return row;
  });
  route('GET','/v1/locations/:id/reports',async r=>{const c=await context(r);await store.location(c,r.params.id);return byDate(await store.list(c.org,'reports',r.params.id)).filter(x=>c.role!=='client_viewer'||x.state==='APPROVED');});
  async function report(c:Context,key:string){const d=await store.get(c.org,'reports',key);await store.location(c,d.location_id);requireThat(c.role!=='client_viewer'||d.state==='APPROVED',404,'REPORT_NOT_FOUND');requireThat(d.hash===digest(d.content_json),409,'REPORT_HASH_MISMATCH');return d;}
  route('GET','/v1/reports/:id',async r=>{const c=await context(r),d=await report(c,r.params.id);return {...d,text:feedbackText(d.content_json)};});
  for(const action of ['review','approve'])route('POST',`/v1/reports/:id/${action}`,async r=>{
    const c=await context(r,action==='approve'?['org_admin']:writers),d=await report(c,r.params.id);
    if(action==='approve')requireThat(Date.now()/1000-c.principal.authTime<300,403,'REAUTHENTICATION_REQUIRED');
    const expected=action==='review'?'DRAFT':'IN_REVIEW',state=action==='review'?'IN_REVIEW':'APPROVED';
    await store.mutate(c,async tx=>{const ref=store.ref(c.org,'reports',d.id),current=await tx.get(ref);requireThat(current.data()?.state===expected,409,'INVALID_REPORT_TRANSITION');requireThat(current.data()?.hash===digest(current.data()?.content_json),409,'REPORT_HASH_MISMATCH');tx.update(ref,{state,reviewed_by:c.principal.uid});});
    return {state};
  });
  route('GET','/v1/reports/:id/whatsapp',async r=>{const c=await context(r),d=await report(c,r.params.id);requireThat(d.state==='APPROVED',409,'REPORT_NOT_APPROVED');return {text:feedbackText(d.content_json),hash:d.hash};});
  route('GET','/v1/reports/:id/pdf',async(r,reply)=>{const c=await context(r),d=await report(c,r.params.id);requireThat(d.state==='APPROVED',409,'REPORT_NOT_APPROVED');const bytes=await pdfBytes(feedbackText(d.content_json),d.content_json.logoBase64,new Date(millis(d.created_at)));reply.header('Content-Disposition','attachment; filename="Local-Rank-Tracker.pdf"').header('X-Content-SHA256',digest(d.content_json)).type('application/pdf').send(bytes);});
  route('GET','/v1/usage',async r=>{const c=await context(r);const usage=await store.list(c.org,'usage');return {license:c.organization,ledger:usage.map(x=>({state:x.state,units:x.units,cost:x.cost??0,reserved:x.reserved??0}))};});
  route('POST','/v1/legal/data-requests',async r=>{const c=await context(r,readers,true),b=z.object({type:z.enum(['EXPORT','DELETE']),reason:z.string().trim().min(1).max(1000).optional()}).strict().parse(r.body);const ref=store.col(c.org,'legal_requests').doc();await ref.create({...b,requested_by:c.principal.uid,created_at:now(),status:'REQUESTED'});return {id:ref.id,status:'REQUESTED'};});
  registerFirebaseOwner(app,services);
  return app;
}
