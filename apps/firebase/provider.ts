import { z } from 'zod';
import { requireThat } from '../../packages/domain/errors.js';
import type { RankQuery } from '../../packages/contracts/index.js';
import { parseMapsUrl } from '../../packages/domain/maps.js';
import { digest } from './store.js';

export const candidateSchema = z.object({ name: z.string().trim().min(1).max(240), address: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(240), category: z.string().max(240).optional(), lat: z.number().min(-85).max(85),
  lng: z.number().min(-180).max(180), cid: z.string().regex(/^\d{1,20}$/).nullable(), placeId: z.string().max(255).nullable() });
export type Candidate = z.infer<typeof candidateSchema>;
export type Capture = { observedAt: string; taskRef: string; depth: number; complete: boolean; costMicros: number;
  items: { name: string; cid: string | null; placeId: string | null; position: number; sponsored: boolean }[];
  evidence: { source: string; checkUrl?: string; responseHash: string } };
export interface CloudProvider {
  id: string; enabled: boolean; maxCostMicros: number;
  resolve(url: string): Promise<Candidate[]>;
  measure(query: RankQuery, taskId: string): Promise<Capture>;
}
// Results without a complete organic prefix cannot become a numeric rank.
// CID/Place ID and normalized business name must agree in TWO separate captures.
export function verifyPair(query: RankQuery, first: Capture, second: Capture) {
  const clean = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  function check(capture: Capture) {
    requireThat(Number.isFinite(Date.parse(capture.observedAt)) && Date.parse(capture.observedAt) <= Date.now() + 60000, 502, 'INVALID_OBSERVATION_DATE');
    const items = capture.items.filter(x => !x.sponsored).sort((a, b) => a.position - b.position);
    const hits = items.filter(x => (query.cid && x.cid === query.cid) || (query.placeId && x.placeId === query.placeId));
    if (hits.length !== 1 || !capture.complete || !query.expectedName) return null;
    const hit = hits[0];
    if ((query.cid && hit.cid && query.cid !== hit.cid) || (query.placeId && hit.placeId && query.placeId !== hit.placeId) || clean(hit.name) !== clean(query.expectedName)) return null;
    if (!Number.isInteger(hit.position) || hit.position < 1 || hit.position > query.depth) return null;
    const prefix = items.filter(x => x.position <= hit.position);
    if (prefix.length !== hit.position || prefix.some((x, i) => x.position !== i + 1 || !(x.cid || x.placeId))) return null;
    if (new Set(prefix.map(x => x.cid ? 'cid:' + x.cid : 'place:' + x.placeId)).size !== prefix.length) return null;
    return { position: hit.position, prefix: prefix.map(x => ({ cid: x.cid, placeId: x.placeId, name: clean(x.name) })) };
  }
  const a = check(first), b = check(second);
  const verified = a && b && a.position === b.position && digest(a.prefix) === digest(b.prefix);
  return { status: verified ? 'VERIFIED' : 'REVIEW', position: verified ? a.position : null,
    identityMatch: verified ? query.cid ? 'cid:' + query.cid : 'place:' + query.placeId : null };
}
export class DataForSeoProvider implements CloudProvider {
  id = 'dataforseo';
  enabled: boolean;
  // Two independent live captures per point; estimate configured explicitly by
  // the operator from their provider contract, never a hard-coded price promise.
  maxCostMicros: number;
  constructor(private env: Record<string, string | undefined> = process.env) {
    this.maxCostMicros = Number(env.RANK_MAX_COST_MICROS_PER_CAPTURE || 0);
    this.enabled = env.RANK_PROVIDER === 'dataforseo' && !!env.DATAFORSEO_LOGIN && !!env.DATAFORSEO_PASSWORD &&
      Number.isSafeInteger(this.maxCostMicros) && this.maxCostMicros > 0 && env.RANK_PROVIDER_AUTHORIZED === 'true';
  }
  private async call(path: string, body: unknown) {
    requireThat(this.enabled, 503, 'PROVIDER_UNAVAILABLE');
    const response = await fetch('https://api.dataforseo.com/v3/' + path, { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(this.env.DATAFORSEO_LOGIN + ':' + this.env.DATAFORSEO_PASSWORD).toString('base64') }, body: JSON.stringify([body]) });
    requireThat(response.ok, 502, 'PROVIDER_HTTP_ERROR');
    const payload = await response.json() as any;
    const task = payload.tasks?.[0];
    requireThat(payload.status_code === 20000 && task?.status_code === 20000 && task.result?.length === 1, 502, 'PROVIDER_TASK_ERROR');
    const costMicros = Math.ceil(Number(task.cost ?? payload.cost) * 1e6);
    requireThat(Number.isSafeInteger(costMicros) && costMicros >= 0, 502, 'INVALID_PROVIDER_COST');
    return { task, result: task.result[0], costMicros, responseHash: digest(payload) };
  }
  async resolve(url: string) {
    const parsed = parseMapsUrl(url);
    requireThat(parsed.cid || parsed.placeId, 422, 'MISSING_STABLE_ID');
    const { result } = await this.call('business_data/google/my_business_info/live', {
      keyword: parsed.cid ? 'cid:' + parsed.cid : 'place_id:' + parsed.placeId,
      language_code: 'pt', location_code: 2076,
    });
    return (result.items ?? []).filter((x: any) => x.type === 'google_business_info' || x.type === 'business_info')
      .map((x: any) => candidateSchema.parse({ name: x.title, address: x.address, city: x.address_info?.city,
        category: x.category ?? undefined, lat: x.latitude, lng: x.longitude, cid: x.cid ?? null, placeId: x.place_id ?? null }));
  }
  async measure(q: RankQuery, taskId: string): Promise<Capture> {
    requireThat(q.surface === 'MAPS' && q.device === 'desktop', 422, 'UNSUPPORTED_SURFACE');
    const { task, result, costMicros, responseHash } = await this.call('serp/google/maps/live/advanced', {
      keyword: q.term.replace(/%/g, '%25').replace(/\+/g, '%2B'), language_code: q.language.split('-')[0],
      location_coordinate: `${q.lat},${q.lng},15z`, depth: q.depth, device: q.device, tag: taskId,
    });
    requireThat(Array.isArray(result.items), 502, 'INVALID_PROVIDER_RESULT');
    const items = result.items.filter((x: any) => x.type === 'maps_search' || x.type === 'paid').map((x: any) => ({
      name: String(x.title ?? ''), cid: x.cid ?? null, placeId: x.place_id ?? null,
      position: x.rank_group, sponsored: x.type === 'paid' || x.is_paid === true,
    }));
    const observedAt = new Date(result.datetime).toISOString();
    return { observedAt, taskRef: task.id, depth: q.depth, complete: result.type === 'maps' && !result.spell,
      costMicros, items, evidence: { source: this.id, checkUrl: result.check_url, responseHash } };
  }
}
