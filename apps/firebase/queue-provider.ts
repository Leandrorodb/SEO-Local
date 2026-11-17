import { AppError } from '../../packages/domain/errors.js';
import type { CloudProvider, Candidate, Capture } from './provider.js';
import type { RankQuery } from '../../packages/contracts/index.js';
import { isLocalCollectorOnline, LOCAL_PROVIDER_ID } from './collector-presence.js';

/**
 * Queue-only adapter for a cloud API. The API NEVER launches Chrome.
 * Real observations are produced by the separately authorized local collector.
 * A recent heartbeat is required before offering or creating a new audit.
 */
export class LocalCollectorQueueProvider implements CloudProvider {
  readonly id = LOCAL_PROVIDER_ID;
  readonly enabled = true;
  readonly demo = false; // Real observations, but still LOCAL_EXPERIMENTAL (not commercial).
  readonly maxCostMicros = 0;

  async resolve(_url: string): Promise<Candidate[]> {
    throw new AppError(503, 'LOCAL_COLLECTOR_RESOLVE_NOT_AVAILABLE');
  }

  async measure(_query: RankQuery, _taskId: string): Promise<Capture> {
    throw new AppError(503, 'LOCAL_COLLECTOR_RUNS_ON_WORKER_ONLY');
  }
}

type PresenceDatabase = Parameters<typeof isLocalCollectorOnline>[0];

/** Returns null when no local worker is authorized and actively heartbeating. */
export async function localQueueProvider(
  db: PresenceDatabase,
  org: string,
  env: Record<string, string | undefined> = process.env,
): Promise<CloudProvider | null> {
  if (env.RANK_QUEUE_MODE !== 'local_collector') return null;
  if (!await isLocalCollectorOnline(db, org)) return null;
  return new LocalCollectorQueueProvider();
}
