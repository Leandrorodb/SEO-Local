import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createDb,insertSeed,insertAdditionalSeed} from '../src/db.js';
import {importLegacyJares} from '../src/services/import.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=process.argv[2]||path.join(root,'resultado.zip');
const data=process.env.NEXUS_DATA_DIR?path.resolve(process.env.NEXUS_DATA_DIR):path.join(root,'local-data');
fs.mkdirSync(path.join(data,'evidence'),{recursive:true});
const db=createDb(path.join(data,'nexus.sqlite'));
try {
 const seed=JSON.parse(fs.readFileSync(path.join(root,'data/jares-seed.json'),'utf8'));
 insertSeed(db,seed);
 const extra=JSON.parse(fs.readFileSync(path.join(root,'data/jares-2-unidades.json'),'utf8'));
 insertAdditionalSeed(db,extra);
 const result=importLegacyJares(db,input,path.join(data,'evidence'));
 console.log('\nNEXUS — IMPORTACAO DE MEDICOES\n');
 if(result.duplicate)console.log('Este arquivo ja foi importado. Nenhuma medicao duplicada.');
 else{
  for(const c of result.companies)console.log(`${c.company}: ${c.total} termos | ${c.verified} confirmados por CID | ${c.review} para revisar | execucao #${c.runId}`);
  console.log(`\n${result.imported} registros importados. Abra o sistema normalmente para consultar os rankings.`);
 }
}catch(e){console.error('FALHA NA IMPORTACAO:',e.message);process.exitCode=1;
}finally{db.close();}
