import { Timestamp } from 'firebase-admin/firestore';
import type { AuditInput, RankQuery } from '../../packages/contracts/index.js';
import { AppError, requireThat } from '../../packages/domain/errors.js';
import { Store, type Context, type Doc, id, now, digest, millis } from './store.js';
import { type CloudProvider, verifyPair, type Capture } from './provider.js';

export async function createAudit(store:Store,c:Context,locationId:string,input:AuditInput,provider:CloudProvider,key:string){
  const location=await store.location(c,locationId),grid=await store.get(c.org,'grids',input.gridId);
  requireThat(grid.location_id===location.id,404,'GRID_NOT_FOUND');
  const terms=(await store.list(c.org,'keywords',location.id)).filter(k=>k.status==='ACTIVE');
  const plannedTasks=terms.length*grid.points.length,estimatedCost=plannedTasks*2*provider.maxCostMicros;
  requireThat(plannedTasks>0&&plannedTasks<=2500,422,'INVALID_AUDIT_SIZE');
  const quote={status:provider.enabled?'PREFLIGHT_OK':'PROVIDER_UNAVAILABLE',plannedTasks,keywordCount:terms.length,
    estimatedCostUsdMicros:provider.enabled?estimatedCost:null,provider:provider.id,isDemo:provider.demo,capturesPerPoint:2};
  if(input.dryRun)return quote;
  requireThat(provider.enabled,503,'PROVIDER_UNAVAILABLE');
  requireThat(location.identity_status==='CONFIRMED'&&(location.cid||location.place_id),409,'IDENTITY_UNCONFIRMED');
  requireThat(input.surface==='MAPS'&&input.device==='desktop',422,'UNSUPPORTED_SURFACE');
  requireThat(input.maxProviderBudgetUsdMicros>=estimatedCost,422,'AUDIT_BUDGET_EXCEEDED');
  requireThat(key.length>=8&&key.length<=200,422,'IDEMPOTENCY_KEY_REQUIRED');
  const runId=id(),month=new Date().toISOString().slice(0,7),requestHash=digest({locationId,input,actor:c.principal.uid});
  return store.mutate(c,async(tx,org)=>{
    const keyRef=store.ref(c.org,'idempotency',digest({kind:'audit',key})),previous=await tx.get(keyRef);
    if(previous.exists){requireThat(previous.data()!.request_hash===requestHash,409,'IDEMPOTENCY_CONFLICT');return {runId:previous.data()!.run_id,replayed:true};}
    const termSnap=await tx.get(store.col(c.org,'keywords').where('location_id','==',location.id).where('status','==','ACTIVE').limit(101));
    requireThat(termSnap.size<=100,422,'AUDIT_MAX_100_KEYWORDS');
    requireThat(digest(termSnap.docs.map(d=>d.id).sort())===digest(terms.map(t=>t.id).sort()),409,'AUDIT_TERMS_CHANGED');
    const currentLocation=await tx.get(store.ref(c.org,'locations',location.id)),currentGrid=await tx.get(store.ref(c.org,'grids',grid.id));
    requireThat(digest(currentLocation.data())===digest(location),409,'LOCATION_CHANGED');
    requireThat(currentGrid.exists&&digest(currentGrid.data())===digest(grid),409,'GRID_CHANGED');
    const usageRef=store.ref(c.org,'monthly_usage',month),usage=await tx.get(usageRef),used=usage.data()??{units:0,cost:0,reserved:0};
    const globalRef=store.db.doc('provider_budgets/'+month),global=await tx.get(globalRef),g=global.data()??{cost:0,reserved:0};
    const globalLimit=Number(process.env.RANK_GLOBAL_MONTHLY_BUDGET_MICROS||0);
    requireThat(Number.isSafeInteger(globalLimit)&&globalLimit>0&&g.cost+g.reserved+estimatedCost<=globalLimit,429,'GLOBAL_PROVIDER_BUDGET_EXCEEDED');
    requireThat(used.units+plannedTasks*2<=org.max_monthly_queries,429,'QUERY_QUOTA_EXCEEDED');
    requireThat(used.cost+used.reserved+estimatedCost<=org.monthly_budget_micros,429,'MONTHLY_BUDGET_EXCEEDED');
    // Experimental Chrome observations are real but not commercially licensed.
  // Synthetic providers remain forbidden outside tests.
  requireThat(!provider.demo||process.env.NODE_ENV==='test',403,'DEMO_PROVIDER_FORBIDDEN');
    const run={id:runId,location_id:location.id,status:'QUEUED',provider:provider.id,is_demo:provider.demo,is_experimental:provider.id==='local_chrome_preview',created_at:now(),
      estimated_cost:estimatedCost,actual_cost:0,completed_tasks:0,warning_tasks:0,actor_uid:c.principal.uid,actor_role:c.role,
      month,task_totals:{QUEUED:plannedTasks},config_snapshot:{plannedTasks,location,grid,terms,input,requestHash},
      cost_per_task:provider.maxCostMicros*2};
    tx.create(store.ref(c.org,'audits',runId),run);
    tx.create(keyRef,{run_id:runId,request_hash:requestHash,created_at:now()});
    tx.set(usageRef,{...used,units:used.units+plannedTasks*2,reserved:used.reserved+estimatedCost});
    tx.set(globalRef,{...g,reserved:g.reserved+estimatedCost});
    tx.create(store.ref(c.org,'usage',runId),{units:plannedTasks*2,cost:0,reserved:estimatedCost,state:'RESERVED',created_at:now()});
    return {runId,status:'QUEUED'};
  });
}

