/**
 * Experimental local-only measurement source. Not a commercial data license.
 * Runs with a real, visible Chrome, never headless, bypassing challenges or rotating identity.
 * Disabled by default; explicit local test opt-in, no paid requests.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseMapsUrl } from '../domain/maps.js';
import { cityFromBrazilianAddress, coordinatesFromMapsUrl, mapsInterruption } from './maps-detail.js';
import { AppError } from '../domain/errors.js';
import type { RankQuery } from '../contracts/index.js';
import type { ProviderResult, RankProvider } from './index.js';
import { cidFromResultUrl, stitchOrganicSnapshots, reconcileRepeatedPasses, normalizeListingName, type VerifiedList, type ObservedCard } from './verified-organic.js';
export { cidFromResultUrl } from './verified-organic.js';

type ResultCard = ObservedCard;
type BrowserContext = Awaited<ReturnType<(typeof import('@playwright/test'))['chromium']['launchPersistentContext']>>;
type Page = Awaited<ReturnType<BrowserContext['newPage']>>;


export type ResolveDiagnostics = {
  status: 'REVIEW_REQUIRED' | 'PROVIDER_UNAVAILABLE' | 'MAPS_BROWSER_START_FAILED' |
    'MAPS_NAVIGATION_FAILED' | 'MAPS_CONSENT_REQUIRED' | 'MAPS_ACCESS_BLOCKED' |
    'MAPS_DETAILS_INCOMPLETE' | 'MAPS_IDENTITY_MISMATCH' | 'MAPS_BROWSER_BUSY';
  candidates: {
    name: string; city: string; address: string; category?: string;
    lat: number; lng: number; cid: string | null; placeId: string | null;
  }[];
  missing?: string[];
  partial?: { name?: string; city?: string; address?: string; category?: string; lat?: number; lng?: number };
};

export function localPreviewEnabled() {
  // This adapter launches the browser inside the local worker, and must never
  // be activated by a remote deployment accidentally inheriting an .env file.
  let localDatabase = false;
  if (process.env.DATABASE_URL) {
    try {
      const database = new URL(process.env.DATABASE_URL);
      localDatabase = ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname);
    } catch { /* A missing database is not a valid opt-in. */ }
  } else if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GCLOUD_PROJECT || process.env.RANK_PROVIDER === 'local_chrome_preview') {
    localDatabase = true;
  }
  return ['staging', 'development', 'test'].includes(process.env.NODE_ENV ?? '') &&
    process.env.RANK_PROVIDER === 'local_chrome_preview' &&
    process.env.LRT_LOCAL_EVAL === 'I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE' &&
    localDatabase;
}

type FeedRead = {
  feed: boolean;
  cards: ResultCard[];
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  unparsedCards: number;
  ambiguousAdvertisements: number;
};

