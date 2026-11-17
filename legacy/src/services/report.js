import { getCompany, getMeasurements, getLatestRun } from '../db.js';
const order = ['VERIFIED','REVIEW','NOT_FOUND','NO_LIST','BLOCKED','ERROR','PENDING'];
export function buildReport(db, companyId) {
  const company=getCompany(db,companyId);
  if(!company) return null;
  const run=getLatestRun(db,companyId);
  const rows=run?getMeasurements(db,run.id):[];
  const verified=rows.filter(r=>r.status==='VERIFIED' && Number.isInteger(r.position));
  const review=rows.filter(r=>r.status==='REVIEW');
  const group=n=>verified.filter(r=>r.position===n).map(r=>r.query);
  const top5=verified.filter(r=>r.position<=5).length;
  const top3=verified.filter(r=>r.position<=3).length;
  const clusters=[...new Set(rows.map(r=>r.cluster))];
  const parts=[`📊 *NEXUS | FEEDBACK DE MEDIÇÃO — ${company.name.toUpperCase()}*`,
    'Bom dia, pessoal! Tudo bem? 😊',
    'Compartilhamos o acompanhamento das pesquisas comerciais da empresa no Google Maps, considerando a localização de referência utilizada na auditoria.'];
  if (!run) parts.push('📌 *Ainda não existe uma medição concluída para esta ficha.*');
  else {
    const section=(pos,emoji,label)=>{const arr=group(pos);if(arr.length)parts.push(`${emoji} *${label}*\n${arr.map(t=>`${emoji} ${t}`).join('\n')}`);};
    section(1,'🥇','PRIMEIROS LUGARES CONFIRMADOS');
    section(2,'🥈','SEGUNDOS LUGARES CONFIRMADOS');
    section(3,'🥉','TERCEIROS LUGARES CONFIRMADOS');
    const fourFive=verified.filter(r=>r.position===4||r.position===5);
    if(fourFive.length)parts.push(`📈 *POSIÇÕES 4 E 5*\n${fourFive.map(r=>`• ${r.query} — ${r.position}º`).join('\n')}`);
    parts.push(`📊 *RESUMO DA AUDITORIA*\n• ${rows.length} pesquisas incluídas\n• ${verified.length} posições verificadas\n• ${top3} termos no Top 3\n• ${top5} termos no Top 5\n• ${review.length} resultados aguardando revisão`);
    if(review.length)parts.push('🔍 *EM CONFERÊNCIA*\nHá resultados potencialmente relacionados à empresa que ainda exigem validação da ficha e da posição antes de qualquer anúncio.');
    if(!verified.length)parts.push('Até esta coleta, não foi possível comprovar posições orgânicas com segurança. Seguimos em conferência; isso não significa ausência da empresa nas buscas.');
    if(clusters.length)parts.push(`🎯 *CLUSTERS MONITORADOS*\n${clusters.map((x,i)=>`${i+1}. ${x}`).join('\n')}`);
  }
  parts.push('As posições correspondem ao momento e à localização da coleta e podem variar conforme o dispositivo, o horário e o histórico de busca. Seguimos trabalhando para ampliar a presença da empresa nas pesquisas mais relevantes. 🚀🤝');
  return {company, run, measurements:rows, verifiedCount:verified.length, reviewCount:review.length, text:parts.join('\n\n')};
}
export function csv(rows){
  const escape=value=>{
    let str=String(value??'');
    // CSV formula injection prevention for Excel/Sheets.
    if(/^[\s]*[=+@\-]/.test(str))str="'"+str;
    return '"'+str.replaceAll('"','""')+'"';
  };
  const header=['Termo','Cluster','Prioridade','Posição confirmada','Posição candidata','Status','Data da medição','URL de pesquisa','Print','Quantidade observada','Nota de revisão'];
  const lines=rows.map(r=>[r.query,r.cluster,r.priority,r.position??'',r.candidate_position??'',r.status,r.measured_at??'',r.search_url,r.screenshot,r.observed_count,r.review_note]);
  return '\ufeff'+[header,...lines].map(a=>a.map(escape).join(';')).join('\r\n');
}
export function statusSort(a,b){return order.indexOf(a.status)-order.indexOf(b.status);}
