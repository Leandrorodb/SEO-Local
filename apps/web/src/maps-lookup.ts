import { api } from './session';

export type MapsLookupResult<Candidate> = {
  status: string;
  requestId?: string;
  candidates: Candidate[];
  missing?: string[];
  partial?: Record<string, string | number | undefined>;
};

/**
 * The hosted API cannot launch a local Chrome. It writes a tenant-scoped
 * resolution job and the browser polls for results written by the local agent.
 * A timeout is inconclusive; it never fabricates business identity data.
 */
export async function lookupMapsWithCollector<Candidate>(
  org: string,
  mapsUrl: string,
): Promise<MapsLookupResult<Candidate>> {
  let result = await api<MapsLookupResult<Candidate>>(
    '/locations/resolve', org, { mapsUrl },
  );
  if (result.status !== 'QUEUED' || !result.requestId) return result;

  const requestId = result.requestId;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    result = await api<MapsLookupResult<Candidate>>(
      '/locations/resolve/' + encodeURIComponent(requestId), org,
    );
    if (result.status !== 'QUEUED') return { ...result, requestId };
  }
  return { status: 'MAPS_LOOKUP_TIMEOUT', requestId, candidates: [],
    missing: ['O coletor não respondeu. Nenhuma identidade foi confirmada.'] };
}
