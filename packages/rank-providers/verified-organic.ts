/**
 * Proof-first verification of Google Maps organic ranking observations.
 * A position is not a guess: the full visible prefix must be stable and the
 * exact business identity must be found twice in the same organic ordinal.
 * This source is an experimental browser preview, not a licensed ranking feed.
 */
export type ObservedCard = {
  name: string;
  url: string;
  detail: string;
  sponsored: boolean;
};

export function normalizeListingName(name: string) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function cidFromResultUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/(^|\.)google\.com(\.br)?$/.test(url.hostname) || url.protocol !== 'https:') return null;
    const cid = url.searchParams.get('cid');
    if (cid && /^\d{1,20}$/.test(cid)) {
      const id = BigInt(cid);
      return id > 0n && id <= 18446744073709551615n ? id.toString() : null;
    }
    const match = decodeURIComponent(url.pathname).match(/:0x([a-fA-F0-9]+)(?:!|\/|$)/);
    if (!match) return null;
    const id = BigInt('0x' + match[1]);
    return id > 0n && id <= 18446744073709551615n ? id.toString() : null;
  } catch { return null; }
}

export function organicKey(card: ObservedCard): string | null {
  try {
    const url = new URL(card.url);
    if (!/(^|\.)google\.com(\.br)?$/.test(url.hostname) || url.protocol !== 'https:' ||
      !url.pathname.startsWith('/maps/place/')) return null;
    const cid = cidFromResultUrl(card.url);
    if (cid) return 'cid:' + cid;
    // A place path may maintain continuity, but never proves company identity.
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '');
    if (pathname.length < 15) return null;
    return 'path:' + pathname;
  } catch { return null; }
}

export type VerifiedList = {
  organic: ObservedCard[];
  visual: ObservedCard[];
  targetIndex: number;       // zero-based organic position, without ads
  visualTargetIndex: number; // zero-based visual position, with ads
  consecutive: boolean;
  reason: 'OK' | 'EMPTY_FIRST_PAGE' | 'MISSING_IDENTITY' | 'DISCONTINUITY' |
    'REORDERED' | 'AMBIGUOUS_CARD' | 'AMBIGUOUS_TARGET';
};

/**
 * Append only when each scrolling snapshot overlaps the previous one and
 * inserts new cards strictly AFTER the previously observed cards.
 * The caller MUST separately prove that the first snapshot began at top=0
 * and that no DOM card was skipped by the extractor.
 */
