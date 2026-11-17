import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { firebaseServices, Store } from './store.js';
import { buildFirebaseApp } from './api.js';
import { DataForSeoProvider } from './provider.js';
import { dispatchAudit, processFirebaseTask, recoverStalledTasks } from './worker.js';

setGlobalOptions({ region:'southamerica-east1',maxInstances:2,memory:'512MiB',timeoutSeconds:300 });
const secrets = process.env.RANK_PROVIDER === 'dataforseo' ? ['DATAFORSEO_LOGIN','DATAFORSEO_PASSWORD'] : [];
let runtime:ReturnType<typeof buildFirebaseApp>|null=null;
const services=()=>{const {db,auth}=firebaseServices();return {store:new Store(db),auth,provider:new DataForSeoProvider()};};
export const api=onRequest({secrets,cors:false},async(req,res)=>{
  if(!runtime){const s=services();runtime=buildFirebaseApp({...s,logging:true});await runtime.ready();}
  runtime.server.emit('request',req,res);
});
export const dispatchRankingAudit=onDocumentCreated({document:'organizations/{org}/audits/{run}',retry:true},async event=>{
  await dispatchAudit(services().store,event.params.org,event.params.run);
});
export const measureRankingPoint=onDocumentCreated({document:'organizations/{org}/tasks/{task}',secrets,retry:false,concurrency:1,timeoutSeconds:300},async event=>{
  const s=services();await processFirebaseTask(s.store,s.provider,event.params.org,event.params.task);
});
export const reconcileRankingTasks=onSchedule('every 15 minutes',async()=>{await recoverStalledTasks(services().store);});
