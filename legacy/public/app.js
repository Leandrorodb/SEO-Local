const state={view:'overview',companies:[],summary:null,selectedId:null,selectedRunId:null,terms:[],runs:[],run:null,previousRun:null,report:null,filter:'',polling:false};
const $=(sel,root=document)=>root.querySelector(sel);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeHtml;
const number=n=>new Intl.NumberFormat('pt-BR').format(Number(n||0));
const today=()=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'long'}).format(new Date());
const time=iso=>{if(!iso)return '—';const d=new Date(iso.endsWith('Z')?iso:iso.replace(' ','T')+'Z');return Number.isNaN(d.valueOf())?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});};
const $content=$('#content');
async function request(endpoint,options={}){
 const res=await fetch(endpoint,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
 const data=await res.json().catch(()=>({error:'Resposta inválida'}));
 if(!res.ok)throw Error(data.error||`Erro HTTP ${res.status}`);
 return data;
}
let toastTimer;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4400);}
async function reload(){
 const [companies,summary]=await Promise.all([request('/api/companies'),request('/api/summary')]);
 state.companies=companies;state.summary=summary;
 if(!state.selectedId && companies[0])state.selectedId=companies[0].id;
 if(state.selectedId && !companies.some(x=>x.id===state.selectedId))state.selectedId=companies[0]?.id||null;
 $('#nav-count').textContent=companies.length;
 await loadSelected();
 render();
}
async function loadSelected(){
 if(!state.selectedId){state.terms=[];state.runs=[];state.run=null;state.previousRun=null;state.report=null;return;}
 const id=state.selectedId;
 const [terms,runs,report]=await Promise.all([
  request(`/api/companies/${id}/terms`),request(`/api/companies/${id}/runs`),request(`/api/companies/${id}/feedback`)]);
 state.terms=terms;state.runs=runs;state.report=report;
 if(!runs.some(r=>r.id===state.selectedRunId))state.selectedRunId=runs[0]?.id||null;
 const selectedIndex=runs.findIndex(r=>r.id===state.selectedRunId);
 const prior=selectedIndex>=0?runs[selectedIndex+1]:null;
 const [current,previous]=await Promise.all([
   state.selectedRunId?request(`/api/runs/${state.selectedRunId}`):Promise.resolve(null),
   prior?request(`/api/runs/${prior.id}`):Promise.resolve(null)
 ]);
 state.run=current;state.previousRun=previous;
}
function getSelected(){return state.companies.find(c=>c.id===state.selectedId);}
function badge(status){
 if(!status)return '<span class="pill">Sem medição</span>';
 const labels={QUEUED:'Na fila',RUNNING:'Em execução',COMPLETE:'Coleta finalizada',BLOCKED:'Interrompida',FAILED:'Falhou',VERIFIED:'Confirmado',REVIEW:'Revisar',NO_LIST:'Sem lista',NOT_FOUND:'Não localizado',ERROR:'Erro',PENDING:'Pendente',REJECTED:'Rejeitado'};
 const color={COMPLETE:'good',VERIFIED:'good',RUNNING:'running',QUEUED:'running',REVIEW:'warning',BLOCKED:'error',FAILED:'error',ERROR:'error'};
 return `<span class="pill ${color[status]||''}">${esc(labels[status]||status)}</span>`;
}
function header(kicker,title,description,actions=''){
 return `<div class="page-header"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="page-actions">${actions}</div></div>`;
}
function stat(icon,title,value,note){return `<div class="panel stat"><div class="stat-icon">${icon}</div><div class="stat-label">${esc(title)}</div><div class="stat-number">${number(value)}</div><div class="stat-note">${esc(note)}</div></div>`;}
function initials(name){return name.split(/[ —-]+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('').slice(0,2);}
function companySelector(){return `<select class="field" id="company-select" aria-label="Selecionar empresa">${state.companies.map(c=>`<option value="${c.id}" ${c.id===state.selectedId?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`;}
function overview(){
 const s=state.summary;
 const companyCards=state.companies.slice(0,6).map(c=>`<div class="company-row"><div class="company-monogram">${esc(initials(c.name))}</div><div class="company-detail"><strong>${esc(c.name)}</strong><span>${esc(c.city)} · ${c.term_count} termos cadastrados</span></div>${badge(c.last_status)}<button class="action-link" data-action="choose" data-id="${c.id}">Abrir ↗</button></div>`).join('');
 const recent=s.recent.map(r=>`<div class="activity-row"><div class="activity-mark">◎</div><div class="activity-text"><strong>${esc(r.company_name)}</strong><p>${badge(r.status)} · ${r.completed}/${r.total} termos · ${time(r.created_at)}</p></div></div>`).join('');
 return header('INTELIGÊNCIA LOCAL','Visão geral da operação','Medições, oportunidades e relatórios da carteira em um único lugar.',`<button class="btn btn-secondary" data-action="new-company">＋ Cadastrar empresa</button><button class="btn btn-primary" data-action="nav" data-view="measurements">◎ Iniciar medição</button>`)+
 `<section class="stats">${stat('▣','Empresas cadastradas',s.companies,'Fichas monitoradas')}${stat('⌕','Palavras-chave',s.terms,'Termos por cidade e cluster')}${stat('🏆','Posições confirmadas',s.measured,'Com evidência ou revisão humana')}${stat('◷','Aguardando revisão',s.reviews,'Não são anunciadas como conquista')}</section>
 <section class="dashboard-grid"><div class="panel panel-pad"><div class="panel-header"><div><h2>Carteira monitorada</h2><small>Seus perfis cadastrados</small></div><button class="action-link" data-action="nav" data-view="companies">Ver todas →</button></div><div class="company-list">${companyCards||empty('Nenhuma empresa cadastrada','Cadastre sua primeira ficha para começar.')}</div></div><div class="panel panel-pad"><div class="panel-header"><div><h2>Atividade recente</h2><small>Histórico de execuções</small></div></div><div class="activity">${recent||empty('Sem medições ainda','Os registros aparecerão conforme você executar pesquisas.')}</div></div></section>
 <div class="panel info-panel"><div class="info-symbol">✦</div><div><h3>Resultados auditáveis, sem rankings inventados.</h3><p>O sistema diferencia posições identificadas pelo ID da ficha, possíveis correspondências a revisar e buscas sem lista comparável. As posições dependem da localização configurada e da sessão do Google Maps. O sistema não usa IA nem paga por consulta.</p></div></div>`;
}
function empty(title,description){return `<div class="empty"><div class="empty-icon">◇</div><strong>${esc(title)}</strong><span>${esc(description)}</span></div>`;}
function companies(){
 const rows=state.companies.filter(c=>`${c.name} ${c.city}`.toLowerCase().includes(state.filter.toLowerCase()));
 return header('GESTÃO DE CARTEIRA','Empresas e fichas','Cadastre perfis, organize seus clusters e acompanhe as pesquisas.',`<button class="btn btn-secondary" data-action="companies-batch">⇩ Importar empresas</button><button class="btn btn-primary" data-action="new-company">＋ Nova empresa</button>`)+
 `<div class="toolbar"><input class="search" id="filter-companies" type="search" value="${esc(state.filter)}" placeholder="Buscar empresa ou cidade…" aria-label="Filtrar empresas"/><span class="subtle-label">${state.companies.length} EMPRESAS NO SISTEMA</span></div>
 <div class="panel panel-pad"><div class="table-scroll"><table class="data-table"><thead><tr><th>Empresa</th><th>Localidade</th><th>Termos</th><th>Prioridade P1</th><th>Última coleta</th><th></th></tr></thead><tbody>${rows.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.city)}</td><td>${c.term_count}</td><td>${c.p1_count}</td><td>${badge(c.last_status)}</td><td><button class="action-link" data-action="choose" data-id="${c.id}">Gerenciar →</button></td></tr>`).join('')}</tbody></table></div>${rows.length?'':empty('Nenhuma empresa encontrada','Tente outro nome ou cidade.')}</div>`;
}
function measurements(){
 const company=getSelected(),r=state.run;
 if(!company)return header('MEDIÇÃO LOCAL','Auditoria de ranking','Cadastre primeiro uma empresa.','<button class="btn btn-primary" data-action="new-company">Cadastrar empresa</button>');
 const rows=r?.measurements||[];
 const prevMap=new Map((state.previousRun?.measurements||[]).map(m=>[m.term_id,m]));
 const variation=x=>{const prev=prevMap.get(x.term_id);if(!prev||x.status!=='VERIFIED'||prev.status!=='VERIFIED'||!x.position||!prev.position)return '<span class="text-muted">—</span>';const diff=prev.position-x.position;return diff>0?`<span style="color:#14846d;font-weight:800">↑ ${diff}</span>`:diff<0?`<span style="color:#bb6753;font-weight:800">↓ ${-diff}</span>`:'<span class="text-muted">=</span>';};
 const verified=rows.filter(x=>x.status==='VERIFIED');
 const review=rows.filter(x=>x.status==='REVIEW');
 const first=verified.filter(x=>x.position===1).length;
 const top3=verified.filter(x=>x.position<=3).length;
 const progress=r?Math.round(100*r.completed/Math.max(1,r.total)):0;
 const statusPill=r?badge(r.status):'';
 return header('AUDITORIA EM CAMPO','Medição de posições',`Pesquise a partir do ponto de referência de ${company.city} com registros e evidências.`,`<button class="btn btn-secondary" data-action="company-edit">Editar ficha</button><button class="btn btn-primary" data-action="run-start">▶ Medir pesquisas</button>`)+
 `<div class="detail-grid mb-20"><div class="panel panel-pad"><div class="panel-header"><div><h2>Ficha selecionada</h2><small>Identificação do perfil e região da consulta</small></div></div><div class="field-group"><label for="company-select">Empresa / Unidade</label>${companySelector()}</div><div class="kv"><div><span>Localidade</span><strong>${esc(company.city)}</strong></div><div><span>Ponto geográfico</span><strong>${company.latitude.toFixed(4)}, ${company.longitude.toFixed(4)}</strong></div><div><span>Termos cadastrados</span><strong>${state.terms.length}</strong></div><div><span>Identificador de ficha (CID)</span><strong>${esc(company.cid||'Não informado')}</strong></div></div><div class="flexline mt-20"><button class="btn btn-sm btn-secondary" data-action="term-add">＋ Adicionar termo</button><button class="btn btn-sm btn-secondary" data-action="term-batch">⇩ Importar termos</button><button class="btn btn-sm btn-muted" data-action="keywords-suggest">✦ Gerar clusters</button></div></div>
 <div class="panel panel-pad"><div class="panel-header"><div><h2>Última coleta</h2><small>Somente resultados com posição comprovada</small></div>${statusPill}</div>
 <div class="metric-mini"><div class="mini"><strong>${first}</strong><span>🥇 Primeiros lugares</span></div><div class="mini"><strong>${top3}</strong><span>Termos no Top 3</span></div><div class="mini"><strong>${review.length}</strong><span>Para revisar</span></div></div>
 <div class="mt-20">${r?`<div class="flexline"><strong style="font-size:12px">Execução #${r.id}</strong><span class="run-status">${r.completed}/${r.total} pesquisas · ${time(r.created_at)}</span></div><div class="run-progress"><div style="width:${progress}%"></div></div><div class="run-status">${esc(r.message||'Coleta em andamento')} · ${progress}%${r.source==='IMPORT'?' · Importado do resultado.zip':''}</div>`:empty('Sem medições ainda','Execute uma coleta para visualizar os primeiros resultados.')}</div></div></div>
 <div class="panel panel-pad"><div class="panel-header"><div><h2>${r?'Resultados da última medição':'Pesquisas preparadas'}</h2><small>${r?`${rows.length} pesquisas na execução #${r.id}`:`${state.terms.length} termos aguardando medição`}</small></div>${r?`<button class="btn btn-secondary btn-sm" data-action="csv-export">↓ Exportar CSV</button>`:''}</div>
 <div class="table-scroll"><table class="data-table"><thead><tr><th>Pesquisa</th><th>Cluster</th><th>Prioridade</th><th>Posição</th><th>Variação</th><th>Resultado</th><th>Verificação</th></tr></thead><tbody>${(r?rows:state.terms).map(x=>`<tr><td><strong>${esc(x.query)}</strong></td><td>${esc(x.cluster)}</td><td><span class="tag">${esc(x.priority)}</span></td><td><strong>${r?(x.position?`${x.position}º`:x.candidate_position?`${x.candidate_position}º ?`:'—'):'—'}</strong></td><td>${r?variation(x):'—'}</td><td>${r?badge(x.status):'<span class="result-status">Não medido</span>'}</td><td>${r?`<button class="action-link" data-action="result-detail" data-id="${x.id}">Ver evidência ↗</button>`:`<button class="action-link" data-action="term-delete" data-id="${x.id}">Excluir</button>`}</td></tr>`).join('')}</tbody></table></div>${!(r?rows:state.terms).length?empty('Sem termos cadastrados','Adicione pesquisas e clusters para medir.') : ''}</div>
 ${state.runs.length?`<div class="panel panel-pad mt-20"><div class="panel-header"><div><h2>Histórico de auditorias</h2><small>Selecione execuções anteriores para comparar as posições verificadas.</small></div></div><div class="flexline">${state.runs.map(item=>`<button class="btn btn-sm ${item.id===state.selectedRunId?'btn-primary':'btn-secondary'}" data-action="run-select" data-id="${item.id}">#${item.id} · ${time(item.created_at)} · ${item.completed}/${item.total}${item.source==='IMPORT'?' · Importado':''}</button>`).join('')}</div></div>`:''}
 <div class="notice mt-20"><strong>Importante:</strong> a ferramenta usa um Chrome visível com consultas sequenciais, sem burlar verificações humanas. Uma execução pode precisar de validação manual, e resultados em lista patrocinada não devem contar como posição orgânica. Coordenadas são um ponto de referência, não uma grade geográfica.</div>`;
}
function reports(){
 const c=getSelected(),rep=state.report;
 if(!c)return header('COMUNICAÇÃO','Feedbacks para clientes','Cadastre uma empresa para preparar sua mensagem.');
 return header('COMUNICAÇÃO COM EVIDÊNCIAS','Feedback para WhatsApp','Uma mensagem profissional, construída exclusivamente com as colocações confirmadas.',`<button class="btn btn-secondary" data-action="nav" data-view="measurements">Ver medições</button><button class="btn btn-primary" data-action="copy-feedback">▣ Copiar feedback</button>`)+
 `<div class="detail-grid"><div class="panel panel-pad"><div class="panel-header"><div><h2>Prévia da mensagem</h2><small>Pronta para copiar após validar os resultados</small></div></div><div class="field-group"><label for="company-select">Empresa / Unidade</label>${companySelector()}</div><div class="report-box" id="report-text">${esc(rep?.text||'')}</div><div class="flexline mt-16"><button class="btn btn-primary" data-action="copy-feedback">▣ Copiar para WhatsApp</button><button class="btn btn-secondary" data-action="csv-export">↓ Baixar medições</button></div></div><div class="panel panel-pad"><div class="panel-header"><div><h2>Qualidade da evidência</h2><small>Critérios que protegem sua entrega</small></div></div><div class="metric-mini"><div class="mini"><strong>${rep?.verifiedCount||0}</strong><span>Colocações confirmadas</span></div><div class="mini"><strong>${rep?.reviewCount||0}</strong><span>Em conferência</span></div></div><hr class="sep"/><div class="activity"><div class="activity-row"><div class="activity-mark">✓</div><div class="activity-text"><strong>ID do perfil confirmado ou revisão humana</strong><p>Esses termos podem aparecer como posições no feedback.</p></div></div><div class="activity-row"><div class="activity-mark">◎</div><div class="activity-text"><strong>Correspondência pelo nome exige revisão</strong><p>Nunca anunciamos um 1º lugar por similaridade apenas.</p></div></div><div class="activity-row"><div class="activity-mark">↗</div><div class="activity-text"><strong>Localização e momento fazem diferença</strong><p>O feedback informa que as posições são observações, não garantias municipais.</p></div></div></div></div></div>`;
}
function render(){
 const names={overview:'Visão geral',companies:'Empresas',measurements:'Medições',reports:'Feedbacks'};
 $('#crumb').textContent=names[state.view]||'';
 $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===state.view));
 $content.innerHTML=({overview,companies,measurements,reports}[state.view]||overview)();
}
function $$(sel){return [...document.querySelectorAll(sel)];}
function navigate(view){state.view=view;state.filter='';$('#sidebar').classList.remove('open');render();}
function modal(title,content){$('#modal-title').textContent=title;$('#modal-body').innerHTML=content;$('#modal-backdrop').classList.remove('hidden');}
function closeModal(){$('#modal-backdrop').classList.add('hidden');}
function companyForm(existing){const c=existing||{};modal(existing?'Editar empresa':'Cadastrar empresa',`<form id="company-form"><div class="field-group"><label>Nome da empresa / Unidade</label><input required maxlength="160" class="field" name="name" value="${esc(c.name||'')}" placeholder="Ex.: Jares Móveis — Lavras"/></div><div class="field-group"><label>Cidade</label><input required maxlength="120" class="field" name="city" value="${esc(c.city||'')}" placeholder="Ex.: Lavras, MG"/></div><div class="field-grid"><div class="field-group"><label>Latitude</label><input required type="number" step="any" class="field" name="latitude" value="${c.latitude??''}" placeholder="-21.245"/></div><div class="field-group"><label>Longitude</label><input required type="number" step="any" class="field" name="longitude" value="${c.longitude??''}" placeholder="-45.00"/></div></div><div class="field-group"><label>CID (ID hexadecimal, se conhecido)</label><input class="field" name="cid" value="${esc(c.cid||'')}" placeholder="Ex.: d16aefdbdee3d709"/></div><div class="field-group"><label>Link da ficha no Google Maps (opcional)</label><input class="field" name="maps_url" value="${esc(c.maps_url||'')}" placeholder="https://www.google.com/maps/place/..."/></div><p class="fine-print">O identificador específico da ficha evita confundir unidades com nomes semelhantes. Sem ele, as posições encontradas precisarão de confirmação manual.</p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="modal-close">Cancelar</button><button type="submit" class="btn btn-primary">Salvar empresa</button></div></form>`);
 $('#company-form').onsubmit=async event=>{event.preventDefault();const b=Object.fromEntries(new FormData(event.target).entries());try{await request(existing?`/api/companies/${existing.id}`:'/api/companies',{method:existing?'PUT':'POST',body:JSON.stringify(b)});closeModal();toast('Empresa salva!');await reload();}catch(e){toast(e.message)}};
}
function batchCompanies(){
 modal('Importar várias empresas',`<p class="fine-print">Cole uma empresa por linha, separando as colunas por ponto e vírgula: <strong>nome;cidade;latitude;longitude;CID</strong>. CID é opcional. Informe as coordenadas da região de pesquisa em cada cidade. Revise as unidades antes de medir.</p><form id="companies-batch-form"><div class="field-group"><textarea required name="bulk" placeholder="Loja Exemplo;Três Corações;-21.7;-45.26;abcde1234567890f\nLoja 2;Lavras;-21.25;-44.99;"></textarea></div><div class="modal-actions"><button class="btn btn-secondary" type="button" data-action="modal-close">Cancelar</button><button class="btn btn-primary" type="submit">Importar</button></div></form>`);
 $('#companies-batch-form').onsubmit=async e=>{e.preventDefault();const lines=new FormData(e.target).get('bulk').trim().split(/\r?\n/);
  const companies=lines.map(line=>{const [name,city,latitude,longitude,cid='']=line.split(';');return {name:name?.trim(),city:city?.trim(),latitude,longitude,cid:cid.trim()};});
  try{const result=await request('/api/companies/batch',{method:'POST',body:JSON.stringify({companies})});closeModal();toast(`${result.inserted} empresas importadas.`);await reload();}catch(err){toast(err.message)}
 };
}
function termForm(){modal('Adicionar pesquisa',`<form id="term-form"><div class="field-group"><label>Pesquisa comercial exata</label><input class="field" required maxlength="240" name="query" placeholder="loja de móveis em Três Corações"/></div><div class="field-group"><label>Cluster</label><input class="field" required name="cluster" value="Loja de móveis"/></div><div class="field-group"><label>Prioridade</label><select name="priority" class="field"><option value="P1">P1 — Principal</option><option value="P2">P2 — Secundária</option><option value="P3">P3 — Exploratória</option></select></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="modal-close">Cancelar</button><button type="submit" class="btn btn-primary">Adicionar pesquisa</button></div></form>`);
 $('#term-form').onsubmit=async e=>{e.preventDefault();try{await request(`/api/companies/${state.selectedId}/terms`,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target).entries()))});closeModal();toast('Termo cadastrado.');await reload();}catch(err){toast(err.message);}};
}
function batchForm(){modal('Importar termos em lote',`<p class="fine-print">Cole uma pesquisa por linha no formato <strong>termo;cluster;prioridade</strong>. Exemplo: <code>sofás em Lavras;Sofás;P1</code>. As duplicatas serão ignoradas.</p><form id="batch-form"><div class="field-group"><textarea name="bulk" required placeholder="loja de móveis em Lavras;Loja de móveis;P1\nsofas em Lavras;Sofás;P2"></textarea></div><div class="modal-actions"><button class="btn btn-secondary" type="button" data-action="modal-close">Cancelar</button><button class="btn btn-primary" type="submit">Importar pesquisas</button></div></form>`);
 $('#batch-form').onsubmit=async e=>{e.preventDefault();const content=new FormData(e.target).get('bulk');const terms=content.trim().split(/\r?\n/).map(l=>{const [query,cluster='Geral',priority='P2']=l.split(';');return {query:query.trim(),cluster:cluster.trim(),priority:priority.trim().toUpperCase()};});try{const r=await request(`/api/companies/${state.selectedId}/terms/batch`,{method:'POST',body:JSON.stringify({terms})});toast(`${r.inserted} termos importados.`);closeModal();await reload();}catch(err){toast(err.message)}};
}
async function keywordsSuggest(){
 const niches=await request('/api/niches');
 modal('Gerador de clusters sem IA',`<p class="fine-print">Selecione um segmento e descreva apenas produtos ou serviços efetivamente oferecidos pela empresa. O gerador cria <strong>sugestões de pesquisa, não medições</strong>. Revise o catálogo antes de importar.</p><form id="suggest-form"><div class="field-group"><label>Nicho principal</label><select class="field" name="niche">${niches.map(n=>`<option value="${esc(n.value)}">${esc(n.title)}</option>`).join('')}</select></div><div class="field-group"><label>Produtos ou serviços reais (separados por vírgula)</label><textarea name="products" placeholder="Ex.: sofás retráteis, colchões, mesas de jantar"></textarea></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="modal-close">Cancelar</button><button type="submit" class="btn btn-primary">Gerar sugestões</button></div></form><div id="suggest-results"></div>`);
 $('#suggest-form').onsubmit=async e=>{
  e.preventDefault();
  const data=Object.fromEntries(new FormData(e.target).entries());
  try{
   const terms=await request('/api/keywords/suggest',{method:'POST',body:JSON.stringify({companyId:state.selectedId,niche:data.niche,products:data.products.split(',').map(x=>x.trim()).filter(Boolean)})});
   const container=$('#suggest-results');
   container.innerHTML=`<hr class="sep"/><h3 style="font-size:14px">${terms.length} sugestões geradas</h3><p class="fine-print">Desmarque termos incompatíveis com o catálogo da empresa. Duplicatas existentes serão ignoradas.</p><div style="max-height:260px;overflow:auto">${terms.map((t,i)=>`<label style="display:flex;gap:9px;align-items:start;padding:9px;border-bottom:1px solid #edf0f0;font-size:12px"><input type="checkbox" data-keyword-index="${i}" checked/><span><strong>${esc(t.query)}</strong><small style="display:block;color:#799097">${esc(t.cluster)} · ${esc(t.priority)}</small></span></label>`).join('')}</div><div class="modal-actions"><button id="import-suggestions" class="btn btn-primary">Importar selecionados</button></div>`;
   $('#import-suggestions').onclick=async()=>{
    const selected=[...container.querySelectorAll('[data-keyword-index]:checked')].map(c=>terms[Number(c.dataset.keywordIndex)]);
    try{const outcome=await request(`/api/companies/${state.selectedId}/terms/batch`,{method:'POST',body:JSON.stringify({terms:selected})});closeModal();toast(`${outcome.inserted} termos importados.`);await reload();}catch(e){toast(e.message)}
   };
  }catch(err){toast(err.message)}
 };
}
function runStart(){const c=getSelected();if(!c)return;modal('Iniciar medição no Google Maps',`<div class="notice"><strong>Antes de começar:</strong> confirme a cidade, as coordenadas e o CID da ficha. O Chrome será aberto na sua máquina. Não feche a janela durante a coleta. O Google pode solicitar verificação humana; o sistema interromperá a execução nesse caso.</div><form id="run-form"><div class="field-group mt-20"><label>Escopo da coleta</label><select class="field" name="mode"><option value="priority">Prioridade P1 — ${state.terms.filter(t=>t.priority==='P1').length} termos</option><option value="all">Todos os termos — ${state.terms.length}</option></select></div><div class="modal-actions"><button class="btn btn-secondary" type="button" data-action="modal-close">Cancelar</button><button class="btn btn-primary" type="submit">▶ Iniciar agora</button></div></form>`);
 $('#run-form').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target).entries());try{const r=await request(`/api/companies/${state.selectedId}/runs`,{method:'POST',body:JSON.stringify(b)});closeModal();toast(`Medição #${r.runId} iniciada. Chrome será aberto.`);await reload();navigate('measurements');}catch(err){toast(err.message)}};
}
function resultDetail(id){const r=state.run?.measurements.find(x=>x.id===id);if(!r)return;
 const results=r.results_json||[];
 const list=results.filter(x=>!x.promoted).slice(0,25).map((x,i)=>`<div style="padding:10px 0;border-bottom:1px solid #ebefee"><strong>${i+1}º — ${esc(x.name)}</strong><div class="fine-print">${esc((x.detail||'').slice(0,150))}</div></div>`).join('');
 modal('Evidência da medição',`<p style="font-size:13px"><strong>${esc(r.query)}</strong></p><div class="flexline mb-20">${badge(r.status)}<span class="tag">${esc(r.confidence)}</span><span class="text-muted" style="font-size:11px">${time(r.measured_at)}</span></div><div class="kv"><div><span>Posição confirmada</span><strong>${r.position?`${r.position}º`:'—'}</strong></div><div><span>Posição candidata</span><strong>${r.candidate_position?`${r.candidate_position}º`:'—'}</strong></div></div><div class="flexline mt-16"><button class="btn btn-sm btn-secondary" data-action="open-evidence" data-id="${id}" ${r.screenshot?'':'disabled'}>↗ Abrir print</button><button class="btn btn-sm btn-secondary" data-action="open-search" data-url="${esc(r.search_url)}" ${r.search_url?'':'disabled'}>↗ Abrir busca</button></div>${r.review_note?`<p class="fine-print">Nota: ${esc(r.review_note)}</p>`:''}<details class="mt-20"><summary>Ver ${results.length} resultados capturados</summary><div style="max-height:320px;overflow:auto">${list||'<span class="fine-print">Sem lista de resultados disponível.</span>'}</div></details>${r.status==='REVIEW'&&r.candidate_position?`<p class="notice mt-20">A correspondência foi feita apenas pelo nome. Confirme no print se é a unidade correta, se não há anúncios interferindo e se a ordem registrada está correta antes de aprovar.</p><div class="modal-actions"><button class="btn btn-danger" data-action="review" data-id="${id}" data-decision="reject">Rejeitar</button><button class="btn btn-primary" data-action="review" data-id="${id}" data-decision="confirm">✓ Confirmar posição</button></div>`:''}`);
}
async function copyReport(){try{await navigator.clipboard.writeText(state.report?.text||'');toast('Feedback copiado. Cole no WhatsApp!');}catch(e){toast('Cópia indisponível: selecione o texto da prévia.');}}
async function handleAction(button){
 const action=button.dataset.action;
 if(action==='nav')return navigate(button.dataset.view);
 if(action==='new-company')return companyForm();
 if(action==='companies-batch')return batchCompanies();
 if(action==='modal-close')return closeModal();
 if(action==='company-edit')return companyForm(getSelected());
 if(action==='term-add')return termForm();
 if(action==='term-batch')return batchForm();
 if(action==='keywords-suggest')return keywordsSuggest();
 if(action==='run-start')return runStart();
 if(action==='copy-feedback')return copyReport();
 if(action==='csv-export'){if(state.selectedId)window.open(`/api/companies/${state.selectedId}/export`,'_blank');return;}
 if(action==='open-evidence')return window.open(`/api/measurements/${Number(button.dataset.id)}/evidence`,'_blank','noopener');
 if(action==='open-search'){const u=button.dataset.url;if(u.startsWith('https://www.google.com/maps/'))window.open(u,'_blank','noopener');return;}
 if(action==='result-detail')return resultDetail(Number(button.dataset.id));
 if(action==='run-select'){state.selectedRunId=Number(button.dataset.id);await loadSelected();return render();}
 if(action==='choose'){state.selectedId=Number(button.dataset.id);state.selectedRunId=null;await loadSelected();return navigate('measurements');}
 if(action==='term-delete'){
  if(!confirm('Excluir esta pesquisa? Os registros de medições vinculados também serão excluídos.'))return;
  try{await request(`/api/terms/${Number(button.dataset.id)}`,{method:'DELETE'});toast('Termo excluído.');await reload();}catch(e){toast(e.message)}return;
 }
 if(action==='review'){
  const decision=button.dataset.decision;
  if(!confirm(decision==='confirm'?'Você conferiu a imagem, a identidade da unidade e a posição no resultado orgânico?':'Rejeitar esta correspondência?'))return;
  try{await request(`/api/measurements/${Number(button.dataset.id)}/review`,{method:'POST',body:JSON.stringify({decision})});closeModal();toast('Revisão registrada.');await reload();}catch(e){toast(e.message)}
 }
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)void handleAction(b).catch(err=>toast(err.message));});
document.addEventListener('change',e=>{if(e.target.id==='company-select'){state.selectedId=Number(e.target.value);state.selectedRunId=null;void loadSelected().then(render).catch(err=>toast(err.message));}});
document.addEventListener('input',e=>{if(e.target.id==='filter-companies'){const pos=e.target.selectionStart;state.filter=e.target.value;render();$('#filter-companies')?.focus();$('#filter-companies')?.setSelectionRange(pos,pos);}});
$('#menu-button').onclick=()=>$('#sidebar').classList.toggle('open');
$('#modal-close').onclick=closeModal;
$('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
$('#clock').textContent=today();
reload().catch(e=>{$content.innerHTML=empty('Não foi possível carregar o sistema',e.message);});
setInterval(async()=>{
 if(state.polling||!state.companies.length)return;
 const status=state.run?.status;
 if(state.view==='measurements'&&['RUNNING','QUEUED'].includes(status)){
  state.polling=true;try{await reload();}catch(e){console.warn(e);}finally{state.polling=false;}
 }
},4000);