export async function dispatchAudit(store:Store,org:string,runId:string){
  const run=await store.get(org,'audits',runId),s=run.config_snapshot;
  if(!['QUEUED','RUNNING','CANCELLING'].includes(run.status))return;
  // Deterministic IDs allow safe re-delivery of the Firestore trigger. Creating
  // an already-created task never launches a second paid provider request.
  const writer=store.db.bulkWriter();
  writer.onWriteError(e=>e.code===6?false:e.failedAttempts<3);
  const pending:Promise<unknown>[]=[];
  for(const term of s.terms)for(const point of s.grid.points){
    const taskId=digest({runId,term:term.id,point:point.sequence});
    const query:RankQuery={term:term.term,keywordId:term.id,kind:term.kind,cluster:term.cluster,
      surface:s.input.surface,language:s.input.language,device:s.input.device,lat:point.lat,lng:point.lng,
      depth:20,cid:s.location.cid,placeId:s.location.place_id,expectedName:s.location.name,point:point.sequence,
      algorithmVersion:run.provider==='local_chrome_preview'?'firebase-pair-v2-context':'firebase-pair-v1'};
    pending.push(writer.create(store.ref(org,'tasks',taskId),{id:taskId,run_id:runId,location_id:run.location_id,
      actor_uid:run.actor_uid,actor_role:run.actor_role,month:run.month,state:'QUEUED',provider:run.provider,is_experimental:run.is_experimental===true,reserved_cost:run.cost_per_task,query,created_at:now()}).catch(e=>{if(e.code!==6)throw e;}));
  }
  await writer.close();await Promise.all(pending);
  await store.db.runTransaction(async tx=>{
    const ref=store.ref(org,'audits',runId),current=await tx.get(ref);
    if(current.data()?.status==='QUEUED')tx.update(ref,{status:'RUNNING',dispatched_at:now()});
  });
}

export async function requestAuditCancellation(store:Store,c:Context,runId:string,reason:string) {
  const result=await store.mutate(c,async tx=>{
    const ref=store.ref(c.org,'audits',runId),snapshot=await tx.get(ref);
    requireThat(snapshot.exists,404,'AUDIT_NOT_FOUND');
    const run=snapshot.data()!;
    if(['COMPLETED','COMPLETED_WITH_WARNINGS','CANCELLED'].includes(run.status))return {status:run.status};
    if(!run.cancel_requested) {
      tx.update(ref,{cancel_requested:true,status:'CANCELLING',cancellation_reason:reason,
        cancellation_requested_at:now(),cancellation_requested_by:c.principal.uid});
      tx.create(store.ref(c.org,'audit_logs',id()),{actor:c.principal.uid,action:'audit.cancel_requested',
        resource_id:runId,metadata:{reason},created_at:now()});
    }
    return {status:'CANCELLING'};
  });
  // A previous dispatch can have been interrupted. Deterministic task IDs let
  // the worker settle every reservation without starting another capture.
  if(result.status==='CANCELLING')await dispatchAudit(store,c.org,runId);
  return result;
}

