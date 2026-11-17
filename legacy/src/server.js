import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDb,insertSeed,insertAdditionalSeed,getCompany,getRun,getLatestRun,getMeasurements} from './db.js';
import {buildReport,csv} from './services/report.js';
import {makeQueue} from './services/measurement.js';
import {suggestKeywords,listNiches} from './services/keywords.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DATA=process.env.NEXUS_DATA_DIR?path.resolve(process.env.NEXUS_DATA_DIR):path.join(ROOT,'local-data');
const OUTPUT=path.join(DATA,'evidence');
const PORT=Number(process.env.PORT||4177);
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw Error('PORT inválida');
fs.mkdirSync(OUTPUT,{recursive:true});
const db=createDb(path.join(DATA,'nexus.sqlite'));
try{const seed=JSON.parse(fs.readFileSync(path.join(ROOT,'data/jares-seed.json'),'utf8'));insertSeed(db,seed);}catch(e){console.error('Seed indisponível:',e.message);}
try{const extra=JSON.parse(fs.readFileSync(path.join(ROOT,'data/jares-2-unidades.json'),'utf8'));insertAdditionalSeed(db,extra);}catch(e){console.error('Cadastro adicional indisponivel:',e.message);}
const queue=makeQueue({db,outputDir:OUTPUT});
queue.recover();

