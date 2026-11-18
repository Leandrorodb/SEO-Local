import test from 'node:test';
import assert from 'node:assert/strict';
import {readMapsContext,mapsContextMatchesQuery,sameMapsContext} from '../packages/rank-providers/maps-context.js';
const point={term:'moto peças Varginha',lat:-21.5358126,lng:-45.4482479};
const url='https://www.google.com/maps/search/moto+pe%C3%A7as+Varginha/@-21.5358126,-45.4482479,15z?hl=pt-BR&tracking=discard';
const viewport={width:1360,height:920};
test('observed Maps context preserves the literal query and fixed area, without tracking parameters',()=>{
  const context=readMapsContext(url,point.term,viewport)!;
  assert.ok(mapsContextMatchesQuery(context,point));assert.ok(sameMapsContext(context,{...context}));
  assert.equal(new URL(context.mapUrl).searchParams.has('tracking'),false);
  assert.equal(context.centerLat,point.lat);assert.equal(context.zoom,15);
});
test('a citywide anonymous search is not equivalent to the fixed business-area search',()=>{
  const city=readMapsContext(url.replace('@-21.5358126,-45.4482479,15z','@-21.5604173,-45.4568248,14z'),point.term,viewport)!;
  assert.equal(mapsContextMatchesQuery(city,point),false);
  const context=readMapsContext(url,point.term,viewport)!;
  assert.equal(sameMapsContext(context,{...context,viewport:{width:1200,height:720}}),false);
});
test('query changes, direct profiles, untrusted origins and missing viewport never prove a Maps context',()=>{
  for(const invalid of [url.replace('www.google.com','google.com.evil.invalid'),url.replace('https:','http:'),
    url.replace('/maps/search/','/maps/place/'),url.replace('moto+pe%C3%A7as+Varginha','oficina+Varginha')])
    assert.equal(readMapsContext(invalid,point.term,viewport),null);
  assert.equal(readMapsContext(url,point.term,null),null);
  assert.equal(mapsContextMatchesQuery(undefined,point),false);
  const context=readMapsContext(url,point.term,viewport)!;context.centerLat=0;
  assert.equal(mapsContextMatchesQuery(context,point),false);
});
