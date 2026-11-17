import { useEffect, useState } from 'react';
import './firebase-security.css';
import type { TotpSecret } from 'firebase/auth';
import { MFA_EVENT, pendingTotpChallenge, finishTotpChallenge, cancelTotpChallenge,
  enrolledTotp, startTotpEnrollment, finishTotpEnrollment, firebaseIdentity } from './firebase-auth';

function message(error: unknown): string {
  const code = (error as {code?:string})?.code;
  if (code === 'auth/invalid-verification-code') return 'Código incorreto ou expirado. Use o código atual do aplicativo.';
  if (code === 'auth/requires-recent-login') return 'Entre novamente antes de configurar a verificação.';
  if (code === 'auth/operation-not-allowed' || code === 'auth/unsupported-first-factor') return 'A verificação por aplicativo ainda precisa ser habilitada no Firebase.';
  return 'Não foi possível concluir a verificação. Tente novamente; se continuar, entre novamente.';
}

export function FirebaseMfaChallenge() {
  const [open,setOpen] = useState(pendingTotpChallenge),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{const update=()=>{setOpen(pendingTotpChallenge());setCode('');setError('');};window.addEventListener(MFA_EVENT,update);return()=>window.removeEventListener(MFA_EVENT,update);},[]);
  if (!open) return null;
  return <div className="firebase-mfa-overlay"><section className="panel firebase-security" role="dialog" aria-modal="true" aria-labelledby="mfa-title">
    <h2 id="mfa-title">Confirme sua entrada</h2><p>Digite o código de seis dígitos do seu aplicativo autenticador.</p>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await finishTotpChallenge(code);}catch(err){setError(message(err));}finally{setBusy(false);}}}>
      <label>Código de verificação<input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} required /></label>
      {error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy||code.length!==6}>{busy?'Verificando…':'Confirmar entrada'}</button>
      <button type="button" disabled={busy} onClick={cancelTotpChallenge}>Cancelar</button>
    </form>
  </section></div>;
}

export function FirebaseMfaEnrollment() {
  const [secret,setSecret]=useState<TotpSecret|null>(null),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[enrolled,setEnrolled]=useState(enrolledTotp);
  return <section className="notice firebase-security" aria-labelledby="security-title">
    <h2 id="security-title">Proteja sua conta para cadastrar e medir</h2>
    {enrolled?<><p>A verificação por aplicativo está configurada. Entre novamente e confirme o código para liberar as ações administrativas.</p>
      <button onClick={()=>void firebaseIdentity.signinRedirect({max_age:0}).catch(err=>setError(message(err)))}>Entrar novamente com verificação</button></>:
      <><p>Use Google Authenticator, Microsoft Authenticator ou outro aplicativo compatível. Não há envio de SMS.</p>
      {!secret?<button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{setSecret(await startTotpEnrollment());}catch(err){setError(message(err));}finally{setBusy(false);}}}>{busy?'Preparando…':'Configurar aplicativo autenticador'}</button>:
      <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await finishTotpEnrollment(secret,code);setSecret(null);setCode('');setEnrolled(true);}catch(err){setError(message(err));}finally{setBusy(false);}}}>
        <p>No aplicativo, adicione uma conta com chave de configuração, escolha código por tempo e informe esta chave:</p>
        <code className="totp-secret">{secret.secretKey}</code><p>Guarde essa chave em local privado. Não envie por chat nem em prints.</p>
        <label>Código atual do aplicativo<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} required /></label>
        <button className="primary" disabled={busy||code.length!==6}>{busy?'Confirmando…':'Ativar verificação'}</button>
        <button type="button" disabled={busy} onClick={()=>{setSecret(null);setCode('');}}>Cancelar configuração</button>
      </form>}
      </>}
    {error&&<><p role="alert">{error}</p><button onClick={()=>void firebaseIdentity.signinRedirect({max_age:0}).catch(err=>setError(message(err)))}>Renovar entrada com Google</button></>}
  </section>;
}
