/**
 * Conservative extraction of Google Maps listing information.
 * Viewport coordinates (`@lat,lng`) are NOT precise business coordinates.
 * This module never guesses a business identity from the URL slug.
 */
export type MapCoordinates = { lat: number; lng: number; source: 'LISTING' | 'VIEWPORT' };

function validCoordinates(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180;
}

export function coordinatesFromMapsUrl(value: string): MapCoordinates | null {
  const detail = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(value);
  const alternate = /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/.exec(value);
  const viewport = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(value);
  const lat = detail ? Number(detail[1]) : alternate ? Number(alternate[2]) : viewport ? Number(viewport[1]) : NaN;
  const lng = detail ? Number(detail[2]) : alternate ? Number(alternate[1]) : viewport ? Number(viewport[2]) : NaN;
  if (!validCoordinates(lat, lng)) return null;
  return { lat, lng, source: detail || alternate ? 'LISTING' : 'VIEWPORT' };
}

export function cityFromBrazilianAddress(address: string): string | null {
  const clean = address.replace(/\s+/g, ' ').replace(/\s*,\s*Brasil\s*$/i, '').trim();
  // Maps addresses commonly finish with "..., Município - UF, CEP" or "..., Município, UF, CEP".
  const patterns = [
    /,\s*([^,]+?)\s*-\s*(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?=\s*,|\s*$)/i,
    /,\s*([^,]+?)\s*,\s*(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?=\s*,|\s*$)/i,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) {
      const city = match[1].replace(/^(bairro|cidade)\s+/i, '').trim();
      if (city && !/^\d+$/.test(city) && city.length <= 120) return city;
    }
  }
  return null;
}

export function mapsInterruption(text: string, url: string): 'BLOCKED' | 'CONSENT' | null {
  if (/tráfego incomum|unusual traffic|captcha|não sou um robô|verify you are human|detected unusual traffic/i.test(text))
    return 'BLOCKED';
  if (/consent\.google\./i.test(url) ||
      /antes de continuar|before you continue to google|aceitar tudo|accept all cookies/i.test(text.slice(0, 1300)))
    return 'CONSENT';
  return null;
}