export function stitchOrganicSnapshots(
  snapshots: ObservedCard[][],
  targetCid: string | null,
  expectedName?: string,
  depth = 20,
): VerifiedList {
  const invalid: VerifiedList = {
    organic: [], visual: [], targetIndex: -1, visualTargetIndex: -1,
    consecutive: false, reason: 'EMPTY_FIRST_PAGE',
  };
  if (!snapshots[0]?.length) return invalid;
  const seen = new Map<string, ObservedCard>();
  let previous: string[] = [];
  let reason: VerifiedList['reason'] = 'OK';
  for (const [index, snapshot] of snapshots.entries()) {
    const keys: string[] = [];
    for (const card of snapshot) {
      const key = organicKey(card);
      if (!key || !normalizeListingName(card.name) || keys.includes(key)) {
        reason = 'AMBIGUOUS_CARD'; break;
      }
      keys.push(key);
      const prior = seen.get(key);
      if (prior && (normalizeListingName(prior.name) !== normalizeListingName(card.name) ||
          prior.sponsored !== card.sponsored)) {
        reason = 'AMBIGUOUS_CARD'; break;
      }
      if (!prior) seen.set(key, card);
    }
    if (reason !== 'OK') break;
    if (index > 0) {
      const shared = keys.filter((key) => previous.includes(key));
      const added = keys.filter((key) => !previous.includes(key));
      // A single overlapping card is insufficient evidence that a virtualized
      // list did not drop multiple intervening rows during the scroll.
      const requiredOverlap = Math.min(2, previous.length, keys.length);
      if (added.length && shared.length < requiredOverlap) {
        reason = 'DISCONTINUITY'; break;
      }
      // Repeated cards must preserve their original order, not merely overlap.
      const order = [...seen.keys()];
      const oldPositions = keys.filter((key) => previous.includes(key))
        .map((key) => order.indexOf(key));
      if (oldPositions.some((position, i) => i > 0 && position <= oldPositions[i - 1])) {
        reason = 'REORDERED'; break;
      }
      // No card may be inserted before an already witnessed predecessor.
      const firstNew = keys.findIndex((key) => !previous.includes(key));
      const lastOld = keys.map((key, i) => previous.includes(key) ? i : -1)
        .reduce((max, i) => Math.max(max, i), -1);
      if (firstNew !== -1 && firstNew < lastOld) {
        reason = 'REORDERED'; break;
      }
    }
    previous = keys;
    if ([...seen.values()].filter((card) => !card.sponsored).length >= depth) break;
  }
  const all = [...seen.values()];
  const visualLimit = (() => {
    let organics = 0;
    for (let i = 0; i < all.length; i++) {
      if (!all[i].sponsored) organics++;
      if (organics >= depth) return i + 1;
    }
    return all.length;
  })();
  const visual = all.slice(0, visualLimit);
  const organic = visual.filter((card) => !card.sponsored);
  let targetIndex = -1;
  let visualTargetIndex = -1;
  if (targetCid) {
    const candidates = visual.map((card, i) => ({ card, i }))
      .filter(({ card }) => cidFromResultUrl(card.url) === targetCid);
    if (candidates.length > 1 || (candidates.length === 1 && candidates[0].card.sponsored))
      reason = 'AMBIGUOUS_TARGET';
    else if (candidates.length === 1) {
      if (!expectedName || normalizeListingName(candidates[0].card.name) !== normalizeListingName(expectedName))
        reason = 'MISSING_IDENTITY';
      else {
        visualTargetIndex = candidates[0].i;
        targetIndex = visual.slice(0, visualTargetIndex + 1).filter((card) => !card.sponsored).length - 1;
      }
    }
  }
  if (reason !== 'OK') { targetIndex = -1; visualTargetIndex = -1; }
  return { organic, visual, targetIndex, visualTargetIndex, consecutive: reason === 'OK', reason };
}

export type RepeatedProof = {
  accepted: boolean;
  reason: 'OK' | 'UNSTABLE_LIST' | 'UNSTABLE_POSITION' | 'INCOMPLETE_LIST' | 'NO_VERIFIED_IDENTITY';
  organicIndex: number;
  visualIndex: number;
  sponsoredBefore: number;
};

/** Two scans MUST independently observe the identical complete prefix. */
export function reconcileRepeatedPasses(a: VerifiedList, b: VerifiedList, depth = 20): RepeatedProof {
  const reject = (reason: RepeatedProof['reason']): RepeatedProof => ({
    accepted: false, reason, organicIndex: -1, visualIndex: -1, sponsoredBefore: 0,
  });
  if (!a.consecutive || !b.consecutive) return reject('UNSTABLE_LIST');
  if (a.targetIndex !== b.targetIndex || a.visualTargetIndex !== b.visualTargetIndex)
    return reject('UNSTABLE_POSITION');
  const matched = a.targetIndex >= 0;
  if (!matched && (a.organic.length < depth || b.organic.length < depth))
    return reject('INCOMPLETE_LIST');
  const prefix = (list: VerifiedList) => {
    const last = matched ? list.visualTargetIndex : list.visual.findIndex((card, i) =>
      list.visual.slice(0, i + 1).filter((row) => !row.sponsored).length >= depth);
    if (last < 0) return [];
    return list.visual.slice(0, last + 1).map((card) => ({
      key: organicKey(card), name: normalizeListingName(card.name), sponsored: card.sponsored,
    }));
  };
  if (JSON.stringify(prefix(a)) !== JSON.stringify(prefix(b))) return reject('UNSTABLE_LIST');
  if (matched) {
    if (a.visualTargetIndex < 0 || b.visualTargetIndex < 0) return reject('NO_VERIFIED_IDENTITY');
    return { accepted: true, reason: 'OK', organicIndex: a.targetIndex,
      visualIndex: a.visualTargetIndex, sponsoredBefore: a.visualTargetIndex - a.targetIndex };
  }
  return { accepted: true, reason: 'OK', organicIndex: -1, visualIndex: -1, sponsoredBefore: 0 };
}
