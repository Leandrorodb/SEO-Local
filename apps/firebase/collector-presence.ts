/**
 * Firestore presence contract for the single-organization experimental Chrome worker.
 * A heartbeat is an availability signal, NOT evidence that a ranking was measured.
 * It never grants access; Firebase Admin credentials must remain on the server/worker.
 */
export const LOCAL_PROVIDER_ID = 'local_chrome_preview';
export const COLLECTOR_HEARTBEAT_TTL_MS = 90_000;
export const COLLECTOR_HEARTBEAT_INTERVAL_MS = 20_000;

type TimestampLike = { toMillis(): number };
export type CollectorPresence = {
  provider?: unknown;
  mode?: unknown;
  state?: unknown;
  heartbeat_at?: TimestampLike | null;
};

export function collectorIsAvailable(
  data: CollectorPresence | undefined | null,
  atMs = Date.now(),
): boolean {
  if (!data || data.provider !== LOCAL_PROVIDER_ID ||
      data.mode !== 'LOCAL_EXPERIMENTAL' || data.state !== 'ONLINE') return false;
  const heartbeat = data.heartbeat_at?.toMillis?.();
  return typeof heartbeat === 'number' && Number.isFinite(heartbeat) &&
    heartbeat <= atMs + 10_000 && atMs - heartbeat <= COLLECTOR_HEARTBEAT_TTL_MS;
}

export function collectorDocumentPath(org: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(org)) {
    throw new Error('INVALID_COLLECTOR_ORGANIZATION_ID');
  }
  return `organizations/${org}/collector_state/${LOCAL_PROVIDER_ID}`;
}

export async function isLocalCollectorOnline(
  db: { doc(path: string): { get(): Promise<{ data(): CollectorPresence | undefined }> } },
  org: string,
  atMs = Date.now(),
): Promise<boolean> {
  const snap = await db.doc(collectorDocumentPath(org)).get();
  return collectorIsAvailable(snap.data(), atMs);
}
