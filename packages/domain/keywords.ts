import { gptPayload } from '../contracts/index.js';
import { requireThat } from './errors.js';
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
export function parsePaste(content: string, locationId: string, brand: string) {
  requireThat(content.length <= 100000, 413, 'PASTE_TOO_LARGE');
  let payload;
  if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      payload = gptPayload.parse(JSON.parse(content));
    } catch {
      requireThat(false, 422, 'INVALID_GPT_JSON');
    }
  } else {
    const clusters: {
      name: string;
      intent: 'commercial';
      terms: { keyword: string; kind: 'commercial'; priority: 'medium' }[];
    }[] = [];
    let cluster = {
      name: 'Geral',
      intent: 'commercial' as const,
      terms: [] as { keyword: string; kind: 'commercial'; priority: 'medium' }[],
    };
    clusters.push(cluster);
    for (const line of content
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)) {
      if (line.startsWith('#')) {
        cluster = { name: line.replace(/^#+\s*/, ''), intent: 'commercial', terms: [] };
        clusters.push(cluster);
      } else
        cluster.terms.push({
          keyword: line.replace(/^[-*•]\s+/, ''),
          kind: 'commercial',
          priority: 'medium',
        });
    }
    payload = gptPayload.parse({
      schemaVersion: '1.0',
      locationRef: locationId,
      language: 'pt-BR',
      clusters: clusters.filter((x) => x.terms.length),
    });
  }
  requireThat(payload.locationRef === locationId, 422, 'LOCATION_REF_MISMATCH');
  const seen = new Set<string>();
  let duplicates = 0;
  const terms = [];
  const brandKey = normalize(brand);
  for (const cluster of payload.clusters)
    for (const t of cluster.terms) {
      const key = normalize(t.keyword);
      requireThat(
        !/[<>\u0000-\u001f]/.test(t.keyword) &&
          !/(ignore (all|previous)|system prompt|ignore as instru|execute|drop table|<script)/i.test(
            t.keyword,
          ),
        422,
        'INVALID_KEYWORD_CONTENT',
      );
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      terms.push({
        term: t.keyword,
        normalizedKey: key,
        cluster: cluster.name,
        clusterKey: normalize(cluster.name),
        intent: cluster.intent,
        kind:
          t.kind === 'brand' || (brandKey.length > 3 && key.includes(brandKey))
            ? 'BRAND'
            : 'COMMERCIAL',
        priority: t.priority,
        language: payload.language,
      });
    }
  requireThat(terms.length > 0 && terms.length <= 500, 422, 'KEYWORD_COUNT_LIMIT');
  return { terms, duplicates };
}
