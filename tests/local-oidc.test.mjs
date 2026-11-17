import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, verify } from 'node:crypto';

const script = fileURLToPath(new URL('../infra/local-oidc.mjs', import.meta.url));
test('OIDC local: setup, PKCE, password+TOTP, RS256, rejeicao de replay e login de origem externa', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lrt-local-oidc-'));
  let server;
  try {
    mkdirSync(path.join(root, 'work'), { recursive: true });
    writeFileSync(path.join(root, '.env.example'), 'NODE_ENV=development\nDATABASE_URL=some-private-value\n');
    const setup = spawnSync(process.execPath, [script, 'setup'], { cwd: root, encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr);
    const env = readFileSync(path.join(root, '.env'), 'utf8');
    assert.match(env, /DATABASE_URL=some-private-value/);
    assert.match(env, /LRT_LOCAL_OIDC=I_UNDERSTAND_LOCAL_TEST_ONLY/);
    const cred = readFileSync(path.join(root, 'work/local-oidc/CREDENCIAIS_PRIVADAS.txt'), 'utf8');
    const pass = /^Senha: (.+)$/m.exec(cred)?.[1];
    assert.ok(pass);
    const again = spawnSync(process.execPath, [script, 'setup'], { cwd: root, encoding: 'utf8' });
    assert.equal(again.status, 0);
    assert.equal(readFileSync(path.join(root, 'work/local-oidc/CREDENCIAIS_PRIVADAS.txt'), 'utf8'), cred);
    server = spawn(process.execPath, ['--env-file-if-exists=.env', script, 'serve'], {
      cwd: root, stdio: ['ignore','pipe','pipe'],
    });
    let ready = false, output = '';
    server.stderr.on('data', chunk => { output += chunk.toString(); });
    server.stdout.on('data', chunk => { output += chunk.toString(); });
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 75));
      if (server.exitCode !== null) break;
      try {
        const resp = await fetch('http://127.0.0.1:4181/.well-known/openid-configuration');
        if (resp.ok) { ready = true; break; }
      } catch {}
    }
    assert.ok(ready, 'OIDC local nao iniciou: '+output);
    const discover = await (await fetch('http://127.0.0.1:4181/.well-known/openid-configuration')).json();
    assert.equal(discover.issuer, 'http://127.0.0.1:4181');
    const verifier = 'v'.repeat(64);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorize = new URL('http://127.0.0.1:4181/authorize');
    authorize.searchParams.set('client_id','local-rank-tracker-web');
    authorize.searchParams.set('response_type','code');
    authorize.searchParams.set('redirect_uri','http://127.0.0.1:5173/auth/callback');
    authorize.searchParams.set('state','state123456789');
    authorize.searchParams.set('nonce','nonce123');
    authorize.searchParams.set('code_challenge_method','S256');
    authorize.searchParams.set('code_challenge',challenge);
    const invalid = new URL(authorize);
    invalid.searchParams.set('redirect_uri','https://evil.invalid/auth/callback');
    assert.equal((await fetch(invalid)).status,400);
    const html = await (await fetch(authorize)).text();
    const flow = /name="flow" value="([^"]+)"/.exec(html)?.[1];
    assert.ok(flow, 'login form with challenge');
    const otp = spawnSync(process.execPath, [script,'otp'], { cwd: root, encoding:'utf8' }).stdout.trim();
    assert.match(otp, /^\d{6}$/);
    const bad = await fetch('http://127.0.0.1:4181/login', { method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({flow, password:'wrong', otp}) });
    assert.equal(bad.status,401);
    const ok = await fetch('http://127.0.0.1:4181/login', { method:'POST', redirect:'manual',
      headers: {'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({flow, password:pass, otp}) });
    assert.equal(ok.status,302);
    const redirect = new URL(ok.headers.get('Location'));
    assert.equal(redirect.searchParams.get('state'),'state123456789');
    const code = redirect.searchParams.get('code');
    assert.ok(code);
    const body = new URLSearchParams({
      client_id:'local-rank-tracker-web', redirect_uri:'http://127.0.0.1:5173/auth/callback',
      grant_type:'authorization_code', code, code_verifier: verifier,
    });
    const exchange = await fetch('http://127.0.0.1:4181/token', {method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':'http://127.0.0.1:5173'},
      body});
    assert.equal(exchange.status,200);
    assert.equal(exchange.headers.get('Access-Control-Allow-Origin'),'http://127.0.0.1:5173');
    const token = (await exchange.json()).id_token;
    const [h, p, sig] = token.split('.');
    const payload = JSON.parse(Buffer.from(p,'base64url').toString());
    assert.equal(payload.sub,'lrt-local-owner');
    assert.equal(payload.nonce,'nonce123');
    assert.deepEqual(payload.amr,['pwd','otp']);
    const jwks = await (await fetch('http://127.0.0.1:4181/jwks')).json();
    assert.equal(jwks.keys[0].alg,'RS256');
    const { createPublicKey } = await import('node:crypto');
    const pub = createPublicKey({key:jwks.keys[0],format:'jwk'});
    assert.ok(verify('RSA-SHA256', Buffer.from(h+'.'+p),pub,Buffer.from(sig,'base64url')));
    const replay = await fetch('http://127.0.0.1:4181/token', { method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},body });
    assert.equal(replay.status,400);
    const info = await fetch('http://127.0.0.1:4181/userinfo', {headers:{Authorization:'Bearer '+token}});
    assert.equal((await info.json()).sub,'lrt-local-owner');
  } finally {
    server?.kill('SIGINT');
    rmSync(root, { recursive:true, force:true });
  }
});