export async function processFirebaseTask(store:Store,provider:CloudProvider,org:string,taskId:string){
  const ref=store.ref(org,'tasks',taskId),lease=id();
  const task=await store.db.runTransaction<Doc|null>(async tx=>{
    const s=await tx.get(ref);if(!s.exists||s.data()!.state!=='QUEUED')return null;
    const t=s.data()!;
    // Triggers for one provider must never cancel or consume another provider's task.
    if (t.provider !== provider.id) return null;
    const o=await tx.get(store.org(org)),m=await tx.get(store.ref(org,'members',t.actor_uid)),u=await tx.get(store.db.doc('users/'+t.actor_uid));
    const run=await tx.get(store.ref(org,'audits',t.run_id));
    const allowed=provider.enabled&&!run.data()?.cancel_requested&&o.data()?.entitlement_status==='ACTIVE'&&millis(o.data()?.paid_through)>Date.now()&&
      m.data()?.status==='ACTIVE'&&m.data()?.role===t.actor_role&&u.exists&&!u.data()?.disabled;
    tx.update(ref,{state:'RUNNING',lease,started_at:now()});
    return {...t,allowed};
  });
  if(!task)return;
  let first:Capture|undefined,second:Capture|undefined,status='CANCELLED',position:number|null=null,identityMatch:string|null=null,cost=0,uncertain=false,capturesAttempted=0,reason:string|null=null;
  if(task.allowed){
    try{
      capturesAttempted++;first=await provider.measure(task.query,taskId+':1');
      cost+=first.costMicros;
      // Persist the first proof before requesting the independent confirmation.
      await store.ref(org,'capture_checkpoints',taskId).create({first,created_at:now()});
      const [o,m,u,run]=await store.db.getAll(store.org(org),store.ref(org,'members',task.actor_uid),store.db.doc('users/'+task.actor_uid),store.ref(org,'audits',task.run_id));
      requireThat(!run.data()?.cancel_requested,409,'AUDIT_CANCELLED');
      requireThat(o.data()?.entitlement_status==='ACTIVE'&&millis(o.data()?.paid_through)>Date.now()&&m.data()?.status==='ACTIVE'&&m.data()?.role===task.actor_role&&u.exists&&!u.data()?.disabled,403,'LICENSE_SUSPENDED');
      capturesAttempted++;second=await provider.measure(task.query,taskId+':2');cost+=second.costMicros;
      const result=verifyPair(task.query,first,second);status=result.status;position=result.position;identityMatch=result.identityMatch;reason=result.reason;
    }catch(e){
      reason=e instanceof AppError?e.code:'CAPTURE_FAILED';
      status=reason==='AUDIT_CANCELLED'?'CANCELLED':'ERROR';
      uncertain=status==='ERROR';
    }
  }
  await settleFirebaseTask(store,provider,org,taskId,task,lease,{first,second,status,position,identityMatch,cost,uncertain,capturesAttempted,reason});
}

type TaskOutcome={first?:Capture;second?:Capture;status:string;position:number|null;identityMatch:string|null;
  cost:number;uncertain:boolean;capturesAttempted:number;reason:string|null};
