import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPair, type Capture } from '../apps/firebase/provider.js';
import type { RankQuery } from '../packages/contracts/index.js';
const q:RankQuery={term:'serviço de teste',keywordId:'test',kind:'COMMERCIAL',cluster:'Teste',surface:'MAPS',language:'pt-BR',
  device:'desktop',lat:-21,lng:-45,depth:20,cid:'777',placeId:null,expectedName:'Empresa de teste',point:0,algorithmVersion:'firebase-pair-v1'};
const capture=(taskRef:string,rank=7):Capture=>({observedAt:new Date().toISOString(),taskRef,depth:20,complete:true,costMicros:100,
  evidence:{source:'SYNTHETIC_TEST',responseHash:'test'},items:Array.from({length:rank},(_,i)=>({name:i===rank-1?'Empresa de teste':'Concorrente '+i,
    cid:i===rank-1?'777':String(i+1),placeId:null,position:i+1,sponsored:false}))});
test('Firebase: seis orgânicos anteriores são 7º e duas capturas iguais confirmam',()=>{
  assert.deepEqual(verifyPair(q,capture('a'),capture('b')),{status:'VERIFIED',position:7,identityMatch:'cid:777',reason:'TWO_CAPTURES_CONFIRMED',observedPositions:[7,7]});
});

test('Firebase: inconclusive readings carry an explicit explanation without choosing a rank',()=>{
  const r=verifyPair(q,capture('a',3),capture('b',7));
  assert.equal(r.position,null);assert.equal(r.reason,'POSITION_DIVERGENCE');assert.deepEqual(r.observedPositions,[3,7]);
});

test('Firebase: stale/invalid dates, impossible depth, missing proof and reversed captures never verify',()=>{
  for(const [reason,change] of [
    ['STALE_CAPTURE',(b:Capture)=>{b.observedAt=new Date(Date.now()-20*60000).toISOString();}],
    ['INVALID_OBSERVATION_DATE',(b:Capture)=>{b.observedAt='invalid';}],
    ['INVALID_CAPTURE_DEPTH',(b:Capture)=>{b.depth=2;}],
    ['MISSING_CAPTURE_EVIDENCE',(b:Capture)=>{b.evidence.responseHash='';}],
    ['INVALID_CAPTURE_ORDER',(b:Capture)=>{b.observedAt=new Date(Date.now()-10000).toISOString();}],
  ] as const){const a=capture('a'),b=capture('b');change(b);const r=verifyPair(q,a,b);assert.equal(r.position,null);assert.equal(r.reason,reason);}
});
test('Firebase: divergência 3º/7º, resposta repetida e lista incompleta nunca produzem posição',()=>{
  assert.equal(verifyPair(q,capture('a',3),capture('b',7)).position,null);
  assert.equal(verifyPair(q,capture('a'),capture('a')).position,null);
  const b=capture('b');b.complete=false;assert.equal(verifyPair(q,capture('a'),b).position,null);
});
test('Firebase: CID ausente, nome diferente, lacuna e identidade duplicada são inconclusivos',()=>{
  for(const change of [
    (b:Capture)=>{b.items[6].cid='999';},
    (b:Capture)=>{b.items[6].name='Empresa diferente';},
    (b:Capture)=>{b.items.splice(1,1);},
    (b:Capture)=>{b.items[0].cid=b.items[1].cid;},
  ]){const a=capture('a'),b=capture('b');change(a);change(b);assert.equal(verifyPair(q,a,b).position,null);}
});
test('Firebase: anúncios não alteram a posição orgânica e Place ID divergente invalida identidade',()=>{
  const a=capture('a'),b=capture('b');for(const x of[a,b])x.items.unshift({name:'Anúncio',cid:'888',placeId:null,position:1,sponsored:true});
  assert.equal(verifyPair(q,a,b).position,7);
  a.items.at(-1)!.placeId='different';b.items.at(-1)!.placeId='different';assert.equal(verifyPair({...q,placeId:'expected'},a,b).position,null);
});
