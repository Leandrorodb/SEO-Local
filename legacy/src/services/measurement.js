import fs from 'node:fs';
import path from 'node:path';
import { getCompany, getRun } from '../db.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const normalize=str=>String(str??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const safe=str=>String(str).replace(/[^a-z0-9_\-]/gi,'_').slice(0,60);

export function isDirectCidMatch(company,result){
  const cid=String(company.cid||'').toLowerCase().replace(/^0x/,'');
  if(!cid || !/^[0-9a-f]{8,20}$/.test(cid))return false;
  const link=String(result.url||'').toLowerCase();
  // Target feature ID must be present as full 0x-encoded field, not a substring of a name.
  return link.includes(':0x'+cid) || new RegExp(`(?:[?&]cid=)${BigInt('0x'+cid).toString()}(?:&|$)`).test(link);
}
export function findCandidate(company,results){
  const cidIndex=results.findIndex(x=>isDirectCidMatch(company,x));
  if(cidIndex>=0)return {confidence:'CID', position:cidIndex+1, matched:results[cidIndex]};
  const full=normalize(company.name);
  const short=normalize(company.name.split(/[—|]/)[0]);
  const aliases=[...new Set([full,short])].filter(x=>x.length>=5);
  const matched=results.map((r,i)=>({r,i})).filter(({r})=>{
    const name=normalize(r.name),raw=normalize(r.detail);
    const aliasMatch=aliases.some(a=>name.includes(a));
    const outletWanted=full.includes('outlet');
    return aliasMatch && (outletWanted || !name.includes('outlet')) &&
      (raw.includes(normalize(company.city)) || name.includes(normalize(company.city)));
  });
  // Ambiguous name matches are never promoted to verified ranking automatically.
  if(matched.length===1)return {confidence:'NAME_ONLY',position:matched[0].i+1,matched:matched[0].r};
  return {confidence:'NONE',position:null,matched:null};
}
export function evaluateObserved(company,results,feedLoaded){
  if(!feedLoaded)return {status:'NO_LIST',position:null,candidatePosition:null,confidence:'NONE'};
  const organic=results.filter(x=>!x.promoted);
  const candidate=findCandidate(company,organic);
  if(candidate.confidence==='CID')return {status:'VERIFIED',position:candidate.position,candidatePosition:null,confidence:'CID'};
  if(candidate.confidence==='NAME_ONLY')return {status:'REVIEW',position:null,candidatePosition:candidate.position,confidence:'NAME_ONLY'};
  return {status:organic.length>=20?'NOT_FOUND':'REVIEW',position:null,candidatePosition:null,confidence:'NONE'};
}

async function readCards(page){
  return page.evaluate(()=>{
    const feed=document.querySelector('[role="feed"]');
    if(!feed)return {hasFeed:false,items:[]};
    const nodes=[...feed.querySelectorAll('a.hfpxzc, a[aria-label][href*="/maps/place/"]')];
    const unique=new Map();
    for(const anchor of nodes){
      const container=anchor.closest('div.Nv2PK')||anchor.closest('div[role="article"]')||anchor.parentElement?.parentElement?.parentElement;
      const name=(anchor.getAttribute('aria-label')||container?.querySelector('.qBF1Pd')?.textContent||'').trim();
      const url=anchor.href||'';
      if(!name||!url||unique.has(url))continue;
      const detail=(container?.innerText||'').slice(0,700);
      const promoted=/(^|\n)\s*(patrocinado|anúncio|anuncio|sponsored|ad)\s*(\n|$)/i.test(detail);
      unique.set(url,{name,url,detail,promoted});
    }
    return {hasFeed:true,items:[...unique.values()]};
  });
}

