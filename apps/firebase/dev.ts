import { firebaseServices, Store } from './store.js';
import { buildFirebaseApp } from './api.js';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw Error('Local server requires Firestore and Auth emulators; refusing an accidental production write.');
}
const {db,auth}=firebaseServices();
const app=buildFirebaseApp({store:new Store(db),auth,logging:true});
await app.listen({host:'127.0.0.1',port:Number(process.env.PORT||4178)});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
