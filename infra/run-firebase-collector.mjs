import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const loadPrivate = name => JSON.parse(readFileSync(new URL('../../../work/'+name, import.meta.url),'utf8'));
let credential;
try { credential = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : loadPrivate('seo-local-collector-private.json'); }
catch { throw new Error('Credencial privada do coletor não encontrada. Configure FIREBASE_SERVICE_ACCOUNT localmente; nunca publique a chave no Git.'); }
if (credential.project_id !== 'seo-local-64b17' || credential.client_email !== 'seo-local-collector@seo-local-64b17.iam.gserviceaccount.com') {
  throw new Error('O coletor exige a identidade privada dedicada ao projeto SEO Local.');
}
let org=process.env.LRT_COLLECTOR_ORGANIZATION_ID;
if(!org){
  let owner;
  try { owner=loadPrivate('render-owner-private.json'); } catch { throw new Error('Informe LRT_COLLECTOR_ORGANIZATION_ID da organização autorizada.'); }
  if(typeof owner.uid!=='string'||!owner.uid)throw new Error('Identidade proprietária local inválida.');
  org=createHash('sha256').update(JSON.stringify({owner:owner.uid})).digest('hex').slice(0,32);
}
process.env.FIREBASE_SERVICE_ACCOUNT=JSON.stringify(credential);
process.env.GCLOUD_PROJECT='seo-local-64b17';
process.env.LRT_COLLECTOR_ORGANIZATION_ID=org;
process.env.NODE_ENV='development';
process.env.RANK_PROVIDER='local_chrome_preview';
process.env.LRT_LOCAL_EVAL='I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE';
if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST||process.env.DATABASE_URL){
  throw new Error('Remova as variáveis de emuladores e DATABASE_URL antes de iniciar o coletor deste projeto.');
}
await import('../apps/firebase/collector-runner.ts');
