import { LocalChromePreviewProvider, localPreviewEnabled } from './local-chrome-preview.js';
import type { RankQuery } from '../contracts/index.js';
import { AppError, requireThat } from '../domain/errors.js';
export type ProviderResult = {
  observedAt: string;
  taskRef: string;
  depth: number;
  complete: boolean;
  costMicros: number;
  items: { cid?: string; placeId?: string; name: string; position: number; sponsored?: boolean }[];
  failure?: 'ERROR' | 'BLOCKED' | 'PROVIDER_UNAVAILABLE' | 'UNSUPPORTED_SURFACE';
};
export interface RankProvider {
  id: string;
  demo: boolean;
  supports(surface: RankQuery['surface']): boolean;
  quote(query: RankQuery): Promise<{ maxCostMicros: number; depth: number }>;
  measure(query: RankQuery, idempotencyKey: string): Promise<ProviderResult>;
  resolveWithDiagnostics?(url: string): Promise<{
    status: string;
    missing?: string[];
    partial?: { name?: string; city?: string; address?: string; category?: string; lat?: number; lng?: number };
    candidates: {
      name: string; address: string; city: string; category?: string;
      lat: number; lng: number; cid: string | null; placeId: string | null;
    }[];
  }>;
  resolve?(url: string): Promise<
    {
      name: string;
      address: string;
      city: string;
      category?: string;
      lat: number;
      lng: number;
      cid: string | null;
      placeId: string | null;
    }[]
  >;
}
export class DisabledProvider implements RankProvider {
  id = 'disabled';
  demo = false;
  supports() {
    return false;
  }
  async quote(): Promise<never> {
    throw new AppError(503, 'PROVIDER_UNAVAILABLE');
  }
  async measure(): Promise<never> {
    throw new AppError(503, 'PROVIDER_UNAVAILABLE');
  }
}
export function productionProvider(): RankProvider {
  if (process.env.RANK_PROVIDER === 'local_chrome_preview') {
    if (!localPreviewEnabled()) throw Error('Local Chrome preview requires explicit local-only testing configuration');
    return new LocalChromePreviewProvider();
  }
  if (process.env.RANK_PROVIDER && process.env.RANK_PROVIDER !== 'disabled')
    throw Error('No commercially authorized adapter is installed');
  return new DisabledProvider();
}
export function normalizeResult(q: RankQuery, r: ProviderResult) {
  requireThat(
    Number.isInteger(r.depth) &&
      r.depth >= 0 &&
      r.depth <= q.depth &&
      Number.isSafeInteger(r.costMicros) &&
      r.costMicros >= 0 &&
      r.taskRef &&
      Number.isFinite(Date.parse(r.observedAt)) &&
      Date.parse(r.observedAt) <= Date.now() + 60000,
    502,
    'INVALID_PROVIDER_RESULT',
  );
  if (r.failure) return { status: r.failure, position: null, identityMatch: null };
  const items = r.items.filter((x) => !x.sponsored);
  requireThat(
    items.every((x) => Number.isInteger(x.position) && x.position > 0 && x.position <= r.depth),
    502,
    'INVALID_PROVIDER_POSITION',
  );
  requireThat(
    new Set(items.map((x) => x.position)).size === items.length,
    502,
    'DUPLICATE_PROVIDER_POSITION',
  );
  const matches = items.filter(
    (x) => (q.cid && x.cid === q.cid) || (q.placeId && x.placeId === q.placeId),
  );
  if (matches.length !== 1)
    return {
      status:
        matches.length > 1 || items.some((x) => !(q.cid && x.cid) && !(q.placeId && x.placeId))
          ? 'REVIEW'
          : r.complete
            ? 'NO_MATCH_WITHIN_DEPTH'
            : 'PARTIAL_RESULTS',
      position: null,
      identityMatch: null,
    };
  const hit = matches[0];
  if (
    (q.cid && hit.cid && q.cid !== hit.cid) ||
    (q.placeId && hit.placeId && q.placeId !== hit.placeId)
  )
    return { status: 'REVIEW', position: null, identityMatch: null };
  if (!r.complete) return { status: 'PARTIAL_RESULTS', position: null, identityMatch: null };
  return {
    status: 'VERIFIED',
    position: hit.position,
    identityMatch: q.cid && hit.cid === q.cid ? 'cid:' + hit.cid : 'place:' + hit.placeId,
  };
}
