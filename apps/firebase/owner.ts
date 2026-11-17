import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { ApiServices } from './api.js';
import { type Doc, id, now, wire, digest, docId } from './store.js';
import { requireThat } from '../../packages/domain/errors.js';
import { text, uuid } from '../../packages/contracts/index.js';

export function registerFirebaseOwner(app:FastifyInstance,s:ApiServices){
  const wrap=(data:unknown)=>({data:wire(data)}),db=s.store.db;
  const planSchema=z.object({code:text,maxLocations:z.number().int().min(1).max(10000),maxKeywords:z.number().int().min(1).max(100000),
    maxMonthlyQueries:z.number().int().min(1).max(1000000),maxUsers:z.number().int().min(1).max(1000),monthlyBudgetMicros:z.number().int().min(0).max(1e12)}).strict();
  app.get('/v1/platform/plans',async r=>{await s.owner(r,false);return wrap((await db.collection('plans').limit(100).get()).docs.map(d=>({...d.data(),id:d.id})));});
  app.post('/v1/platform/plans',async r=>{await s.owner(r);const b=planSchema.parse(r.body),row={id:id(),code:b.code,max_locations:b.maxLocations,max_keywords:b.maxKeywords,
    max_monthly_queries:b.maxMonthlyQueries,max_users:b.maxUsers,monthly_budget_micros:b.monthlyBudgetMicros,created_at:now()};await db.doc('plans/'+row.id).create(row);return wrap(row);});
  app.get('/v1/platform/organizations',async r=>{await s.owner(r,false);return wrap((await db.collection('organizations').limit(500).get()).docs.map(d=>({...d.data(),id:d.id})));});
  app.post('/v1/platform/users',async r=>{
    await s.owner(r);const b=z.object({subject:text,email:z.email()}).strict().parse(r.body),firebaseUser=await s.auth.getUser(b.subject);
    requireThat(firebaseUser.emailVerified&&firebaseUser.email?.toLowerCase()===b.email.toLowerCase()&&!firebaseUser.disabled,422,'FIREBASE_IDENTITY_MISMATCH');
    const ref=db.doc('users/'+docId.parse(b.subject));await db.runTransaction(async tx=>{const old=await tx.get(ref);if(!old.exists)tx.create(ref,{email:b.email,platform_owner:false,disabled:false,created_at:now()});});return wrap({id:b.subject});
  });
  app.post('/v1/organizations',async r=>{
    const p=await s.owner(r),b=z.object({name:text,slug:z.string().regex(/^[a-z0-9-]{3,60}$/),planId:uuid,paidThrough:z.string().datetime(),adminSubject:text,adminEmail:z.email(),reason:z.string().min(8).max(500)}).strict().parse(r.body);
    requireThat(Date.parse(b.paidThrough)>Date.now(),422,'PAID_PERIOD_REQUIRED');const user=await s.auth.getUser(b.adminSubject);
    requireThat(user.emailVerified&&user.email?.toLowerCase()===b.adminEmail.toLowerCase(),422,'FIREBASE_IDENTITY_MISMATCH');
    const newId=id(),slugRef=db.doc('organization_slugs/'+b.slug),key=digest({b,actor:p.uid});
    const result=await db.runTransaction(async tx=>{
      const userRef=db.doc('users/'+docId.parse(b.adminSubject));
      const old=await tx.get(slugRef),plan=await tx.get(db.doc('plans/'+b.planId)),existingUser=await tx.get(userRef);
      if(old.exists){requireThat(old.data()?.request_hash===key,409,'ORGANIZATION_CONFLICT');return {id:old.data()!.organization_id,replayed:true};}
      requireThat(plan.exists,422,'PLAN_NOT_FOUND');
      const row={...plan.data(),id:newId,name:b.name,slug:b.slug,version:1,entitlement_status:'ACTIVE',billing_status:'PAID',
        paid_through:Timestamp.fromDate(new Date(b.paidThrough)),created_at:now(),counts:{locations:0,keywords:0,active_keywords:0,members:1}};
      tx.create(s.store.org(newId),row);tx.create(slugRef,{organization_id:newId,request_hash:key});
      if(!existingUser.exists)tx.create(userRef,{email:b.adminEmail,disabled:false,platform_owner:false,created_at:now()});
      tx.create(s.store.ref(newId,'members',b.adminSubject),{user_id:b.adminSubject,role:'org_admin',status:'ACTIVE',location_ids:[],created_at:now()});
      tx.create(s.store.ref(newId,'audit_logs',id()),{actor:p.uid,action:'organization.provisioned',resource_id:newId,metadata:{reason:b.reason},created_at:now()});return row;
    });return wrap(result);
  });
  app.patch<{Params:{id:string}}>('/v1/platform/organizations/:id/license',async r=>{
    const p=await s.owner(r),b=z.object({expectedVersion:z.number().int().positive(),status:z.enum(['ACTIVE','SUSPENDED']),paidThrough:z.string().datetime(),
      reason:z.string().min(8).max(500),amountCents:z.number().int().nonnegative(),currency:z.literal('BRL')}).strict().parse(r.body);
    const ref=s.store.org(r.params.id),eventRef=s.store.ref(r.params.id,'billing_events',digest(String(r.headers['idempotency-key']??''))),h=digest(b);
    return wrap(await db.runTransaction(async tx=>{const current=await tx.get(ref),previous=await tx.get(eventRef);if(previous.exists){requireThat(previous.data()?.request_hash===h,409,'IDEMPOTENCY_CONFLICT');return previous.data();}
      requireThat(current.exists&&current.data()?.version===b.expectedVersion,409,'STALE_LICENSE_VERSION');requireThat(b.status!=='ACTIVE'||Date.parse(b.paidThrough)>Date.now(),422,'PAID_PERIOD_REQUIRED');
      const patch={entitlement_status:b.status,billing_status:b.status==='ACTIVE'?'PAID':'UNPAID',paid_through:Timestamp.fromDate(new Date(b.paidThrough)),version:b.expectedVersion+1};
      tx.update(ref,patch);tx.create(eventRef,{...b,request_hash:h,actor:p.uid,created_at:now()});return patch;}));
  });
  app.get('/v1/platform/audit-logs',async r=>{await s.owner(r,false);return wrap((await db.collectionGroup('audit_logs').orderBy('created_at','desc').limit(200).get()).docs.map(d=>({...d.data(),id:d.id})));});
  app.get('/v1/platform/legal-requests',async r=>{await s.owner(r,false);return wrap((await db.collectionGroup('legal_requests').limit(200).get()).docs.map(d=>({...d.data(),id:d.id})));});
  app.get('/v1/team',async r=>{const c=await s.context(r,['org_admin']);return wrap(await s.store.list(c.org,'members'));});
  app.post('/v1/team',async r=>{
    const c=await s.context(r,['org_admin']),b=z.object({userId:text,role:z.enum(['org_admin','analyst','client_viewer']),locationIds:z.array(uuid).max(100)}).strict().parse(r.body);
    requireThat(b.userId!==c.principal.uid,403,'SELF_ROLE_CHANGE_FORBIDDEN');
    const result=await s.store.mutate(c,async(tx,o)=>{
      const user=await tx.get(db.doc('users/'+docId.parse(b.userId))),memberRef=s.store.ref(c.org,'members',b.userId),old=await tx.get(memberRef);
      requireThat(user.exists&&!user.data()?.disabled,422,'USER_NOT_PROVISIONED');
      for(const locationId of b.locationIds)requireThat((await tx.get(s.store.ref(c.org,'locations',locationId))).exists,422,'LOCATION_NOT_FOUND');
      requireThat(old.exists||(o.counts?.members??0)<o.max_users,429,'USER_QUOTA_EXCEEDED');
      const member={user_id:b.userId,role:b.role,status:'ACTIVE',location_ids:b.locationIds,updated_at:now()};tx.set(memberRef,member);
      if(!old.exists)tx.update(s.store.org(c.org),{'counts.members':(o.counts?.members??0)+1});return member;
    });return wrap(result);
  });
  app.patch<{Params:{id:string}}>('/v1/team/:id/revoke',async r=>{
    const c=await s.context(r,['org_admin']);requireThat(r.params.id!==c.principal.uid,403,'SELF_REVOKE_FORBIDDEN');
    await s.store.mutate(c,async tx=>{const ref=s.store.ref(c.org,'members',r.params.id),old=await tx.get(ref);requireThat(old.exists,404,'MEMBER_NOT_FOUND');tx.update(ref,{status:'REVOKED',updated_at:now()});});return wrap({status:'REVOKED'});
  });
  app.post('/v1/webhooks/billing',async()=>{requireThat(false,503,'BILLING_GATEWAY_NOT_CONFIGURED');});
}
