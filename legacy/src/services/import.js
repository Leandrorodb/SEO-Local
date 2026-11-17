import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {evaluateObserved} from './measurement.js';

export function parseCsv(text){
  const rows=[];let row=[],value='',quoted=false;
  const input=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(quoted){if(ch==='"' && input[i+1]==='"'){value+='"';i++;}else if(ch==='"')quoted=false;else value+=ch;}
    else if(ch==='"')quoted=true;
    else if(ch===';'){row.push(value);value='';}
    else if(ch==='\r'||ch==='\n'){
      if(ch==='\r'&&input[i+1]==='\n')i++;
      row.push(value);value='';if(row.some(c=>c!==''))rows.push(row);row=[];
    }else value+=ch;
  }
  if(quoted)throw Error('CSV com aspas nao terminadas');
  if(value!==''||row.length){row.push(value);rows.push(row);}
  if(rows.length<2)throw Error('CSV vazio ou sem cabecalho');
  const headers=rows.shift();
  return rows.map((r,index)=>{
    if(r.length!==headers.length)throw Error(`CSV linha ${index+2}: numero de colunas invalido`);
    return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));
  });
}
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
function command(bin,args){return execFileSync(bin,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:90_000,maxBuffer:10*1024*1024});}
function openInput(src){
  const p=path.resolve(src);
  if(!fs.existsSync(p))throw Error('Pasta ou arquivo nao encontrado: '+p);
  if(fs.statSync(p).isDirectory())return {root:p,cleanup:()=>{}};
  if(!p.toLowerCase().endsWith('.zip'))throw Error('Use um arquivo .zip ou a pasta extraida');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-import-'));
  try{
    let names;
    let method='tar';
    try{names=command('tar',['-tf',p]).split(/\r?\n/).filter(Boolean);}catch{
      method='unzip';names=command('unzip',['-Z1',p]).split(/\r?\n/).filter(Boolean);
    }
    if(names.some(name=>/^(?:[\\/]|[a-z]:)/i.test(name)||name.replaceAll('\\','/').split('/').includes('..')))
      throw Error('O ZIP contem caminhos inseguros');
    if(names.length>6000)throw Error('O ZIP contem arquivos demais');
    if(method==='tar')command('tar',['-xf',p,'-C',tmp]);
    else command('unzip',['-oq',p,'-d',tmp]);
    return {root:tmp,cleanup:()=>fs.rmSync(tmp,{recursive:true,force:true})};
  }catch(e){fs.rmSync(tmp,{recursive:true,force:true});throw e;}
}
function findReportDir(root){
  const dirs=[root,path.join(root,'resultado')];
  return dirs.find(d=>fs.existsSync(path.join(d,'MEDICOES_JARES.csv')));
}
function evidencePath(base,relative){
  if(typeof relative!=='string'||!relative.trim())return null;
  const normalized=relative.replaceAll('\\','/');
  const clean=path.normalize(normalized);
  if(path.isAbsolute(clean)||clean.split(path.sep).includes('..')||/^[a-z]:/i.test(clean))throw Error('Caminho de evidencia inseguro');
  const absolute=path.resolve(base,clean);
  if(!absolute.startsWith(base+path.sep))throw Error('Evidencia fora da pasta importada');
  return absolute;
}
function parseBrazilDate(value){
  const m=/^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})$/.exec(value||'');
  if(!m)throw Error('Data da medicao invalida: '+value);
  const [_,day,month,year,hour,min,sec]=m;
  const d=new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}-03:00`);
  if(Number.isNaN(d.getTime()))throw Error('Data invalida: '+value);
  return d.toISOString();
}
/** Import data from the external free Jares measurement script. CID corroboration is required
 * before a row can become VERIFIED, regardless of the reported numerical position. */
export function importLegacyJares(db,source,outputDir){
 const input=openInput(source);const written=[];
 try{
  const root=findReportDir(input.root);
  if(!root)throw Error('Nao encontrei MEDICOES_JARES.csv no ZIP ou pasta');
  const csvBuffer=fs.readFileSync(path.join(root,'MEDICOES_JARES.csv'));
  const digest=crypto.createHash('sha256').update(csvBuffer).digest('hex');
  const existing=db.prepare('SELECT 1 FROM imported_batches WHERE digest=?').get(digest);
  if(existing)return {duplicate:true,imported:0};
  const rows=parseCsv(csvBuffer.toString('utf8'));
  if(rows.length>2000)throw Error('Limite de 2000 buscas por importacao');
  const headers=['Unidade','Cluster','Prioridade','Termo','Posição observada','Status','Data/hora','Busca Maps','Print'];
  if(!rows.every(r=>headers.every(h=>typeof r[h]==='string')))throw Error('O arquivo CSV nao tem o formato esperado');
  const companies=db.prepare('SELECT * FROM companies').all();
  const lookups=new Map(companies.map(c=>[normalize(c.name),c]));
  const groups=new Map();
  for(const r of rows){const key=normalize(r.Unidade);if(!lookups.has(key))throw Error('Empresa nao cadastrada: '+r.Unidade);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);
  }
  const stamp=new Date().toISOString(),summary=[];
  db.exec('BEGIN');
  try{
   for(const [key,items] of groups){
    const company=lookups.get(key),terms=db.prepare('SELECT * FROM terms WHERE company_id=?').all(company.id);
    const termMap=new Map(terms.map(t=>[normalize(t.query),t]));
    const run=Number(db.prepare("INSERT INTO runs(company_id,mode,status,total,completed,created_at,started_at,ended_at,message,source) VALUES(?,'all','COMPLETE',?,?,?,?,?,?,'IMPORT')").run(company.id,items.length,items.length,stamp,stamp,stamp,'Auditoria importada; posicoes validadas por CID onde possivel').lastInsertRowid);
    const dir=path.join(outputDir,`run-${run}`);fs.mkdirSync(dir,{recursive:true});
    let verified=0,review=0;
    for(const row of items){
     const term=termMap.get(normalize(row.Termo));if(!term)throw Error(`Termo nao cadastrado para ${company.name}: ${row.Termo}`);
     if(normalize(term.cluster)!==normalize(row.Cluster))throw Error('Cluster divergente: '+row.Termo);
     const value=row['Posição observada'].trim();const observed=value?Number(value):null;
     if(value && (!Number.isInteger(observed)||observed<1||observed>500))throw Error('Posicao invalida: '+row.Termo);
     const date=parseBrazilDate(row['Data/hora']);
     const url=row['Busca Maps'];if(url && !/^https:\/\/www\.google\.com\/maps\//i.test(url))throw Error('Busca Maps invalida');
     const png=evidencePath(root,row.Print),jsonPath=png?png.replace(/\.png$/i,'_lista.json'):null;
     const results=jsonPath&&fs.existsSync(jsonPath)?JSON.parse(fs.readFileSync(jsonPath,'utf8')):[];
     if(!Array.isArray(results)||results.length>300)throw Error('Lista de resultados invalida');
     const check=evaluateObserved(company,results,results.length>0);
     let status='NO_LIST',position=null,candidate=null,confidence='NONE',note='Importado sem lista de resultados comparavel';
     if(observed!==null){
       if(check.status==='VERIFIED' && check.position===observed){status='VERIFIED';position=observed;confidence='CID';note='Posicao importada e conferida com CID da ficha nos resultados organicos';verified++;}
       else{status='REVIEW';candidate=observed;confidence='CSV_ONLY';note='Posicao observada no CSV ainda nao validada por CID; revisar antes de publicar';review++;}
     } else if(/30 primeiros/i.test(row.Status||'')){status='NOT_FOUND';note='Nao localizada no conjunto limitado de resultados observados';}
     else if(/sem lista/i.test(row.Status||'')){status='NO_LIST';note='A consulta nao retornou lista comparavel';}
     else {status='REVIEW';note='Busca inconclusiva; sem posicao numerica para confirmar';review++;}
     let screenshot='';
     if(png && fs.existsSync(png)){
       if(fs.statSync(png).size>8*1024*1024)throw Error('Print maior que 8MB');
       const safeName=`${term.id}_${path.basename(png).replace(/[^a-zA-Z0-9_.-]/g,'_')}`;
       const target=path.join(dir,safeName);fs.copyFileSync(png,target);written.push(target);screenshot=`run-${run}/${safeName}`;
     }
     db.prepare(`INSERT INTO measurements(run_id,term_id,status,position,candidate_position,confidence,screenshot,search_url,results_json,observed_count,measured_at,review_note)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(run,term.id,status,position,candidate,confidence,screenshot,url,JSON.stringify(results),results.filter(x=>!x.promoted).length,date,note);
    }
    summary.push({company:company.name,runId:run,total:items.length,verified,review});
   }
   db.prepare('INSERT INTO imported_batches(digest,created_at,source_name) VALUES(?,?,?)').run(digest,stamp,path.basename(source).slice(0,200));
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');for(const f of written)try{fs.rmSync(f,{force:true});}catch{}throw e;}
  return {duplicate:false,imported:rows.length,companies:summary};
 }finally{input.cleanup();}
}
