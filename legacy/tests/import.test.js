import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createDb,insertSeed} from '../src/db.js';
import {importLegacyJares,parseCsv} from '../src/services/import.js';
import {buildReport} from '../src/services/report.js';

test('CSV parser supports quotes, embedded newlines and semicolons',()=>{
 const csv='"Unidade";"Termo"\r\n"Jares";"sofa; com \""frase\""\nextra"\r\n';
 assert.deepEqual(parseCsv(csv),[{Unidade:'Jares',Termo:'sofa; com "frase"\nextra'}]);
});

test('imported CSV requires CID verification and prevents duplicates',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-csv-import-'));
 const db=createDb(path.join(dir,'app.sqlite'));
 try {
  const fixture=path.join(dir,'resultado'),prints=path.join(fixture,'prints'),out=path.join(dir,'evidence');
  fs.mkdirSync(prints,{recursive:true});fs.mkdirSync(out,{recursive:true});
  const name='Jares Móveis — Pouso Alegre',cid='d16aefdbdee3d709';
  insertSeed(db,[{unit:name,city:'Pouso Alegre',lat:-22.23,lon:-45.933,cid,terms:[
    {term:'loja de móveis em Pouso Alegre',cluster:'Loja de móveis',priority:'P1'},
    {term:'comprar móveis em Pouso Alegre',cluster:'Loja de móveis',priority:'P1'}]}]);
  const rows=[['loja de móveis em Pouso Alegre',2,'v1'],['comprar móveis em Pouso Alegre',1,'v2']];
  for(const [term,rank,prefix] of rows){
   fs.writeFileSync(path.join(prints,prefix+'.png'),Buffer.from([137,80,78,71,13,10,26,10]));
   const hit={name:'Jares Móveis',url:`https://google.com/maps/place/Teste/data=!4m2!3m1!1s0x0:0x${prefix==='v1'?cid:'deadbeef12345678'}`,promoted:false};
   fs.writeFileSync(path.join(prints,prefix+'_lista.json'),JSON.stringify(prefix==='v1'?[{name:'Outro',url:'https://google.com/maps/place/outro',promoted:false},hit]:[hit]));
  }
  const columns=['Unidade','Cidade','Cluster','Prioridade','Termo','Posição observada','Status','Data/hora','Local de referência','Resultados orgânicos capturados','Busca Maps','Print','Concorrentes até 10'];
  const record=(term,rank,id)=>[name,'Pouso Alegre','Loja de móveis','P1',term,String(rank),'Posição observada','30/10/2026, 11:12:56','-22.23,-45.933','2','https://www.google.com/maps/search/teste',`prints\\${id}.png`,''] .map(v=>'"'+v.replaceAll('"','""')+'"').join(';');
  fs.writeFileSync(path.join(fixture,'MEDICOES_JARES.csv'),columns.map(v=>'"'+v+'"').join(';')+'\n'+record(rows[0][0],2,'v1')+'\n'+record(rows[1][0],1,'v2')+'\n');
  const first=importLegacyJares(db,fixture,out);
  assert.equal(first.imported,2);assert.equal(first.companies[0].verified,1);assert.equal(first.companies[0].review,1);
  assert.equal(importLegacyJares(db,fixture,out).duplicate,true);
  const measurements=db.prepare('SELECT status,position,candidate_position,confidence,screenshot FROM measurements ORDER BY id').all();
  assert.deepEqual(measurements.map(r=>r.status),['VERIFIED','REVIEW']);
  assert.deepEqual(measurements.map(r=>r.position),[2,null]);
  assert.deepEqual(measurements.map(r=>r.candidate_position),[null,1]);
  assert.ok(fs.existsSync(path.join(out,measurements[0].screenshot)));
  const text=buildReport(db,1).text;
  assert.doesNotMatch(text,/PRIMEIROS LUGARES CONFIRMADOS/);
  assert.match(text,/SEGUNDOS LUGARES CONFIRMADOS/);
  assert.match(text,/1 resultados aguardando revisão/);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('database migrates previous v1 database without deleting company data',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-migration-'));
 let db=createDb(path.join(dir,'legacy.sqlite'));
 try{
  db.prepare("INSERT INTO companies(name,city,latitude,longitude) VALUES('Loja A','Cidade',0,0)").run();
  db.exec('ALTER TABLE runs RENAME TO legacy_runs');
  db.exec(`CREATE TABLE runs (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id),status TEXT NOT NULL DEFAULT 'QUEUED',mode TEXT NOT NULL DEFAULT 'all',started_at TEXT,ended_at TEXT,created_at TEXT,total INTEGER NOT NULL DEFAULT 0,completed INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '')`);
  db.exec('DROP TABLE legacy_runs');
  db.close();db=createDb(path.join(dir,'legacy.sqlite'));
  assert.ok(db.prepare('PRAGMA table_info(runs)').all().some(r=>r.name==='source'));
  assert.equal(db.prepare('SELECT COUNT(*) as n FROM companies').get().n,1);
 }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
