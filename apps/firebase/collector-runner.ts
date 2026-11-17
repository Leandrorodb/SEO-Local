import { firebaseServices, Store } from './store.js';
import { LocalChromeCloudProvider } from './provider.js';
import { processFirebaseTask, recoverStalledTasks } from './worker.js';
import { localPreviewEnabled } from '../../packages/rank-providers/local-chrome-preview.js';

if (!localPreviewEnabled()) {
  console.error(`
[ERRO] O coletor local do Chrome exige:
  RANK_PROVIDER=local_chrome_preview
  LRT_LOCAL_EVAL=I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE
  NODE_ENV=development (ou staging)
`);
  process.exit(1);
}

const { db } = firebaseServices();
const store = new Store(db);
const provider = new LocalChromeCloudProvider();
const once = process.argv.includes('--once');

console.log(`[COLETOR CHROME] Iniciado. Modo: ${once ? 'passo único (--once)' : 'contínuo'}. Provedor: ${provider.id} (ativo: ${provider.enabled})`);

let running = true;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[COLETOR] Encerrando por sinal ${sig}...`);
    running = false;
  });
}

async function loop() {
  while (running) {
    try {
      // Reconciliar tarefas presas há mais de 15 minutos
      await recoverStalledTasks(store).catch(() => {});

      const pending = await db.collectionGroup('tasks')
        .where('state', '==', 'QUEUED')
        .limit(5)
        .get();

      if (pending.empty) {
        if (once) {
          console.log('[COLETOR] Nenhuma tarefa na fila.');
          break;
        }
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      console.log(`[COLETOR] Encontradas ${pending.size} tarefa(s) na fila.`);
      for (const doc of pending.docs) {
        if (!running) break;
        const org = doc.ref.parent.parent!.id;
        const taskId = doc.id;
        console.log(`[COLETOR] Executando medição: org=${org}, task=${taskId}...`);
        await processFirebaseTask(store, provider, org, taskId);
        const measurement = await store.get(org, 'measurements', taskId).catch(() => null);
        console.log(`[COLETOR] Tarefa ${taskId} concluída. Status: ${measurement?.status ?? 'DESCONHECIDO'}, Posição: ${measurement?.position ?? 'N/A'}`);
      }

      if (once) break;
    } catch (err) {
      console.error('[COLETOR] Erro no loop de coleta:', err);
      if (once) break;
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  console.log('[COLETOR] Finalizado.');
}

await loop();
