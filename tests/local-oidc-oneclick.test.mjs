import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const oidc = fileURLToPath(new URL('../infra/local-oidc.mjs', import.meta.url));

test('Windows one-click local OIDC: automatic loopback login uses PKCE and explicitly local_device, not fake MFA', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lrt-oneclick-'));
  let server;
  try {
    writeFileSync(path.join(root,'.env.example'),'NODE_ENV=development\n');
    const setup = spawnSync(process.execPath,[oidc,'setup'],{cwd:root,encoding:'utf8'});
    assert.equal(setup.status,0,setup.stderr);
    const envFile = path.join(root,'.env');
    const original=readFileSync(envFile,'utf8');
    writeFileSync(envFile,original+'\nLRT_LOCAL_EASY_LOGIN=LOCAL_MACHINE_ONLY\n');
    server=spawn(process.execPath,['--env-file=.env',oidc,'serve'],{cwd:root,stdio:['ignore','pipe','pipe']});
    let ready=false;
    for(let i=0;i<60;i++){
      await new Promise(r=>setTimeout(r,80));
      try { const r=await fetch('http://127.0.0.1:4181/.well-known/openid-configuration'); if(r.ok){ready=true;break} } catch {}
    }
    assert.ok(ready,'loopback OIDC did not become ready');
    const verifier='z'.repeat(64);
    const challenge=createHash('sha256').update(verifier).digest('base64url');
    const uri=new URL('http://127.0.0.1:4181/authorize');
    Object.entries({
      client_id:'local-rank-tracker-web',
      response_type:'code',
      redirect_uri:'http://127.0.0.1:5173/auth/callback',
      state:'state_for_one_click_123',
      nonce:'nonce_xyz',
      code_challenge_method:'S256',
      code_challenge:challenge,
    }).forEach(([k,v])=>uri.searchParams.set(k,v));
    const invalid=new URL(uri); invalid.searchParams.set('redirect_uri','http://evil.invalid/auth/callback');
    assert.equal((await fetch(invalid,{redirect:'manual'})).status,400);
    const automatic=await fetch(uri,{redirect:'manual'});
    assert.equal(automatic.status,302);
    const redirect=new URL(automatic.headers.get('location'));
    assert.equal(redirect.origin,'http://127.0.0.1:5173');
    assert.equal(redirect.searchParams.get('state'),'state_for_one_click_123');
    const code=redirect.searchParams.get('code');
    assert.ok(code);
    const form=new URLSearchParams({
      grant_type:'authorization_code',client_id:'local-rank-tracker-web',
      redirect_uri:'http://127.0.0.1:5173/auth/callback',
      code,code_verifier:verifier,
    });
    const result=await fetch('http://127.0.0.1:4181/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':'http://127.0.0.1:5173'},body:form,
    });
    assert.equal(result.status,200);
    const payload=JSON.parse(Buffer.from((await result.json()).id_token.split('.')[1],'base64url').toString());
    assert.deepEqual(payload.amr,['local_device']);
    assert.ok(!payload.amr.includes('mfa'));
    assert.equal((await fetch('http://127.0.0.1:4181/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,
    })).status,400,'authorization code may only be used once');
  }finally{
    if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}
    rmSync(root,{recursive:true,force:true});
  }
});