function send(res,status,data,contentType='application/json; charset=utf-8'){
 res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"});
 res.end(contentType.startsWith('application/json')?JSON.stringify(data):data);
}
function error(res,status,message){send(res,status,{error:message});}
async function parseBody(req){
 let chunks=[],bytes=0;
 for await(const chunk of req){bytes+=chunk.length;if(bytes>1024*1024)throw Object.assign(Error('Payload acima de 1 MB'),{http:413});chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw Object.assign(Error('JSON inválido'),{http:400});}
}
function requiredText(str,max=200){if(typeof str!=='string'||!str.trim()||str.trim().length>max)throw Object.assign(Error('Texto obrigatório ou grande demais'),{http:400});return str.trim();}
function idOf(x){const n=Number(x);if(!Number.isSafeInteger(n)||n<1)throw Object.assign(Error('ID inválido'),{http:400});return n;}
function companyPayload(body){
 const name=requiredText(body.name,160),city=requiredText(body.city,120);
 const latitude=Number(body.latitude),longitude=Number(body.longitude);
 if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw Object.assign(Error('Latitude/longitude inválidas'),{http:400});
 const cid=String(body.cid||'').replace(/^0x/i,'').trim().toLowerCase();
 if(cid&&!/^[0-9a-f]{8,20}$/.test(cid))throw Object.assign(Error('CID deve ser hexadecimal'),{http:400});
 const mapsUrl=String(body.maps_url||'').trim();
 if(mapsUrl && (mapsUrl.length>1500||!/^https:\/\/(www\.)?google\.com\/maps\//i.test(mapsUrl)))throw Object.assign(Error('URL deve ser HTTPS do Google Maps'),{http:400});
 return [name,city,latitude,longitude,cid,mapsUrl];
}
function termPayload(body){
 const query=requiredText(body.query,240),cluster=requiredText(body.cluster||'Geral',90),priority=body.priority||'P2';
 if(!['P1','P2','P3'].includes(priority))throw Object.assign(Error('Prioridade inválida'),{http:400});
 return [query,cluster,priority];
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
function staticFile(res,p){
 const safePath=p==='/'?'/index.html':p;
 const filepath=path.resolve(ROOT,'public','.'+safePath);
 if(!filepath.startsWith(path.join(ROOT,'public')+path.sep))return error(res,403,'Acesso negado');
 try{const stats=fs.statSync(filepath);if(!stats.isFile())return error(res,404,'Não encontrado');const body=fs.readFileSync(filepath);res.writeHead(200,{'Content-Type':mime[path.extname(filepath)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(body);}catch{return error(res,404,'Não encontrado');}
}
async function api(req,res,p,url){
 const method=req.method;
 if(method!=='GET'&&method!=='HEAD'){
   const origin=req.headers.origin;
   if(origin){try{const u=new URL(origin);if(!['localhost','127.0.0.1'].includes(u.hostname)||u.port!==String(PORT))return error(res,403,'Origem não permitida');}catch{return error(res,403,'Origem inválida');}}
 }
 if(method==='GET'&&p==='/api/niches')return send(res,200,listNiches());
 if(method==='POST'&&p==='/api/keywords/suggest'){
   const body=await parseBody(req);const company=getCompany(db,idOf(body.companyId));
   if(!company)return error(res,404,'Empresa não encontrada');
   const products=Array.isArray(body.products)?body.products.slice(0,30):[];
   if(products.some(x=>typeof x!=='string'||x.length>100))return error(res,400,'Lista de produtos inválida');
   return send(res,200,suggestKeywords({city:company.city,niche:String(body.niche||'generico'),products}));
 }
 if(method==='GET'&&p==='/api/health')return send(res,200,{ok:true,version:'1.2.0',queue:{running:queue.running,pending:queue.pending}});
 if(method==='GET'&&p==='/api/companies'){
   const rows=db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM terms t WHERE t.company_id=c.id) term_count,
      (SELECT COUNT(*) FROM terms t WHERE t.company_id=c.id AND t.priority='P1') p1_count,
      (SELECT status FROM runs r WHERE r.company_id=c.id ORDER BY r.id DESC LIMIT 1) last_status,
      (SELECT id FROM runs r WHERE r.company_id=c.id ORDER BY r.id DESC LIMIT 1) last_run_id
      FROM companies c ORDER BY c.id`).all();
   return send(res,200,rows);
 }
 if(method==='GET'&&p==='/api/summary'){
   const companies=db.prepare('SELECT COUNT(*) n FROM companies').get().n;
   const terms=db.prepare('SELECT COUNT(*) n FROM terms').get().n;
   const completed=db.prepare("SELECT COUNT(*) n FROM runs WHERE status='COMPLETE'").get().n;
   const measured=db.prepare("SELECT COUNT(*) n FROM measurements WHERE status='VERIFIED'").get().n;
   const reviews=db.prepare("SELECT COUNT(*) n FROM measurements WHERE status='REVIEW'").get().n;
   const top1=db.prepare("SELECT COUNT(*) n FROM measurements WHERE status='VERIFIED' AND position=1").get().n;
   const recent=db.prepare(`SELECT r.id,r.status,r.total,r.completed,r.created_at,c.name company_name FROM runs r JOIN companies c ON c.id=r.company_id ORDER BY r.id DESC LIMIT 8`).all();
   return send(res,200,{companies,terms,completed,measured,reviews,top1,recent});
 }
 if(method==='POST'&&p==='/api/companies/batch'){
   const body=await parseBody(req);
   if(!Array.isArray(body.companies)||body.companies.length>250)return error(res,400,'Envie até 250 empresas');
   const values=body.companies.map(companyPayload);
   const stmt=db.prepare('INSERT INTO companies(name,city,latitude,longitude,cid,maps_url) VALUES (?,?,?,?,?,?)');
   db.exec('BEGIN');let count=0;
   try{for(const item of values){stmt.run(...item);count++;}db.exec('COMMIT');}
   catch(e){db.exec('ROLLBACK');throw e;}
   return send(res,200,{inserted:count});
 }
 if(method==='POST'&&p==='/api/companies'){
   const fields=companyPayload(await parseBody(req));
   const r=db.prepare('INSERT INTO companies(name,city,latitude,longitude,cid,maps_url) VALUES (?,?,?,?,?,?)').run(...fields);
   return send(res,201,getCompany(db,Number(r.lastInsertRowid)));
 }
 let m=p.match(/^\/api\/companies\/(\d+)$/);
 if(m){const companyId=idOf(m[1]);if(method==='GET')return getCompany(db,companyId)?send(res,200,getCompany(db,companyId)):error(res,404,'Empresa não encontrada');
   if(method==='PUT'){const fields=companyPayload(await parseBody(req));const info=db.prepare('UPDATE companies SET name=?,city=?,latitude=?,longitude=?,cid=?,maps_url=? WHERE id=?').run(...fields,companyId);return info.changes?send(res,200,getCompany(db,companyId)):error(res,404,'Empresa não encontrada');}}
 m=p.match(/^\/api\/companies\/(\d+)\/terms$/);
 if(m){const companyId=idOf(m[1]);if(!getCompany(db,companyId))return error(res,404,'Empresa não encontrada');
   if(method==='GET')return send(res,200,db.prepare('SELECT * FROM terms WHERE company_id=? ORDER BY priority,cluster,query').all(companyId));
   if(method==='POST'){
     const fields=termPayload(await parseBody(req));
     try{const result=db.prepare('INSERT INTO terms(company_id,query,cluster,priority) VALUES(?,?,?,?)').run(companyId,...fields);return send(res,201,db.prepare('SELECT * FROM terms WHERE id=?').get(Number(result.lastInsertRowid)));}
     catch(e){if(e.message.includes('UNIQUE'))return error(res,409,'Termo já cadastrado');throw e;}
   }
 }
 m=p.match(/^\/api\/companies\/(\d+)\/terms\/batch$/);
 if(m&&method==='POST'){
   const id=idOf(m[1]);if(!getCompany(db,id))return error(res,404,'Empresa não encontrada');
   const body=await parseBody(req);if(!Array.isArray(body.terms)||body.terms.length>500) return error(res,400,'Envie até 500 termos');
   const terms=body.terms.map(termPayload);
   const stmt=db.prepare('INSERT OR IGNORE INTO terms(company_id,query,cluster,priority) VALUES(?,?,?,?)');let inserted=0;
   db.exec('BEGIN');try{for(const t of terms)inserted+=Number(stmt.run(id,...t).changes);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
   return send(res,200,{inserted,submitted:terms.length});
 }
 m=p.match(/^\/api\/terms\/(\d+)$/);
 if(m&&method==='DELETE'){
   const info=db.prepare('DELETE FROM terms WHERE id=?').run(idOf(m[1]));return send(res,200,{deleted:info.changes>0});
 }
 m=p.match(/^\/api\/companies\/(\d+)\/runs$/);
 if(m){const id=idOf(m[1]);if(!getCompany(db,id))return error(res,404,'Empresa não encontrada');
   if(method==='GET')return send(res,200,db.prepare('SELECT * FROM runs WHERE company_id=? ORDER BY id DESC LIMIT 40').all(id));
   if(method==='POST'){
     const body=await parseBody(req),mode=body.mode||'priority';
     if(!['priority','all'].includes(mode))return error(res,400,'Modo inválido');
     const active=db.prepare("SELECT id FROM runs WHERE company_id=? AND status IN ('QUEUED','RUNNING')").get(id);
     if(active)return error(res,409,'Já existe medição pendente para essa empresa');
     const terms=db.prepare(mode==='priority'?"SELECT id FROM terms WHERE company_id=? AND priority='P1' ORDER BY cluster,query":"SELECT id FROM terms WHERE company_id=? ORDER BY priority,cluster,query").all(id);
     if(!terms.length)return error(res,400,'Nenhuma pesquisa cadastrada para o modo selecionado');
     const insert=db.prepare('INSERT INTO runs(company_id,mode,total) VALUES(?,?,?)');const add=db.prepare('INSERT INTO measurements(run_id,term_id) VALUES(?,?)');let runId;
     db.exec('BEGIN');try{runId=Number(insert.run(id,mode,terms.length).lastInsertRowid);for(const t of terms)add.run(runId,t.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
     queue.enqueue(runId);return send(res,202,{runId,status:'QUEUED',terms:terms.length});
   }
 }
 m=p.match(/^\/api\/runs\/(\d+)$/);
 if(m&&method==='GET'){const run=getRun(db,idOf(m[1]));return run?send(res,200,{...run,measurements:getMeasurements(db,run.id)}):error(res,404,'Execução não encontrada');}
 m=p.match(/^\/api\/companies\/(\d+)\/feedback$/);
 if(m&&method==='GET'){const report=buildReport(db,idOf(m[1]));return report?send(res,200,{...report,measurements:undefined}):error(res,404,'Empresa não encontrada');}
 m=p.match(/^\/api\/companies\/(\d+)\/export$/);
 if(m&&method==='GET'){const company=getCompany(db,idOf(m[1]));if(!company)return error(res,404,'Empresa não encontrada');const run=getLatestRun(db,company.id);const rows=run?getMeasurements(db,run.id):[];res.setHeader('Content-Disposition',`attachment; filename="ranking_empresa_${company.id}.csv"`);return send(res,200,csv(rows),'text/csv; charset=utf-8');}
 m=p.match(/^\/api\/measurements\/(\d+)\/review$/);
 if(m&&method==='POST'){
   const id=idOf(m[1]);const row=db.prepare('SELECT * FROM measurements WHERE id=?').get(id);if(!row)return error(res,404,'Medição não encontrada');
   const body=await parseBody(req);if(!['confirm','reject'].includes(body.decision))return error(res,400,'Decisão inválida');
   if(!['REVIEW','VERIFIED'].includes(row.status))return error(res,400,'Somente resultados encontrados podem ser revisados');
   if(body.decision==='confirm'&&(!row.candidate_position&&!row.position))return error(res,400,'Não há posição candidata para confirmar');
   const note=String(body.note||'').slice(0,500);
   if(body.decision==='confirm')db.prepare("UPDATE measurements SET status='VERIFIED',position=?,candidate_position=NULL,confidence='HUMAN_REVIEW',review_note=? WHERE id=?").run(row.candidate_position||row.position,note,id);
   else db.prepare("UPDATE measurements SET status='REJECTED',position=NULL,candidate_position=NULL,review_note=? WHERE id=?").run(note,id);
   return send(res,200,{ok:true});
 }
 m=p.match(/^\/api\/measurements\/(\d+)\/evidence$/);
 if(m&&method==='GET'){
   const row=db.prepare('SELECT screenshot FROM measurements WHERE id=?').get(idOf(m[1]));
   if(!row||!row.screenshot)return error(res,404,'Print indisponível');
   const filepath=path.resolve(OUTPUT,row.screenshot);
   if(!filepath.startsWith(OUTPUT+path.sep)||!fs.existsSync(filepath))return error(res,404,'Print indisponível');
   const bytes=fs.readFileSync(filepath);res.writeHead(200,{'Content-Type':'image/png','Content-Length':bytes.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(bytes);
 }
 return error(res,404,'Rota não encontrada');
}
const server=http.createServer(async(req,res)=>{
 try{
   const url=new URL(req.url||'/',`http://127.0.0.1:${PORT}`);
   if(url.pathname.startsWith('/api/'))return await api(req,res,url.pathname,url);
   if(req.method==='GET')return staticFile(res,url.pathname);
   return error(res,405,'Método não permitido');
 }catch(e){console.error(e);return error(res,e.http||500,e.http?e.message:'Erro interno');}
});
// Binding exclusively to localhost means no remote access by default.
server.listen(PORT,'127.0.0.1',()=>console.log(`\nNEXUS LOCAL RANK TRACKER iniciado em http://127.0.0.1:${PORT}\nBanco e evidências: ${DATA}\n`));
process.on('SIGINT',()=>{server.close(()=>{db.close();process.exit(0);});});
