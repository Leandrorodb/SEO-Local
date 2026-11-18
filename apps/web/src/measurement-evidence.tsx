import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api,errorText} from './session';

const reasons:Record<string,string>={
  POSITION_DIVERGENCE:'As capturas mostraram posições diferentes. Nenhuma posição foi confirmada.',
  ORDER_DIVERGENCE:'A ordem das empresas anteriores mudou entre as capturas.',
  INCOMPLETE_CAPTURE:'A lista não pôde ser lida por completo até a empresa.',
  INVALID_ORGANIC_PREFIX:'Há lacunas ou empresas duplicadas na sequência observada.',
  IDENTITY_MISMATCH:'O nome ou identificador não corresponde à ficha confirmada.',
  TARGET_NOT_CONFIRMED:'A empresa não foi identificada com segurança na profundidade examinada.',
  STALE_CAPTURE:'A captura é antiga demais para confirmar esta medição.',
  REUSED_CAPTURE:'A mesma captura foi recebida duas vezes.',
  INVALID_OBSERVATION_DATE:'O horário informado pela fonte é inválido.',
  INVALID_CAPTURE_ORDER:'Os horários das capturas não estão na ordem esperada.',
  INVALID_CAPTURE_DEPTH:'A profundidade informada não comprova a posição observada.',
  MISSING_CAPTURE_EVIDENCE:'Faltam identificadores ou evidências da captura.',
  SOURCE_MISMATCH:'As capturas não pertencem à mesma fonte.',
  INTERRUPTED_LOCAL_CAPTURE:'O coletor foi interrompido. Nenhuma posição foi presumida.',
  CAPTURE_FAILED:'A coleta falhou; consulte os registros do coletor.',
  AUDIT_CANCELLED:'A medição foi cancelada.',
  TWO_CAPTURES_CONFIRMED:'Duas capturas independentes confirmaram a identidade, a posição e a ordem anterior.',
};
export function measurementReason(reason?:string|null){return reason?reasons[reason]??'A coleta não forneceu comprovação suficiente.':'';}
type CaptureView={observedAt:string;taskRef:string;complete:boolean;depth:number;
  evidence:{source:string;responseHash:string};items:{name:string;cid:string|null;placeId:string|null;position:number;sponsored:boolean}[]};
type Evidence={query:{term:string;expectedName?:string;cid?:string|null;placeId?:string|null;lat:number;lng:number};
  first:CaptureView|null;second:CaptureView|null;decision:{status:string;position:number|null;reason?:string|null}};

export function MeasurementEvidence({org,measurementId}:{org:string;measurementId:string}){
  const [open,setOpen]=useState(false);
  const proof=useQuery({queryKey:['measurement-evidence',org,measurementId],enabled:open&&!!org,
    queryFn:()=>api<Evidence>(`/measurements/${measurementId}/evidence`,org)});
  return <details onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>Conferir capturas e motivo da decisão</summary>
    {proof.isLoading&&<p>Carregando evidências…</p>}
    {proof.error&&<p role="alert">{errorText(proof.error)}</p>}
    {proof.data&&<>
      <p><strong>{proof.data.query.term}</strong> · {proof.data.query.expectedName}</p>
      <p>{measurementReason(proof.data.decision.reason)||'Consulte as listas de cada captura para conferir esta observação.'}</p>
      <p className="muted">Ponto: {proof.data.query.lat.toFixed(6)}, {proof.data.query.lng.toFixed(6)}. As listas abaixo são leituras da fonte; uma leitura isolada não confirma a posição.</p>
      <div className="two-columns">{[proof.data.first,proof.data.second].map((capture,index)=><section key={index}>
        <h3>Captura {index+1}</h3>
        {!capture?<p>Captura não realizada.</p>:<>
          <p>{Number.isFinite(Date.parse(capture.observedAt))?new Date(capture.observedAt).toLocaleString('pt-BR'):'Horário da fonte inválido'} · {capture.complete?'Leitura completa':'Leitura incompleta'}</p>
          <small>Referência: {capture.taskRef}</small>
          <p>{capture.items.filter(x=>x.sponsored).length} anúncio(s) separado(s) da lista orgânica.</p>
          <ol style={{paddingLeft:24}}>{capture.items.filter(x=>!x.sponsored).slice().sort((a,b)=>a.position-b.position).map((item,i)=>{
            const target=!!((proof.data!.query.cid&&item.cid===proof.data!.query.cid)||(proof.data!.query.placeId&&item.placeId===proof.data!.query.placeId));
            return <li key={i} value={item.position} style={{padding:'5px 0',fontWeight:target?700:400}}>{item.name}{target?' · ficha pesquisada':''}<small style={{display:'block'}}>CID/Place ID: {item.cid??item.placeId??'não identificado'}</small></li>;
          })}</ol>
          {!capture.items.length&&<p>A fonte não forneceu uma lista utilizável.</p>}
          <small style={{display:'block',overflowWrap:'anywhere'}}>Hash da evidência: {capture.evidence.responseHash}</small>
        </>}
      </section>)}</div>
      <p className="muted">As imagens originais do piloto Chrome ficam no computador do coletor. Este painel exibe a sequência e os identificadores persistidos no Firestore.</p>
    </>}
  </details>;
}