/** Read one DOM row per Maps result, never every link found in the page. */
async function readCards(page: Page): Promise<FeedRead> {
  return page.evaluate(() => {
    const feed = document.querySelector('[role="feed"]') as HTMLElement | null;
    const empty: FeedRead = { feed: false, cards: [], scrollTop: 0, scrollHeight: 0,
      clientHeight: 0, unparsedCards: 0, ambiguousAdvertisements: 0 };
    if (!feed) return empty;
    const knownRows = [...feed.querySelectorAll('div.Nv2PK')];
    const articles = [...feed.querySelectorAll('[role="article"]')].filter((element) =>
      !element.parentElement?.closest('[role="article"]'));
    const rows = knownRows.length ? knownRows.filter((element) => !element.parentElement?.closest('div.Nv2PK')) : articles;
    const cards: ResultCard[] = [];
    let unparsedCards = 0;
    let ambiguousAdvertisements = 0;
    // CSS can display a card out of DOM order. An ordinal derived from DOM
    // order must not be published when its visible vertical order disagrees.
    const visualTops = rows.map((element) => element.getBoundingClientRect().top);
    if (visualTops.some((top, index) => index > 0 && top + 2 < visualTops[index - 1]))
      unparsedCards++;
    for (const element of rows) {
      const row = element as HTMLElement;
      const anchors = [...row.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]')] as HTMLAnchorElement[];
      // If two different places are linked from a single row, we cannot know
      // which identity corresponds to the visual result.
      const distinct = [...new Set(anchors.map((anchor) => anchor.href).filter(Boolean))];
      const anchor = anchors.find((candidate) => candidate.matches('a.hfpxzc')) ?? anchors[0];
      const name = (anchor?.getAttribute('aria-label') ?? row.querySelector('.qBF1Pd')?.textContent ?? '').trim();
      const detail = (row.innerText ?? '').slice(0, 1000);
      if (!anchor || !anchor.href || !name || distinct.length !== 1) {
        unparsedCards++;
        continue;
      }
      const adLabels = [...row.querySelectorAll('[aria-label]')]
        .map((node) => (node.getAttribute('aria-label') ?? '').trim().toLocaleLowerCase('pt-BR'));
      const sponsored = adLabels.some((label) => /^(patrocinado|anúncio|anuncio|sponsored|ad)$/.test(label)) ||
        /(^|\n)\s*(patrocinado|anúncio|anuncio|sponsored|ad)\s*(\n|$)/i.test(detail);
      // A suspected advertisement without a reliable label invalidates the
      // measurement instead of silently shifting all subsequent positions.
      if (!sponsored && /\b(patrocinado|anúncio|anuncio|sponsored)\b/i.test(detail))
        ambiguousAdvertisements++;
      cards.push({ name, url: anchor.href, detail, sponsored });
    }
    // The layout has result anchors without recognized row containers.
    // Never silently count only some cards and call that a complete list.
    const looseAnchors = [...feed.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]')]
      .filter((node) => !rows.some((row) => row.contains(node)));
    if (looseAnchors.length) unparsedCards += looseAnchors.length;
    if (!rows.length && feed.innerText?.trim()) unparsedCards++;
    return {
      feed: true, cards, scrollTop: feed.scrollTop, scrollHeight: feed.scrollHeight,
      clientHeight: feed.clientHeight, unparsedCards, ambiguousAdvertisements,
    };
  });
}

type Scan = { valid: boolean; reason: string; proof: VerifiedList; snapshots: ResultCard[][];
  first: FeedRead | null; totalSnapshots: number };

const identityOf = (rows: ResultCard[]) => rows.map((item) =>
  [item.url, normalizeListingName(item.name), item.sponsored ? 'AD' : 'ORGANIC'].join('|')).join('\n');

/** Begin at scrollTop=0, check hydration stability, then scroll in overlaps. */
async function scanOnce(page: Page, query: RankQuery, topScreenshot?: string): Promise<Scan> {
  const empty = stitchOrganicSnapshots([], query.cid, query.expectedName, Math.min(query.depth, 20));
  const failure = (reason: string, snapshots: ResultCard[][] = [], first: FeedRead | null = null): Scan =>
    ({ valid: false, reason, proof: empty, snapshots, first, totalSnapshots: snapshots.length });
  const feed = page.locator('[role="feed"]');
  if (!await feed.count()) return failure('MAPS_FEED_MISSING');
  await feed.evaluate((element) => { (element as HTMLElement).scrollTop = 0; });
  await page.waitForTimeout(700);
  let first = await readCards(page);
  let stable = false;
  // Maps can still be hydrating results. Wait for two identical top snapshots.
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(550);
    const next = await readCards(page);
    if (first.cards.length && next.cards.length &&
        first.scrollTop <= 2 && next.scrollTop <= 2 &&
        identityOf(first.cards) === identityOf(next.cards) &&
        !first.unparsedCards && !next.unparsedCards &&
        !first.ambiguousAdvertisements && !next.ambiguousAdvertisements) {
      first = next;
      stable = true;
      break;
    }
    first = next;
  }
  if (!stable) return failure('FIRST_RESULTS_NOT_STABLE', [first.cards], first);
  if (topScreenshot) {
    // Read-only capture of the first displayed results, before scrolling.
    await page.screenshot({ path: topScreenshot, timeout: 5000 }).catch(() => {});
  }
  const snapshots: ResultCard[][] = [first.cards];
  let last = first;
  let stagnation = 0;
  const depth = Math.min(query.depth, 20);
  for (let iteration = 0; iteration < 45; iteration++) {
    const assembled = stitchOrganicSnapshots(snapshots, query.cid, query.expectedName, depth);
    if (!assembled.consecutive) return { valid: false, reason: assembled.reason, proof: assembled,
      snapshots, first, totalSnapshots: snapshots.length };
    if (assembled.organic.length >= depth) break;
    const oldTop = last.scrollTop;
    const scrollStep = Math.max(100, Math.min(220, Math.floor(last.clientHeight * 0.28)));
    await feed.evaluate((element, pixels) => { (element as HTMLElement).scrollBy(0, pixels); }, scrollStep);
    await page.waitForTimeout(620);
    const next = await readCards(page);
    if (!next.feed || next.unparsedCards || next.ambiguousAdvertisements)
      return failure('UNREADABLE_OR_AMBIGUOUS_RESULT', snapshots, first);
    if (next.scrollTop + 3 < oldTop)
      return failure('SCROLL_JUMP', snapshots, first);
    snapshots.push(next.cards);
    const previousCount = new Set(snapshots.slice(0, -1).flatMap((rows) => rows.map((row) => row.url))).size;
    const newCount = new Set(snapshots.flatMap((rows) => rows.map((row) => row.url))).size;
    if (newCount <= previousCount && next.scrollTop <= oldTop + 2) stagnation++;
    else stagnation = 0;
    last = next;
    if (stagnation >= 3) break;
  }
  const proof = stitchOrganicSnapshots(snapshots, query.cid, query.expectedName, depth);
  return { valid: proof.consecutive, reason: proof.reason, proof, snapshots, first,
    totalSnapshots: snapshots.length };
}

