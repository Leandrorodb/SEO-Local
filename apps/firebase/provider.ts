import { z } from 'zod';
import { requireThat } from '../../packages/domain/errors.js';
import type { RankQuery } from '../../packages/contracts/index.js';
import { parseMapsUrl } from '../../packages/domain/maps.js';
import { digest } from './store.js';
import { LocalChromePreviewProvider } from '../../packages/rank-providers/local-chrome-preview.js';

export const candidateSchema = z.object({ name: z.string().trim().min(1).max(240), address: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(240), category: z.string().max(240).optional(), lat: z.number().min(-85).max(85),
  lng: z.number().min(-180).max(180), cid: z.string().regex(/^\d{1,20}$/).nullable(), placeId: z.string().max(255).nullable() });
export type Candidate = z.infer<typeof candidateSchema>;
export type Capture = { observedAt: string; taskRef: string; depth: number; complete: boolean; costMicros: number;
  items: { name: string; cid: string | null; placeId: string | null; position: number; sponsored: boolean }[];
  evidence: { source: string; checkUrl?: string; responseHash: string } };
export interface CloudProvider {
  id: string; enabled: boolean; demo: boolean; maxCostMicros: number;
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
  const verified = first.taskRef !== second.taskRef && a && b && a.position === b.position && digest(a.prefix) === digest(b.prefix);
  return { status: verified ? 'VERIFIED' : 'REVIEW', position: verified ? a.position : null,
    identityMatch: verified ? query.cid ? 'cid:' + query.cid : 'place:' + query.placeId : null };
}
export class DataForSeoProvider implements CloudProvider {
  id = 'dataforseo';
  demo = false;
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
    const items = result.items.filter((x: any) => x.type === 'maps_search' || x.type === 'maps_paid_item').map((x: any) => ({
      name: String(x.title ?? ''), cid: x.cid ?? null, placeId: x.place_id ?? null,
      position: x.rank_group, sponsored: x.type === 'maps_paid_item' || x.is_paid === true,
    }));
    const observedAt = new Date(result.datetime).toISOString();
    return { observedAt, taskRef: task.id, depth: q.depth, complete: result.type === 'maps' && !result.spell,
      costMicros, items, evidence: { source: this.id, ...(typeof result.check_url==='string'?{checkUrl:result.check_url}:{}), responseHash } };
  }
}

export class LocalChromeCloudProvider implements CloudProvider {
  id = 'local_chrome_preview';
  demo = false;
  enabled: boolean;
  maxCostMicros = 0;
  private chrome = new LocalChromePreviewProvider();
  async dispose() { await this.chrome.dispose(); }

  constructor(private env: Record<string, string | undefined> = process.env) {
    this.enabled = env.RANK_PROVIDER === 'local_chrome_preview' &&
      env.LRT_LOCAL_EVAL === 'I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE';
  }

  async resolve(url: string): Promise<Candidate[]> {
    requireThat(this.enabled, 503, 'PROVIDER_UNAVAILABLE');
    const outcome = await this.chrome.resolveWithDiagnostics(url);
    if (!outcome.candidates.length) {
      if (outcome.status === 'MAPS_ACCESS_BLOCKED') requireThat(false, 502, 'MAPS_ACCESS_BLOCKED');
      if (outcome.status === 'MAPS_CONSENT_REQUIRED') requireThat(false, 502, 'MAPS_CONSENT_REQUIRED');
      if (outcome.status === 'MAPS_DETAILS_INCOMPLETE') requireThat(false, 422, 'MAPS_DETAILS_INCOMPLETE');
      if (outcome.status === 'MAPS_IDENTITY_MISMATCH') requireThat(false, 409, 'MAPS_IDENTITY_MISMATCH');
    }
    return outcome.candidates.map(x => candidateSchema.parse({
      name: x.name,
      address: x.address,
      city: x.city,
      category: x.category,
      lat: x.lat,
      lng: x.lng,
      cid: x.cid ?? null,
      placeId: x.placeId ?? null,
    }));
  }

  async measure(query: RankQuery, taskId: string): Promise<Capture> {
    requireThat(this.enabled, 503, 'PROVIDER_UNAVAILABLE');
    requireThat(query.surface === 'MAPS' && query.device === 'desktop', 422, 'UNSUPPORTED_SURFACE');
    const result = await this.chrome.measure(query, taskId);
    const complete = result.complete && !result.failure;
    const items = (result.items ?? []).map(x => ({
      name: x.name,
      cid: x.cid ?? null,
      placeId: x.placeId ?? null,
      position: x.position,
      sponsored: Boolean(x.sponsored),
    }));
    return {
      observedAt: result.observedAt,
      taskRef: result.taskRef,
      depth: result.depth,
      complete,
      costMicros: 0,
      items,
      evidence: {
        source: this.id,
        checkUrl: `https://www.google.com/maps/search/${encodeURIComponent(query.term)}/@${query.lat},${query.lng},15z?hl=pt-BR`,
        responseHash: digest({ items, taskRef: result.taskRef, complete }),
      },
    };
  }
}

export function getCloudProvider(env: Record<string, string | undefined> = process.env): CloudProvider {
  if (env.RANK_PROVIDER === 'local_chrome_preview') {
    return new LocalChromeCloudProvider(env);
  }
  return new DataForSeoProvider(env);
}