async function settleFirebaseTask(store:Store,provider:Pick<CloudProvider,'id'|'demo'>,org:string,taskId:string,task:Doc,lease:string,outcome:TaskOutcome){
  const ref=store.ref(org,'tasks',taskId);
  const {first,second,status,position,identityMatch,cost,uncertain,capturesAttempted,reason}=outcome;
  const actual=cost,accounted=uncertain?Math.max(task.reserved_cost,cost):cost;
  const observation={id:taskId,run_id:task.run_id,location_id:task.location_id,status,position,identity_match:identityMatch,
    observed_at:Timestamp.fromMillis(Number.isFinite(Date.parse(second?.observedAt??first?.observedAt??''))?Date.parse(second?.observedAt??first!.observedAt):Date.now()),provider:provider.id,is_demo:provider.demo,is_experimental:provider.id==='local_chrome_preview',
    result_depth:task.query.depth,query_snapshot:task.query,parser_version:provider.id==='local_chrome_preview'?'firebase-pair-v2-context':'firebase-pair-v1',created_at:now(),cost_micros:actual};
  await store.db.runTransaction(async tx=>{
    const current=await tx.get(ref);if(current.data()?.lease!==lease||!['RUNNING','CANCELLED'].includes(current.data()!.state))return;
    const runRef=store.ref(org,'audits',task.run_id),run=await tx.get(runRef),r=run.data()!;
    const usageRef=store.ref(org,'monthly_usage',task.month),usage=await tx.get(usageRef),v=usage.data()!;
    const globalRef=store.db.doc('provider_budgets/'+task.month),global=await tx.get(globalRef),g=global.data()!;
    const ledgerRef=store.ref(org,'usage',task.run_id),ledger=await tx.get(ledgerRef),l=ledger.data()!;
    const finalStatus=r.cancel_requested?'CANCELLED':status;
    const finalPosition=finalStatus==='VERIFIED'?position:null;
    const finalIdentity=finalStatus==='VERIFIED'?identityMatch:null;
    const completed=r.completed_tasks+1,warnings=r.warning_tasks+Number(finalStatus!=='VERIFIED'),done=completed===r.config_snapshot.plannedTasks;
    const costUncertain=uncertain||l.cost_uncertain===true;
    const refundedUnits=Math.max(0,2-capturesAttempted);
    // A cancelled reservation with zero capture attempts is not a measurement.
    if(capturesAttempted>0)tx.create(store.ref(org,'measurements',taskId),{...observation,status:finalStatus,position:finalPosition,identity_match:finalIdentity,failure_reason:finalStatus==='VERIFIED'?null:reason??(r.cancel_requested?'AUDIT_CANCELLED':null)});
    tx.create(store.ref(org,'evidence',taskId),{query:task.query,first:first??null,second:second??null,
      decision:{status:finalStatus,position:finalPosition,identityMatch:finalIdentity,reason:reason??(r.cancel_requested?'AUDIT_CANCELLED':null)},observed_at:observation.observed_at,is_experimental:provider.id==='local_chrome_preview',cost_uncertain:uncertain});
    tx.update(ref,{state:'DONE',measurement_status:finalStatus,completed_at:now(),cost_micros:actual,cost_uncertain:uncertain});
    tx.update(runRef,{completed_tasks:completed,warning_tasks:warnings,actual_cost:r.actual_cost+actual,
      status:done?(r.cancel_requested?'CANCELLED':warnings?'COMPLETED_WITH_WARNINGS':'COMPLETED'):r.cancel_requested?'CANCELLING':'RUNNING',
      task_totals:{QUEUED:r.config_snapshot.plannedTasks-completed,DONE:completed},...(done?{completed_at:now()}:{})});
    tx.update(usageRef,{cost:v.cost+accounted,reserved:Math.max(0,v.reserved-task.reserved_cost),units:Math.max(0,v.units-refundedUnits)});
    tx.update(globalRef,{cost:g.cost+accounted,reserved:Math.max(0,g.reserved-task.reserved_cost)});
    tx.update(ledgerRef,{cost:(l.cost??0)+accounted,reserved:Math.max(0,l.reserved-task.reserved_cost),units:Math.max(0,l.units-refundedUnits),cost_uncertain:costUncertain,state:done?(costUncertain?'RECONCILIATION_REQUIRED':'SETTLED'):'RESERVED'});
    if(finalStatus==='VERIFIED'&&second){
      const seenCompetitors=new Set<string>();
      for(const competitor of second.items.filter(x=>!x.sponsored&&x.cid!==task.query.cid).slice(0,20)){
        const competitorId=digest({taskId,cid:competitor.cid,place:competitor.placeId});
        if(seenCompetitors.has(competitorId))continue;seenCompetitors.add(competitorId);
        tx.create(store.ref(org,'competitors',competitorId),{
          location_id:task.location_id,measurement_id:taskId,...competitor,observed_at:observation.observed_at,source:provider.id,
          retention_until:Timestamp.fromMillis(Date.now()+7*86400000),is_demo:provider.demo,is_experimental:provider.id==='local_chrome_preview'});
      }
    }
  });
}

// A request that might have reached a paid provider is never blindly retried.
// Expired leases are surfaced for reconciliation instead of duplicating costs.
export async function recoverStalledTasks(store:Store, org?:string){
  // Local collectors must never reconcile another tenant's tasks.
  const source = org ? store.col(org,'tasks') : store.db.collectionGroup('tasks');
  const stale=await source.where('state','==','RUNNING').where('started_at','<',Timestamp.fromMillis(Date.now()-15*60000)).limit(100).get();
  for(const snapshot of stale.docs){
    const scope=snapshot.ref.parent.parent!.id,lease=id();
    const task=await store.db.runTransaction<Doc|null>(async tx=>{
      const current=await tx.get(snapshot.ref),t=current.data();
      if(!t||t.state!=='RUNNING'||millis(t.started_at)>=Date.now()-15*60000)return null;
      if(t.provider!=='local_chrome_preview'||t.reserved_cost!==0){
        tx.update(snapshot.ref,{state:'RECONCILIATION_REQUIRED',failure:'INTERRUPTED_PROVIDER_REQUEST',updated_at:now()});
        return null;
      }
      // This known zero-cost local task can be closed without any provider call.
      tx.update(snapshot.ref,{state:'CANCELLED',lease,failure:'INTERRUPTED_LOCAL_CAPTURE',updated_at:now()});
      return t;
    });
    if(!task)continue;
    const run=await store.get(scope,'audits',task.run_id),checkpoint=await store.ref(scope,'capture_checkpoints',snapshot.id).get();
    await settleFirebaseTask(store,{id:task.provider,demo:run.is_demo===true},scope,snapshot.id,task,lease,{
      first:checkpoint.data()?.first,status:'ERROR',position:null,identityMatch:null,cost:0,uncertain:false,
      capturesAttempted:2,reason:'INTERRUPTED_LOCAL_CAPTURE'});
  }
}
