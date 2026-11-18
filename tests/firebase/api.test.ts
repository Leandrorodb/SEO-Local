import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {getAuth,type Auth} from 'firebase-admin/auth';
import {buildFirebaseApp} from '../../apps/firebase/api.js';
import {Store} from '../../apps/firebase/store.js';
import {dispatchAudit,processFirebaseTask,recoverStalledTasks} from '../../apps/firebase/worker.js';
import type {CloudProvider,Capture} from '../../apps/firebase/provider.js';

test('Firebase emulator: cadastro -> termos -> auditoria -> 7º comprovado -> revisão -> PDF; isolamento e idempotência',{timeout:60000},async()=>{
  assert.equal(process.env.GCLOUD_PROJECT,'demo-seo-local','Test must only run against the dedicated demo project');
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST);
  process.env.NODE_ENV='test';process.env.RANK_GLOBAL_MONTHLY_BUDGET_MICROS='1000000';
  const app=initializeApp({projectId:'demo-seo-local'},'firebase-test-'+randomUUID()),db=getFirestore(app),auth=getAuth(app),store=new Store(db);
  const email='firebase-owner-'+randomUUID()+'@test.invalid',password=randomUUID()+'Aa9!';process.env.OWNER_EMAIL=email;
  const user=await auth.createUser({uid:randomUUID(),email,emailVerified:true,password});
  const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  assert.equal(response.status,200);const token=(await response.json() as any).idToken;
  let calls=0;
  const provider:CloudProvider={id:'SYNTHETIC_FIREBASE_TEST',demo:true,enabled:true,maxCostMicros:100,
    resolve:async url=>[{name:'Empresa de teste',address:'Rua de teste, 1',city:'Cidade de teste',lat:-21,lng:-45,cid:new URL(url).searchParams.get('cid'),placeId:null}],
    measure:async(q,key):Promise<Capture>=>{calls++;return {observedAt:new Date().toISOString(),taskRef:key,depth:20,complete:true,costMicros:80,evidence:{source:'SYNTHETIC_TEST',responseHash:key},
      items:Array.from({length:7},(_,i)=>({name:i===6?'Empresa de teste':'Concorrente '+i,cid:i===6?q.cid:String(i+1),placeId:null,position:i+1,sponsored:false}))};}};
  // Auth emulator verifies a genuine emulator-issued token. MFA is injected
  // exclusively in this test dependency because the emulator cannot enroll TOTP.
  const elevated={verifyIdToken:async(t:string,revoked:boolean)=>{const decoded=await auth.verifyIdToken(t,revoked);return {...decoded,firebase:{...decoded.firebase,sign_in_second_factor:'totp'}};}} as Auth;
  const api=buildFirebaseApp({store,auth:elevated,provider});
  let org='';const request=(method:any,url:string,body?:unknown,key=randomUUID())=>api.inject({method,url,headers:{authorization:'Bearer '+token,...(org?{'x-organization-id':org}:{}),'idempotency-key':key},...(body===undefined?{}:{payload:body as object})});
  try{
    const me=await request('GET','/v1/me/organizations');assert.equal(me.statusCode,200,me.body);org=me.json().data.organizations[0].id;
    await store.org(org).update({monthly_budget_micros:100000});
    const anonymous=await api.inject({method:'GET',url:'/v1/locations'});assert.equal(anonymous.statusCode,401);
    const forged=await api.inject({method:'GET',url:'/v1/me/organizations',headers:{authorization:'Bearer invalid'}});assert.equal(forged.statusCode,401);
    const denied=await api.inject({method:'GET',url:'/v1/locations',headers:{authorization:'Bearer '+token,'x-organization-id':randomUUID()}});assert.equal(denied.statusCode,403);
    const input={mapsUrl:'https://www.google.com/maps?cid=777',externalId:'777'};
    const saved=await request('POST','/v1/locations/register-confirmed',input);assert.equal(saved.statusCode,201,saved.body);const location=saved.json().data.location.id;
    const reused=await request('POST','/v1/locations/register-confirmed',input);assert.equal(reused.json().data.location.id,location);
    const suggestions=await request('POST',`/v1/locations/${location}/keywords:suggest`,{niche:'motopeças',limit:20});
    assert.equal(suggestions.statusCode,200,suggestions.body);
    assert.ok(suggestions.json().data.terms.every((t:any)=>t.query.includes('Cidade de teste')));
    assert.ok(suggestions.json().data.terms.some((t:any)=>t.query==='motopeças Cidade de teste'));
    const pasted=await request('POST',`/v1/locations/${location}/keywords:paste`,{content:'serviço confirmado de teste',preview:false});assert.equal(pasted.statusCode,200,pasted.body);
    assert.equal((await request('POST',`/v1/locations/${location}/keywords:activate-reviewed`,{confirmed:true})).statusCode,200);
    const grid=await request('POST',`/v1/locations/${location}/grids`,{mode:'single',spacingM:500});assert.equal(grid.statusCode,200,grid.body);
    const audit={gridId:grid.json().data.id,surface:'MAPS',maxProviderBudgetUsdMicros:200};
    const quote=await request('POST',`/v1/locations/${location}/audits`,{...audit,dryRun:true});assert.equal(quote.json().data.estimatedCostUsdMicros,200);assert.equal(calls,0);
    const deniedBudget=await request('POST',`/v1/locations/${location}/audits`,{...audit,maxProviderBudgetUsdMicros:199});assert.equal(deniedBudget.statusCode,422,deniedBudget.body);assert.equal(calls,0);
    const key=randomUUID();const[a,b]=await Promise.all([request('POST',`/v1/locations/${location}/audits`,audit,key),request('POST',`/v1/locations/${location}/audits`,audit,key)]);
    assert.equal(a.statusCode,201,a.body);assert.equal(b.statusCode,201,b.body);assert.equal(a.json().data.runId,b.json().data.runId);
    const runId=a.json().data.runId;await dispatchAudit(store,org,runId);const tasks=await store.list(org,'tasks');assert.equal(tasks.length,1);
    await processFirebaseTask(store,provider,org,tasks[0].id);await processFirebaseTask(store,provider,org,tasks[0].id);assert.equal(calls,2);
    const ranks=await request('GET',`/v1/locations/${location}/rankings`);assert.equal(ranks.statusCode,200,ranks.body);assert.equal(ranks.json().data.latest[0].position,7);assert.equal(ranks.json().data.latest[0].is_demo,true);
    const report=await request('POST',`/v1/locations/${location}/reports`,{runId});assert.equal(report.statusCode,200,report.body);const reportId=report.json().data.id;
    const blockedPdf=await request('GET',`/v1/reports/${reportId}/pdf`);assert.equal(blockedPdf.statusCode,409);
    assert.equal((await request('POST',`/v1/reports/${reportId}/review`,{})).statusCode,200);
    assert.equal((await request('POST',`/v1/reports/${reportId}/approve`,{})).statusCode,200);
    const pdf=await request('GET',`/v1/reports/${reportId}/pdf`);assert.equal(pdf.statusCode,200,pdf.body);assert.equal(pdf.rawPayload.subarray(0,5).toString(),'%PDF-');
    // Cancelling queued work never calls a provider and settles its reservation once.
    const cancelled=await request('POST',`/v1/locations/${location}/audits`,audit);
    assert.equal(cancelled.statusCode,201,cancelled.body);const cancelledId=cancelled.json().data.runId;
    assert.equal((await request('POST',`/v1/audits/${cancelledId}/cancel`,{reason:'Corrigir os termos antes de medir'})).statusCode,200);
    const cancelledTask=(await store.list(org,'tasks')).find(t=>t.run_id===cancelledId)!;
    await processFirebaseTask(store,provider,org,cancelledTask.id);await processFirebaseTask(store,provider,org,cancelledTask.id);
    assert.equal(calls,2);assert.equal((await store.get(org,'audits',cancelledId)).status,'CANCELLED');
    assert.equal((await store.ref(org,'measurements',cancelledTask.id).get()).exists,false);
    const cancelledLedger=await store.get(org,'usage',cancelledId);assert.equal(cancelledLedger.reserved,0);assert.equal(cancelledLedger.units,0);assert.equal(cancelledLedger.state,'SETTLED');
    // Cancellation after the first capture stops the independent second request.
    const between=await request('POST',`/v1/locations/${location}/audits`,audit);const betweenId=between.json().data.runId;
    const betweenTask=(await store.list(org,'tasks')).find(t=>t.run_id===betweenId)!;
    const cancelBetween:CloudProvider={...provider,measure:async(q,key)=>{const captured=await provider.measure(q,key);await request('POST',`/v1/audits/${betweenId}/cancel`,{reason:'Cancelar durante a primeira captura'});return captured;}};
    await processFirebaseTask(store,cancelBetween,org,betweenTask.id);
    assert.equal(calls,3);const interruptedEvidence=await store.get(org,'evidence',betweenTask.id);
    assert.ok(interruptedEvidence.first);assert.equal(interruptedEvidence.second,null);assert.equal(interruptedEvidence.decision.position,null);
    assert.equal((await store.get(org,'audits',betweenId)).status,'CANCELLED');
    assert.equal((await store.get(org,'usage',betweenId)).units,1);
    // A stale, known-free local capture is closed without fabricating a position or retrying Chrome.
    const freeApi=buildFirebaseApp({store,auth:elevated,provider:{...provider,id:'local_chrome_preview',maxCostMicros:0}});
    try {
      const free=await freeApi.inject({method:'POST',url:`/v1/locations/${location}/audits`,headers:{authorization:'Bearer '+token,'x-organization-id':org,'idempotency-key':randomUUID()},payload:{...audit,maxProviderBudgetUsdMicros:0}});
      assert.equal(free.statusCode,201,free.body);const freeId=free.json().data.runId;
      const stale=(await store.list(org,'tasks')).find(t=>t.run_id===freeId)!;
      await store.ref(org,'tasks',stale.id).update({state:'RUNNING',lease:'interrupted-test',started_at:Timestamp.fromMillis(Date.now()-20*60000)});
      await recoverStalledTasks(store,org);await recoverStalledTasks(store,org);
      assert.equal(calls,3);const closed=await store.get(org,'measurements',stale.id);assert.equal(closed.status,'ERROR');assert.equal(closed.position,null);assert.equal(closed.failure_reason,'INTERRUPTED_LOCAL_CAPTURE');
      assert.equal((await store.get(org,'audits',freeId)).status,'COMPLETED_WITH_WARNINGS');
      assert.equal((await store.get(org,'usage',freeId)).state,'SETTLED');
    } finally {await freeApi.close();}
    const ordinary=buildFirebaseApp({store,auth,provider});
    const previousMfaPolicy=process.env.REQUIRE_MFA_FOR_OPERATIONAL_WRITES;
    try {
      delete process.env.REQUIRE_MFA_FOR_OPERATIONAL_WRITES;
      const headers={authorization:'Bearer '+token,'x-organization-id':org};
      const noMfa=await ordinary.inject({method:'POST',url:'/v1/brands',headers,payload:{name:'Negado'}});assert.equal(noMfa.statusCode,403,noMfa.body);
      process.env.REQUIRE_MFA_FOR_OPERATIONAL_WRITES='false';
      const operational=await ordinary.inject({method:'POST',url:'/v1/brands',headers,payload:{name:'Operação permitida com Google'}});assert.equal(operational.statusCode,200,operational.body);
      const team=await ordinary.inject({method:'POST',url:'/v1/team',headers,payload:{userId:'another-user',role:'analyst',locationIds:[]}});assert.equal(team.statusCode,403,team.body);assert.equal(team.json().error.code,'MFA_REQUIRED');
    } finally {
      if(previousMfaPolicy===undefined)delete process.env.REQUIRE_MFA_FOR_OPERATIONAL_WRITES;else process.env.REQUIRE_MFA_FOR_OPERATIONAL_WRITES=previousMfaPolicy;
      await ordinary.close();
    }
    // Browser clients cannot change immutable measurements or their roles.
    const direct=await fetch('http://'+process.env.FIRESTORE_EMULATOR_HOST+'/v1/projects/demo-seo-local/databases/(default)/documents/organizations/'+org+'/measurements/'+tasks[0].id,{method:'PATCH',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({fields:{position:{integerValue:'1'}}})});assert.equal(direct.status,403);
    console.log('Synthetic Firebase flow verified: real Auth + Firestore emulators; two fixture captures; rank 7; PDF; no paid request.');
  }finally{await api.close();await auth.deleteUser(user.uid);await db.terminate();}
});
