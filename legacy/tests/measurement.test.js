import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateObserved,findCandidate} from '../src/services/measurement.js';
import {createDb,insertSeed} from '../src/db.js';
import {buildReport,csv} from '../src/services/report.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const company={name:'Jares Móveis — Pouso Alegre',city:'Pouso Alegre',cid:'d16aefdbdee3d709'};
test('CID match positions exclude sponsored placements',()=>{
 const result=evaluateObserved(company,[{name:'Ad',url:'https://a.com',promoted:true},{name:'Concorrente',url:'https://c.com',promoted:false},{name:'Jares Móveis',url:'https://google.com/maps/place/X/data=!4m2!3m1!1s0x0:0xd16aefdbdee3d709',promoted:false}],true);
 assert.equal(result.position,2);assert.equal(result.status,'VERIFIED');
});
test('name-only match is review, never verified',()=>{
 const result=evaluateObserved(company,[{name:'Jares Móveis',detail:'Pouso Alegre',url:'https://google.com/maps/place/jares',promoted:false}],true);
 assert.equal(result.status,'REVIEW');assert.equal(result.position,null);assert.equal(result.candidatePosition,1);
});
test('direct profile without list is not top one',()=>{
 assert.equal(evaluateObserved(company,[],false).status,'NO_LIST');
});
test('local SQLite, seed and feedback without rankings',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-test-'));const db=createDb(path.join(dir,'app.sqlite'));
 try{
  insertSeed(db,[{unit:'Empresa Teste',city:'TC',lat:-21.7,lon:-45.2,cid:'',terms:[{term:'loja de móveis em TC',cluster:'Loja',priority:'P1'}]}]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM terms').get().n,1);
  assert.match(buildReport(db,1).text,/Ainda não existe uma medição/);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('CSV sanitizes spreadsheet formulas',()=>{
 const s=csv([{query:'=HYPERLINK("bad")',cluster:'=1+1',priority:'P1',status:'PENDING'}]);assert.match(s,/"'=HYPERLINK/);
});
test('keyword generator does not create ranking positions',async()=>{
 const {suggestKeywords}=await import('../src/services/keywords.js');
 const terms=suggestKeywords({city:'Três Corações, MG',niche:'moveis',products:['sofá retrátil']});
 assert.ok(terms.length>8);assert.ok(terms.some(x=>x.query==='sofá retrátil em Três Corações'));
 assert.ok(terms.every(x=>!Object.hasOwn(x,'position')));
});
test('generic non-Jares company produces candidate for human review',()=>{
 const result=evaluateObserved({name:'Diamante Produtos de Limpeza',city:'Três Corações',cid:''},[{name:'Diamante Produtos de Limpeza',detail:'Três Corações',url:'https://google.com/maps/place/diamante',promoted:false}],true);
 assert.equal(result.status,'REVIEW');assert.equal(result.candidatePosition,1);
});
