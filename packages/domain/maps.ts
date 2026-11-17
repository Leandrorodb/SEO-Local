import { requireThat } from './errors.js';
export function parseMapsUrl(input: string) {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw Error('Invalid Maps URL');
  }
  requireThat(
    u.protocol === 'https:' && !u.username && !u.password && !u.port,
    422,
    'UNSAFE_MAPS_URL',
  );
  const hosts = [
    'www.google.com',
    'google.com',
    'www.google.com.br',
    'google.com.br',
    'maps.google.com',
    'maps.app.goo.gl',
    'goo.gl',
  ];
  requireThat(hosts.includes(u.hostname), 422, 'UNSAFE_MAPS_URL');
  const short = u.hostname === 'maps.app.goo.gl' || u.hostname === 'goo.gl';
  requireThat(
    short || u.pathname === '/maps' || u.pathname.startsWith('/maps/'),
    422,
    'INVALID_MAPS_PATH',
  );
  // Parse only; no arbitrary server fetch or redirect follow. Resolver adapter handles licensed lookup.
  const decimal = u.searchParams.get('cid'),
    hex = decodeURIComponent(u.pathname).match(/:0x([a-f0-9]+)(?:!|\/|$)/i)?.[1];
  requireThat(!decimal || /^\d{1,20}$/.test(decimal), 422, 'INVALID_CID');
  const cid = decimal ?? (hex ? BigInt('0x' + hex).toString() : null);
  if (cid)
    requireThat(BigInt(cid) > 0n && BigInt(cid) <= 18446744073709551615n, 422, 'INVALID_CID');
  const protobufPlaceId = decodeURIComponent(u.pathname + u.search).match(/!19s([a-zA-Z0-9_-]{10,255})/)?.[1];
  const placeId = u.searchParams.get('query_place_id') ?? u.searchParams.get('place_id') ?? protobufPlaceId ?? null;
  requireThat(!placeId || /^[a-zA-Z0-9_-]{10,255}$/.test(placeId), 422, 'INVALID_PLACE_ID');
  return { url: u.toString(), cid, placeId, requiresResolution: true, shortLink: short };
}
export function grid5x5(lat: number, lng: number, spacing: number) {
  requireThat(
    Math.abs(lat) <= 85 && Math.abs(lng) <= 180 && spacing >= 50 && spacing <= 10000,
    422,
    'INVALID_GRID',
  );
  return Array.from({ length: 25 }, (_, i) => {
    const row = Math.floor(i / 5) - 2,
      col = (i % 5) - 2;
    const north = row * spacing,
      east = col * spacing,
      d = Math.hypot(north, east) / 6371008.8,
      b = Math.atan2(east, north),
      p = (lat * Math.PI) / 180,
      l = (lng * Math.PI) / 180;
    const p2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b));
    const l2 =
      l +
      Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(p2));
    return {
      sequence: i,
      lat: Number(((p2 * 180) / Math.PI).toFixed(7)),
      lng: Number(((((l2 * 180) / Math.PI + 540) % 360) - 180).toFixed(7)),
    };
  });
}