export class LocalChromePreviewProvider implements RankProvider {
  readonly id = 'local_chrome_preview';
  readonly demo = true; // Explicitly noncommercial, staging only.
  private context: BrowserContext | null = null;
  private busy = false;
  private blocked = false;
  private lookupBusy = false;
  private cache = new Map<string, ProviderResult>();
  private readonly evidence = path.resolve('work/local-chrome-evidence');

  supports(surface: RankQuery['surface']) { return surface === 'MAPS'; }
  async quote(query: RankQuery) {
    if (!this.supports(query.surface) || query.device !== 'desktop' || query.language !== 'pt-BR')
      throw new AppError(422, 'LOCAL_PREVIEW_ONLY_MAPS_DESKTOP_PT_BR');
    return { maxCostMicros: 0, depth: 20 };
  }

  private async browser(): Promise<BrowserContext> {
    if (this.context) return this.context;
    const { chromium } = await import('@playwright/test');
    await mkdir(this.evidence, { recursive: true });
    const profile = path.resolve('work', 'local-chrome-profile-' + process.pid);
    const launched = await chromium.launchPersistentContext(profile, {
      channel: 'chrome', headless: false, chromiumSandbox: true,
      viewport: { width: 1360, height: 920 }, locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    launched.on('close', () => { if (this.context === launched) this.context = null; });
    this.context = launched;
    await launched.grantPermissions(['geolocation'], { origin: 'https://www.google.com' });
    return launched;
  }

  async resolve(link: string) {
    const outcome = await this.resolveWithDiagnostics(link);
    return outcome.candidates;
  }

  /**
   * The UI receives an explicit failure reason rather than a silent empty array.
   * An empty array never means the company was proved not to exist.
   */
  async resolveWithDiagnostics(link: string): Promise<ResolveDiagnostics> {
    if (!localPreviewEnabled()) return { status: 'PROVIDER_UNAVAILABLE', candidates: [] };
    const parsed = parseMapsUrl(link);
    if (this.lookupBusy) return { status: 'MAPS_BROWSER_BUSY', candidates: [] };
    this.lookupBusy = true;
    let page: Page | null = null;
    let phase: 'BROWSER' | 'NAVIGATE' | 'EXTRACT' = 'BROWSER';
    let outcome: ResolveDiagnostics = { status: 'MAPS_BROWSER_START_FAILED', candidates: [] };
    const screenshotPath = path.join(this.evidence, 'ultima-identificacao.png');
    const diagnosticsPath = path.join(this.evidence, 'ultima-identificacao.json');
    let technicalError = '';
    try {
      const ctx = await this.browser();
      // launchPersistentContext opens a blank tab. Reuse it instead of showing
      // an extra permanent about:blank window to the operator.
      page = ctx.pages().find((tab) => tab.url() === 'about:blank') ?? await ctx.newPage();
      phase = 'NAVIGATE';
      await page.goto(parsed.url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch((error) => {
        // The Maps SPA may still have loaded even if DOMContentLoaded timed out.
        // Continue only if navigation actually left the blank tab.
        if (page?.url() === 'about:blank') throw error;
      });
      phase = 'EXTRACT';
      let captured = { name: '', address: '', category: '', text: '' };
      // Maps renders asynchronously. A fixed 10-second wait for an arbitrary
      // h1 was not sufficient, and missing fields were silently discarded.
      for (let attempt = 0; attempt < 20; attempt++) {
        captured = await page.evaluate(() => {
          const visible = (selector: string) => {
            const element = document.querySelector(selector) as HTMLElement | null;
            return element?.innerText?.trim() ?? '';
          };
          const heading = visible('h1.DUwDvf') || visible('h1.fontHeadlineLarge') || visible('h1');
          const element = document.querySelector('button[data-item-id="address"], [data-item-id="address"], button[aria-label^="Endereço:"], button[aria-label^="Address:"]') as HTMLElement | null;
          const label = element?.getAttribute('aria-label') ?? '';
          const addressText = element?.querySelector('.Io6YTe')?.textContent?.trim() ?? element?.innerText?.trim() ?? '';
          const address = (addressText && !/^(copiar endereço|copy address)$/i.test(addressText) ? addressText : label)
            .replace(/^(endereço|address):\s*/i, '').trim();
          return {
            name: heading,
            address,
            category: visible('button.DkEaL') || visible('button[jsaction*="category"]'),
            text: (document.body?.innerText ?? '').slice(0, 2200),
          };
        });
        if (captured.name && captured.address &&
            (coordinatesFromMapsUrl(page.url())?.source === 'LISTING' || coordinatesFromMapsUrl(parsed.url)?.source === 'LISTING')) break;
        if (mapsInterruption(captured.text, page.url())) break;
        await page.waitForTimeout(1200);
      }
      const pageUrl = page.url();
      const interruption = mapsInterruption(captured.text, pageUrl);
      if (interruption) {
        outcome = { status: interruption === 'BLOCKED' ? 'MAPS_ACCESS_BLOCKED' : 'MAPS_CONSENT_REQUIRED', candidates: [] };
      } else if (!/^https:\/\/(?:[a-z0-9-]+\.)*google\.com(?:\.br)?\//i.test(pageUrl) || pageUrl === 'about:blank') {
        outcome = { status: 'MAPS_NAVIGATION_FAILED', candidates: [] };
      } else {
        const currentCid = cidFromResultUrl(pageUrl);
        const cid = currentCid ?? parsed.cid;
        const precise = [coordinatesFromMapsUrl(pageUrl), coordinatesFromMapsUrl(parsed.url)]
          .find((c) => c?.source === 'LISTING');
        const city = cityFromBrazilianAddress(captured.address);
        const missing = [
          ...(!captured.name ? ['nome'] : []),
          ...(!captured.address ? ['endereço'] : []),
          ...(!city ? ['cidade'] : []),
          ...(!precise ? ['coordenadas exatas'] : []),
          ...(!cid && !parsed.placeId ? ['CID/Place ID'] : []),
        ];
        if (parsed.cid && currentCid && parsed.cid !== currentCid) {
          outcome = { status: 'MAPS_IDENTITY_MISMATCH', candidates: [] };
        } else if (missing.length) {
          outcome = { status: 'MAPS_DETAILS_INCOMPLETE', candidates: [], missing, partial: {
            ...(captured.name ? { name: captured.name } : {}),
            ...(captured.address ? { address: captured.address } : {}),
            ...(city ? { city } : {}),
            ...(captured.category ? { category: captured.category } : {}),
            ...(precise ? { lat: precise.lat, lng: precise.lng } : {}),
          } };
        } else {
          outcome = { status: 'REVIEW_REQUIRED', candidates: [{
            name: captured.name, city: city!, address: captured.address,
            category: captured.category || undefined,
            lat: precise!.lat, lng: precise!.lng, cid: cid ?? null, placeId: parsed.placeId,
          }] };
        }
      }
    } catch (error) {
      technicalError = error instanceof Error ? error.name + ': ' + error.message.slice(0, 300) : 'Unknown';
      outcome = { status: phase === 'BROWSER' ? 'MAPS_BROWSER_START_FAILED' : 'MAPS_NAVIGATION_FAILED', candidates: [] };
    } finally {
      await mkdir(this.evidence, { recursive: true }).catch(() => {});
      if (page) await page.screenshot({ path: screenshotPath, timeout: 4000 }).catch(() => {});
      await writeFile(diagnosticsPath, JSON.stringify({
        status: outcome.status, missing: outcome.missing ?? [],
        browserUrl: page?.url() ?? null, phase,
        technicalError, recordedAt: new Date().toISOString(),
        screenshot: screenshotPath,
      }, null, 2)).catch(() => {});
      await page?.close().catch(() => {});
      this.lookupBusy = false;
    }
    return outcome;
  }

  async measure(query: RankQuery, key: string): Promise<ProviderResult> {
    if (!localPreviewEnabled()) throw Error('Local preview is restricted to explicitly authorized local testing');
    if (!this.supports(query.surface) || query.device !== 'desktop' || query.language !== 'pt-BR')
      throw new AppError(422, 'LOCAL_PREVIEW_ONLY_MAPS_DESKTOP_PT_BR');
    const previous = this.cache.get(key);
    if (previous) return previous;
    if (this.blocked) return { observedAt: new Date().toISOString(), taskRef: 'local-blocked', depth: 20, complete: false, costMicros: 0, items: [], failure: 'BLOCKED' };
    if (this.busy) throw Error('LOCAL_PREVIEW_PARALLEL_REQUEST');
    this.busy = true;
    const observedAt = new Date().toISOString();
    const taskRef = 'local-' + createHash('sha256').update(key).digest('hex').slice(0, 20);
    const base: ProviderResult = { observedAt, taskRef, depth: 20, complete: false, costMicros: 0, items: [] };
    let page: Page | null = null;
    try {
      const ctx = await this.browser();
      await mkdir(this.evidence, { recursive: true });
      await ctx.setGeolocation({ latitude: query.lat, longitude: query.lng, accuracy: 100 });
      page = ctx.pages().find((tab) => tab.url() === 'about:blank') ?? await ctx.newPage();
      const uri = `https://www.google.com/maps/search/${encodeURIComponent(query.term)}/@${query.lat},${query.lng},15z?hl=pt-BR`;
      await page.goto(uri, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1800);
      const text = (await page.locator('body').innerText({ timeout: 4000 }).catch(() => '')).slice(0, 2000);
      if (/tráfego incomum|unusual traffic|captcha|não sou um robô|verify you are human/i.test(text)) {
        base.failure = 'BLOCKED';
        this.blocked = true;
      } else {
        await page.locator('[role="feed"]').waitFor({ timeout: 10000 }).catch(() => {});
        const firstPass = await scanOnce(page, query, path.join(this.evidence, taskRef + '-topo-1.png'));
        const secondPass = firstPass.valid
          ? await scanOnce(page, query, path.join(this.evidence, taskRef + '-topo-2.png')) : null;
        const reconciled = secondPass?.valid
          ? reconcileRepeatedPasses(firstPass.proof, secondPass.proof, Math.min(query.depth, 20))
          : { accepted: false as const, reason: secondPass?.reason ?? firstPass.reason,
              organicIndex: -1, visualIndex: -1, sponsoredBefore: 0 };
        const exactMatch = reconciled.accepted && reconciled.organicIndex >= 0;
        let targetEvidence = false;
        // IMPORTANT: collecting a screenshot scrolls the Maps feed. Never do
        // this while building the ordinal: that was a false-ranking bug in V4.7.
        if (exactMatch && query.cid && query.expectedName) {
          const feed = page.locator('[role="feed"]');
          await feed.evaluate((element) => { (element as HTMLElement).scrollTop = 0; });
          await page.waitForTimeout(450);
          for (let attempt = 0; attempt < 40 && !targetEvidence; attempt++) {
            const links = page.locator('[role="feed"] a.hfpxzc');
            const count = Math.min(await links.count(), 80);
            for (let j = 0; j < count; j++) {
              const link = links.nth(j);
              const href = await link.getAttribute('href').catch(() => null);
              const name = await link.getAttribute('aria-label').catch(() => null);
              if (!href || cidFromResultUrl(new URL(href, 'https://www.google.com').href) !== query.cid ||
                  normalizeListingName(name ?? '') !== normalizeListingName(query.expectedName)) continue;
              const row = link.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " Nv2PK ")][1]');
              if (await row.count() !== 1) continue;
              // Screenshots are evidence, not a way to infer the position.
              const screenshot = path.join(this.evidence, taskRef + '-cartao.png');
              targetEvidence = await row.screenshot({ path: screenshot, timeout: 5000 })
                .then(() => true, () => false);
              if (targetEvidence) {
                targetEvidence = await page.screenshot({
                  path: path.join(this.evidence, taskRef + '-contexto.png'), timeout: 5000,
                }).then(() => true, () => false);
                break;
              }
            }
            if (targetEvidence) break;
            await feed.evaluate((element) => { (element as HTMLElement).scrollBy(0, 310); });
            await page.waitForTimeout(400);
          }
        }
        const approved = Boolean(query.cid && query.expectedName) &&
          reconciled.accepted && (!exactMatch || targetEvidence);
        // No position OR competitor rank is published from a failed proof.
        if (approved) {
          base.items = firstPass.proof.organic.map((card, index) => ({
            name: card.name,
            position: index + 1,
            cid: cidFromResultUrl(card.url) ?? undefined,
            sponsored: false,
          }));
          // Verified presence or a complete absence within the first 20.
          base.complete = true;
        }
        await writeFile(path.join(this.evidence, taskRef + '-prova.json'), JSON.stringify({
          version: 'rank-proof-v2',
          term: query.term,
          point: { lat: query.lat, lng: query.lng },
          mapsUrlAtProof: page.url(),
          target: { cid: query.cid, name: query.expectedName },
          scans: [firstPass, secondPass].filter(Boolean).map((scan) => ({
            valid: scan!.valid, reason: scan!.reason, snapshots: scan!.totalSnapshots,
            startingScrollTop: scan!.first?.scrollTop,
            visualOrder: scan!.proof.visual.map((card, i) => ({
              visualPosition: i + 1, name: card.name, url: card.url, sponsored: card.sponsored,
            })),
            organicOrder: scan!.proof.organic.map((card, i) => ({
              organicPosition: i + 1, name: card.name, url: card.url,
            })),
            targetOrganicPosition: scan!.proof.targetIndex >= 0 ? scan!.proof.targetIndex + 1 : null,
            targetVisualPosition: scan!.proof.visualTargetIndex >= 0 ? scan!.proof.visualTargetIndex + 1 : null,
          })),
          decision: {
            verified: approved,
            reason: approved ? 'TWO_INDEPENDENT_ORDERED_SCANS_AND_EVIDENCE' :
              (exactMatch && !targetEvidence ? 'NO_TARGET_SCREENSHOT' : reconciled.reason),
            organicPosition: approved && exactMatch ? reconciled.organicIndex + 1 : null,
            visualPosition: approved && exactMatch ? reconciled.visualIndex + 1 : null,
            sponsoredBefore: approved && exactMatch ? reconciled.sponsoredBefore : null,
          },
        }, null, 2));
      }
      await mkdir(this.evidence, { recursive: true });
      // Local, private review artifacts only. Never uploaded to cloud or served as commercial data.
      await page.screenshot({ path: path.join(this.evidence, taskRef + '.png'), timeout: 10000 }).catch(() => {});
      await writeFile(path.join(this.evidence, taskRef + '.json'), JSON.stringify({
        query: { term: query.term, surface: query.surface, lat: query.lat, lng: query.lng },
        ...base,
      }, null, 2));
      this.cache.set(key, base);
      return base;
    } catch (e) {
      if (page) await page.screenshot({ path: path.join(this.evidence, taskRef + '.png'), timeout: 5000 }).catch(() => {});
      // Do not mask operational errors as a verified rank. The worker records
      // an inconclusive result; the evidence contains no fabricated position.
      const failed: ProviderResult = { ...base, failure: 'ERROR' };
      await mkdir(this.evidence, { recursive: true }).catch(() => {});
      await writeFile(path.join(this.evidence, taskRef + '.json'), JSON.stringify({
        query: { term: query.term, surface: query.surface, lat: query.lat, lng: query.lng },
        ...failed,
        errorType: e instanceof Error ? e.name : 'UnknownError',
      }, null, 2)).catch(() => {});
      return failed;
    } finally {
      if (page) await page.close().catch(() => {});
      this.busy = false;
      await new Promise((resolve) => setTimeout(resolve, 2500)); // conservative pacing; no evasion
    }
  }

  async dispose() {
    await this.context?.close().catch(() => {});
    this.context = null;
  }
}
