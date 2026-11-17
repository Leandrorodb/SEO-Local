import { randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { firebaseServices, Store } from './store.js';
import { LocalChromeCloudProvider } from './provider.js';
import { processFirebaseTask, recoverStalledTasks } from './worker.js';
import { localPreviewEnabled } from '../../packages/rank-providers/local-chrome-preview.js';
import {
  collectorDocumentPath, collectorIsAvailable,
  COLLECTOR_HEARTBEAT_INTERVAL_MS, LOCAL_PROVIDER_ID,
} from './collector-presence.js';

if (!localPreviewEnabled()) {
  throw new Error('LOCAL_COLLECTOR_NOT_AUTHORIZED: enable explicit local Chrome evaluation.');
}
const org = process.env.LRT_COLLECTOR_ORGANIZATION_ID?.trim();
if (!org) {
  throw new Error('LRT_COLLECTOR_ORGANIZATION_ID must explicitly identify one authorized organization.');
}
const { db } = firebaseServices();
const store = new Store(db);
const provider = new LocalChromeCloudProvider();
const once = process.argv.includes('--once');
const workerId = randomUUID();
const presence = db.doc(collectorDocumentPath(org));
let running = true;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

async function heartbeat() {
  await db.runTransaction(async tx => {
    const old = await tx.get(presence);
    const previous = old.data();
    if (previous?.worker_id && previous.worker_id !== workerId &&
      collectorIsAvailable(previous)) {
      throw new Error('A different collector is already active for this organization.');
    }
    tx.set(presence, {
      provider: LOCAL_PROVIDER_ID, mode: 'LOCAL_EXPERIMENTAL',
      state: 'ONLINE', worker_id: workerId, heartbeat_at: Timestamp.now(),
    }, { merge: true });
  });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { running = false; });
}

async function run() {
  // Presence is scoped to exactly one authorized organization.
  await heartbeat();
  heartbeatTimer = setInterval(() => {
    void heartbeat().catch(error => {
      console.error('[COLETOR] Heartbeat failed; stopping to avoid orphan tasks.', error);
      running = false;
    });
  }, COLLECTOR_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  console.log(`[COLETOR] Online: organization=${org}; mode=${once ? 'once' : 'continuous'}`);
  while (running) {
    try {
      // Never scan or mutate tasks owned by another organization.
      await recoverStalledTasks(store, org);
      const pending = await store.col(org, 'tasks')
        .where('state', '==', 'QUEUED').limit(5).get();
      for (const doc of pending.docs) {
        if (!running) break;
        // Do not process legacy tasks or work assigned to other providers.
        if (doc.data().provider !== LOCAL_PROVIDER_ID) continue;
        await processFirebaseTask(store, provider, org, doc.id);
        const outcome = await store.get(org, 'measurements', doc.id).catch(() => null);
        console.log(`[COLETOR] task=${doc.id}; status=${outcome?.status ?? 'PENDING'}; position=${outcome?.position ?? 'INCONCLUSIVE'}`);
      }
      if (once) break;
      if (pending.empty) await new Promise(resolve => setTimeout(resolve, 4000));
    } catch (error) {
      console.error('[COLETOR] Processing error:', error);
      if (once) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

try {
  await run();
} finally {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  try {
    await db.runTransaction(async tx => {
      const old = await tx.get(presence);
      if (old.data()?.worker_id === workerId) {
        tx.update(presence, { state: 'OFFLINE', heartbeat_at: Timestamp.now() });
      }
    });
  } catch (error) {
    console.error('[COLETOR] Could not mark offline; heartbeat will expire.', error);
  }
}