export function makeQueue({db,outputDir,emit=()=>{}}){
  let running=false;
  const queue=[];
  const queued=new Set();
  async function drain(){
    if(running)return;
    running=true;
    while(queue.length){const id=queue.shift();queued.delete(id);try{await execute(id)}catch(e){db.prepare("UPDATE runs SET status='FAILED', ended_at=?, message=? WHERE id=?").run(new Date().toISOString(),String(e.message||e).slice(0,450),id);emit('error',id,e);}}
    running=false;
  }
  function enqueue(id){if(!queued.has(id)){queue.push(id);queued.add(id);void drain();}}
  async function execute(runId){
    const run=getRun(db,runId),company=getCompany(db,run.company_id);
    if(!company)throw Error('Empresa não encontrada');
    const ms=db.prepare(`SELECT m.id, m.term_id, t.query FROM measurements m JOIN terms t ON t.id=m.term_id WHERE m.run_id=? AND m.status='PENDING' ORDER BY m.id`).all(runId);
    db.prepare("UPDATE runs SET status='RUNNING', started_at=?,message='' WHERE id=?").run(new Date().toISOString(),runId);
    let context;
    const dir=path.join(outputDir,'run-'+runId);fs.mkdirSync(dir,{recursive:true});
    try{
      const {chromium}=await import('playwright');
      // Headed Chrome; deliberate low-frequency user-triggered measurements.
      // No fingerprint spoofing, CAPTCHA bypass, proxy rotation or parallel crawling.
      context=await chromium.launchPersistentContext(path.join(outputDir,'browser-profile'),{
        channel:'chrome',headless:false,viewport:{width:1380,height:950},locale:'pt-BR',timezoneId:'America/Sao_Paulo'
      });
      await context.grantPermissions(['geolocation'],{origin:'https://www.google.com'});
      await context.setGeolocation({latitude:company.latitude,longitude:company.longitude,accuracy:150});
      const page=context.pages()[0]||await context.newPage();
      let stopped=false;
      for(const m of ms){
        let status='ERROR',position=null,candidatePosition=null,confidence='NONE',observed=[],screenshot='',url='';
        let reason='';
        try {
          url=`https://www.google.com/maps/search/${encodeURIComponent(m.query)}/@${company.latitude},${company.longitude},15z?hl=pt-BR`;
          await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
          await sleep(2500);
          const accept=page.getByRole('button',{name:/aceitar tudo|accept all/i}).first();
          if(await accept.isVisible().catch(()=>false))await accept.click({timeout:1500}).catch(()=>{});
          const body=(await page.locator('body').innerText({timeout:5000}).catch(()=>''));
          if(/tráfego incomum|unusual traffic|captcha|não sou um robô|verify you are human/i.test(body.slice(0,2500))){
            status='BLOCKED';reason='Google solicitou verificação humana; execução interrompida';stopped=true;
          }else{
            await page.locator('[role="feed"]').waitFor({timeout:11000}).catch(()=>{});
            const initial=await readCards(page);
            if(!initial.hasFeed){status='NO_LIST';reason='Sem lista comparável de resultados';}
            else {
              const seen=new Map();
              for(let scroll=0;scroll<9;scroll++){
                const snap=await readCards(page);
                for(const card of snap.items) if(!seen.has(card.url))seen.set(card.url,card);
                if(seen.size>=25)break;
                await page.locator('[role="feed"]').evaluate(el=>el.scrollBy(0,950)).catch(()=>{});
                await sleep(800);
              }
              observed=[...seen.values()];
              const decision=evaluateObserved(company,observed,true);
              status=decision.status;position=decision.position;candidatePosition=decision.candidatePosition;confidence=decision.confidence;
              if(!observed.length)reason='Não foi possível ler cartões de resultado';
            }
          }
          screenshot=`run-${runId}/${safe(m.id+'_'+m.query)}.png`;
          await page.screenshot({path:path.join(outputDir,screenshot),timeout:15000}).catch(()=>{screenshot='';});
        }catch(e){reason=String(e.message||e).slice(0,250);}
        db.prepare(`UPDATE measurements SET status=?,position=?,candidate_position=?,confidence=?,screenshot=?,search_url=?,results_json=?,observed_count=?,measured_at=?,review_note=? WHERE id=?`)
          .run(status,position,candidatePosition,confidence,screenshot,url,JSON.stringify(observed),observed.filter(x=>!x.promoted).length,new Date().toISOString(),reason,m.id);
        db.prepare('UPDATE runs SET completed=completed+1,message=? WHERE id=?').run(`${m.query}: ${status}`,runId);
        emit('progress',runId,{query:m.query,status});
        if(stopped)break;
        await sleep(4500);
      }
      db.prepare("UPDATE runs SET status=?,ended_at=?,message=? WHERE id=?").run(stopped?'BLOCKED':'COMPLETE',new Date().toISOString(),stopped?'Verificação humana detectada: execução interrompida':'Coleta finalizada; revise resultados pendentes.',runId);
    } finally {if(context)await context.close().catch(()=>{});}
  }
  function recover(){const rows=db.prepare("SELECT id FROM runs WHERE status IN ('QUEUED','RUNNING') ORDER BY id").all();for(const row of rows){db.prepare("UPDATE runs SET status='QUEUED',message='Execução recuperada após reinício' WHERE id=?").run(row.id);enqueue(row.id);}}
  return {enqueue,recover,get running(){return running},get pending(){return queue.length}};
}
