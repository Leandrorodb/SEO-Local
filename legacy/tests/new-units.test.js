import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDb,insertSeed,insertAdditionalSeed} from '../src/db.js';
import {evaluateObserved} from '../src/services/measurement.js';
const main=JSON.parse(fs.readFileSync(new URL('../data/jares-seed.json',import.meta.url)));
const extra=JSON.parse(fs.readFileSync(new URL('../data/jares-2-unidades.json',import.meta.url)));
test('76 termos, 2 lojas e CID distinto por cidade',()=>{
 assert.deepEqual(extra.map(x=>[x.unit,x.terms.length,new Set(x.terms.map(t=>t.cluster)).size]),[
  ['Jares Móveis Lavras',38,5],['Jares Móveis Varginha',38,5]
 ]);
 assert.equal(new Set(extra.map(x=>x.cid)).size,2);
 assert.ok(extra.every(x=>x.terms.every(t=>['P1','P2','P3'].includes(t.priority))));
});
test('migração incremental mantém 3 antigas e histórico',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-2-jares-'));
 const db=createDb(path.join(dir,'t.sqlite'));
 try {
  assert.equal(insertSeed(db,main),3);
  const old=db.prepare('SELECT id FROM companies ORDER BY id LIMIT 1').get().id;
  db.prepare('INSERT INTO runs(company_id,mode,status,total,completed) VALUES(?,\'all\',\'COMPLETE\',0,0)').run(old);
  assert.deepEqual(insertAdditionalSeed(db,extra),{companiesAdded:2,termsAdded:76});
  assert.deepEqual(insertAdditionalSeed(db,extra),{companiesAdded:0,termsAdded:0});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM companies').get().n,5);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM runs WHERE company_id=?').get(old).n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM terms').get().n,160);
  const rec=db.prepare('SELECT cid FROM companies WHERE name=?').get('Jares Móveis Varginha');
  assert.equal(rec.cid,'8b8401f5f5276586');
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('resultado de Varginha nao vira ranking de Lavras',()=>{
 const lav=extra[0],varr=extra[1];
 const r={name:'Jares Móveis - Loja de Móveis em Varginha',url:'https://www.google.com/maps/place/Jares+Moveis/data=!4m2!3m1!1s0x94ca9291aeee0b23:0x8b8401f5f5276586',detail:'Av Major Venancio, 451',promoted:false};
 const result=evaluateObserved({...lav,name:lav.unit,latitude:lav.lat,longitude:lav.lon},[r],true);
 assert.equal(result.status,'REVIEW');assert.equal(result.position,null);
 const valid=evaluateObserved({...varr,name:varr.unit},[r],true);
 assert.equal(valid.status,'VERIFIED');assert.equal(valid.position,1);
});
