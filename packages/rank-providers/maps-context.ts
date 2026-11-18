import type {RankQuery} from '../contracts/index.js';

export type MapsCaptureContext = {
  mapUrl:string; term:string; centerLat:number; centerLng:number; zoom:number;
  viewport:{width:number;height:number};
  sessionId?:string;
};
const normalizeQuery=(term:string)=>term.normalize('NFC').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();

/** Observed URL and input value, never a URL reconstructed from the request. */
export function readMapsContext(url:string,visibleTerm:string,viewport:{width:number;height:number}|null):MapsCaptureContext|null {
  try {
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||!['www.google.com','google.com'].includes(parsed.hostname)||parsed.username||parsed.password)return null;
    const match=parsed.pathname.match(/^\/maps\/search\/([^/]+)\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)z(?:\/|$)/);
    if(!match||!visibleTerm.trim()||normalizeQuery(decodeURIComponent(match[1].replace(/\+/g,' ')))!==normalizeQuery(visibleTerm))return null;
    const centerLat=Number(match[2]),centerLng=Number(match[3]),zoom=Number(match[4]);
    if(Math.abs(centerLat)>85||Math.abs(centerLng)>180||zoom<1||zoom>22||
      !viewport||!Number.isInteger(viewport.width)||!Number.isInteger(viewport.height)||viewport.width<1||viewport.height<1)return null;
    return {mapUrl:`https://www.google.com/maps/search/${encodeURIComponent(visibleTerm.trim())}/@${centerLat},${centerLng},${zoom}z?hl=pt-BR`,
      term:visibleTerm.trim(),centerLat,centerLng,zoom,viewport:{...viewport}};
  } catch {return null;}
}

/** The fixed-area collector must actually remain in the area it requested. */
export function mapsContextMatchesQuery(context:MapsCaptureContext|undefined,query:Pick<RankQuery,'term'|'lat'|'lng'>):boolean {
  if(!context)return false;
  const checked=readMapsContext(context.mapUrl,context.term,context.viewport);
  return !!checked&&normalizeQuery(checked.term)===normalizeQuery(query.term)&&
    checked.zoom===15&&Math.abs(checked.centerLat-query.lat)<=0.00001&&Math.abs(checked.centerLng-query.lng)<=0.00001&&
    checked.centerLat===context.centerLat&&checked.centerLng===context.centerLng&&checked.zoom===context.zoom;
}

export function sameMapsContext(a:MapsCaptureContext,b:MapsCaptureContext):boolean {
  return normalizeQuery(a.term)===normalizeQuery(b.term)&&a.centerLat===b.centerLat&&a.centerLng===b.centerLng&&a.zoom===b.zoom&&
    a.viewport.width===b.viewport.width&&a.viewport.height===b.viewport.height;
}
