/**
 * Loopback-only OIDC provider for DEVELOPMENT / HOMOLOGATION.
 * NOT a production identity provider. No external dependencies.
 * Supports OIDC Authorization Code + S256 PKCE, password + locally generated
 * TOTP code, signed RS256 tokens, discovery, JWKS and userinfo.
 */
import { createServer } from 'node:http';
import {
  createHash, createHmac, randomBytes, randomUUID, generateKeyPairSync,
  scryptSync, timingSafeEqual, sign, verify, createPublicKey,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const issuer = 'http://127.0.0.1:4181';
const clientId = 'local-rank-tracker-web';
const user = 'owner@local.invalid';
const subject = 'lrt-local-owner';
const dataDir = path.resolve('work/local-oidc');
const file = path.join(dataDir, 'identity.json');
const privateFile = path.join(dataDir, 'rsa-private.pem');
const publicFile = path.join(dataDir, 'rsa-public.json');
const credentialFile = path.join(dataDir, 'CREDENCIAIS_PRIVADAS.txt');
const flag = 'I_UNDERSTAND_LOCAL_TEST_ONLY';
const localEasy = process.env.LRT_LOCAL_EASY_LOGIN === 'LOCAL_MACHINE_ONLY';
const origins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

function b32(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, accumulator = 0, out = '';
  for (const b of buffer) {
    accumulator = (accumulator << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(accumulator >>> bits) & 31];
    }
  }
  if (bits) out += alphabet[(accumulator << (5 - bits)) & 31];
  return out;
}
function totp(seedHex, time = Date.now()) {
  const counter = Math.floor(time / 30_000);
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', Buffer.from(seedHex, 'hex')).update(b).digest();
  const off = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(off) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
function validTotp(code, seedHex) {
  if (!/^\d{6}$/.test(code ?? '')) return false;
  return [-30_000, 0, 30_000].some((delta) =>
    timingSafeEqual(Buffer.from(totp(seedHex, Date.now() + delta)), Buffer.from(code)));
}
function updateEnv(pairs) {
  const envFile = path.resolve('.env');
  if (!existsSync(envFile) && existsSync('.env.example')) copyFileSync('.env.example', envFile);
  let content = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  for (const [key, value] of Object.entries(pairs)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(content)) content = content.replace(pattern, line);
    else content += `\n${line}\n`;
  }
  writeFileSync(envFile, content.replace(/\n{3,}/g, '\n\n'), { mode: 0o600 });
}
function setup() {
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(file)) {
    const password = randomBytes(24).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    const otp = randomBytes(20);
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    writeFileSync(privateFile, keys.privateKey, { mode: 0o600 });
    writeFileSync(publicFile, JSON.stringify({
      keys: [{ ...createPublicKey(keys.publicKey).export({ format: 'jwk' }),
        kid: 'lrt-local-1', alg: 'RS256', use: 'sig' }],
    }), { mode: 0o600 });
    writeFileSync(file, JSON.stringify({
      subject, user, salt, passwordHash: scryptSync(password, salt, 64).toString('hex'),
      otpHex: otp.toString('hex'),
    }), { mode: 0o600 });
    const secret = b32(otp);
    writeFileSync(credentialFile, [
      'LOCAL RANK TRACKER - CREDENCIAIS DE HOMOLOGACAO (NAO COMPARTILHAR)',
      `Usuario: ${user}`,
      `Senha: ${password}`,
      `Segredo TOTP (para aplicativo autenticador): ${secret}`,
      `otpauth://totp/LocalRankTracker:${user}?secret=${secret}&issuer=LocalRankTracker&period=30&digits=6`,
      'Alternativa local para obter o codigo: pnpm.cmd auth:local:otp',
      'NAO USAR EM PRODUCAO. Todos os arquivos sao privados dentro de work/.',
    ].join('\n') + '\n', { mode: 0o600 });
    console.log('Conta local criada. Credenciais privadas em work/local-oidc/CREDENCIAIS_PRIVADAS.txt.');
  } else {
    console.log('Conta local existente preservada; senha e chaves nao foram redefinidas.');
  }
  updateEnv({
    NODE_ENV: 'development', LRT_LOCAL_OIDC: flag,
    OIDC_ISSUER: issuer,
    OIDC_JWKS_URL: issuer + '/jwks',
    OIDC_AUDIENCE: clientId,
    OIDC_MFA_ACR: '',
    VITE_OIDC_AUTHORITY: issuer,
    VITE_OIDC_CLIENT_ID: clientId,
    VITE_OIDC_SCOPE: 'openid profile email',
    WEB_ORIGIN: 'http://127.0.0.1:5173',
    OWNER_SUBJECT: subject,
    OWNER_EMAIL: user,
  });
  console.log('OIDC local configurado em .env. Banco, planos e licencas existentes preservados.');
  console.log('Execute pnpm.cmd owner:bootstrap com o PostgreSQL iniciado.');
}
function inspect() {
  if (!existsSync(file)) throw Error('Execute primeiro: pnpm.cmd auth:local:setup');
  return JSON.parse(readFileSync(file, 'utf8'));
}
function base64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function issueToken(privateKey, payload) {
  const data = base64url({ alg: 'RS256', typ: 'JWT', kid: 'lrt-local-1' }) + '.' + base64url(payload);
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
}
function readToken(token, publicKey) {
  const [header, payload, signature, extra] = String(token).split('.');
  if (!header || !payload || !signature || extra) return null;
  try {
    const h = JSON.parse(Buffer.from(header, 'base64url').toString());
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (h.alg !== 'RS256' || !verify('RSA-SHA256', Buffer.from(`${header}.${payload}`),
      publicKey, Buffer.from(signature, 'base64url'))) return null;
    if (p.iss !== issuer || p.aud !== clientId || p.exp <= Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}
function htmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
function loginPage(flow, message = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Rank Tracker - Login local</title><style>body{font-family:system-ui;background:#08131c;color:#edf8f9;min-height:100vh;display:grid;place-items:center;margin:0}main{width:min(380px,90vw);border:1px solid #234554;border-radius:16px;padding:30px;background:#11232e}label{display:block;margin:16px 0 5px}input{box-sizing:border-box;width:100%;padding:12px;border-radius:8px;border:1px solid #456273;background:#07151c;color:#fff}button{width:100%;background:#44ddbb;padding:13px;border:0;border-radius:9px;margin-top:22px;font-weight:700}small{color:#abc2ce}.err{color:#ff9292}</style></head><body><main><h2>Local Rank Tracker</h2><p>Acesso local de homologação</p>${message ? `<p class="err">${htmlEscape(message)}</p>` : ''}<form method="post" action="/login"><input type="hidden" name="flow" value="${htmlEscape(flow)}"><label>Senha local</label><input type="password" name="password" autocomplete="current-password" required autofocus><label>Código temporário (6 dígitos)</label><input type="text" name="otp" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required><button type="submit">Entrar na homologação</button></form><p><small>Credenciais em work/local-oidc/CREDENCIAIS_PRIVADAS.txt. Código pelo aplicativo autenticador ou comando pnpm.cmd auth:local:otp. Somente neste computador.</small></p></main></body></html>`;
}
function send(res, status, value, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', ...headers });
  res.end(typeof value === 'string' ? value : JSON.stringify(value));
}
async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192) throw Error('request too large');
  }
  return new URLSearchParams(raw);
}
function runServer() {
  if (process.env.NODE_ENV !== 'development' || process.env.LRT_LOCAL_OIDC !== flag ||
    process.env.OIDC_ISSUER !== issuer) {
    throw Error('OIDC local so funciona com NODE_ENV=development e opt-in explicito da homologacao');
  }
  const profile = inspect();
  const privateKey = readFileSync(privateFile, 'utf8');
  const publicKey = createPublicKey(privateKey);
  const jwks = JSON.parse(readFileSync(publicFile, 'utf8'));
  const flows = new Map(), codes = new Map();
  const failures = new Map();
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return send(res, 204, '');
    const url = new URL(req.url ?? '/', issuer);
    const now = Date.now();
    for (const [key, value] of flows) if (value.expires < now) flows.delete(key);
    for (const [key, value] of codes) if (value.expires < now) codes.delete(key);
    try {
      if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
        return send(res, 200, {
          issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token',
          jwks_uri: issuer + '/jwks', userinfo_endpoint: issuer + '/userinfo',
          response_types_supported: ['code'], subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['none'],
          code_challenge_methods_supported: ['S256'],
          scopes_supported: ['openid', 'profile', 'email'],
        });
      }
      if (req.method === 'GET' && url.pathname === '/jwks') return send(res, 200, jwks);
      if (req.method === 'GET' && url.pathname === '/authorize') {
        const redirectRaw = url.searchParams.get('redirect_uri');
        const redirect = redirectRaw ? new URL(redirectRaw) : null;
        const challenge = url.searchParams.get('code_challenge');
        const state = url.searchParams.get('state');
        if (!redirect || !origins.has(redirect.origin) || redirect.pathname !== '/auth/callback' ||
            redirect.search || redirect.hash || url.searchParams.get('client_id') !== clientId ||
            url.searchParams.get('response_type') !== 'code' ||
            url.searchParams.get('code_challenge_method') !== 'S256' ||
            !challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || !state || state.length < 8) {
          return send(res, 400, { error: 'invalid_request' });
        }
        const flow = randomUUID();
        const parameters = { redirect: redirect.toString(), challenge,
          state, nonce: url.searchParams.get('nonce'), expires: now + 300_000 };
        // LOCAL-ONLY convenience: possession of this Windows session acts as
        // a device sign-in for homologation, NOT as MFA or production auth.
        const remote = req.socket.remoteAddress;
        const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
        if (localEasy && loopback && process.env.NODE_ENV === 'development') {
          const code = randomBytes(32).toString('base64url');
          codes.set(code, { ...parameters, localDevice: true,
            authTime: Math.floor(now / 1000), expires: now + 60_000 });
          const target = new URL(parameters.redirect);
          target.searchParams.set('code', code);
          target.searchParams.set('state', state);
          return send(res, 302, '', 'text/plain', { Location: target.toString() });
        }
        flows.set(flow, parameters);
        return send(res, 200, loginPage(flow), 'text/html; charset=utf-8',
          { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" });
      }
      if (req.method === 'POST' && url.pathname === '/login') {
        const body = await readBody(req);
        const flowId = body.get('flow') ?? '';
        const flow = flows.get(flowId);
        if (!flow) return send(res, 400, 'Solicitacao de login expirada.', 'text/plain');
        const fp = 'loopback';
        const attempts = failures.get(fp) ?? { count: 0, until: 0 };
        if (attempts.until > now) return send(res, 429, loginPage(flowId, 'Muitas tentativas. Aguarde 1 minuto.'), 'text/html');
        const hash = scryptSync(body.get('password') ?? '', profile.salt, 64);
        const expected = Buffer.from(profile.passwordHash, 'hex');
        const pass = timingSafeEqual(hash, expected);
        const otp = validTotp(body.get('otp'), profile.otpHex);
        if (!pass || !otp) {
          const count = attempts.count + 1;
          failures.set(fp, { count: count >= 5 ? 0 : count, until: count >= 5 ? now + 60_000 : 0 });
          return send(res, 401, loginPage(flowId, 'Senha ou codigo incorreto.'), 'text/html');
        }
        failures.delete(fp);
        flows.delete(flowId);
        const code = randomBytes(32).toString('base64url');
        codes.set(code, { ...flow, authTime: Math.floor(now / 1000), expires: now + 60_000 });
        const redirect = new URL(flow.redirect);
        redirect.searchParams.set('code', code);
        redirect.searchParams.set('state', flow.state);
        return send(res, 302, '', 'text/plain', { Location: redirect.toString() });
      }
      if (req.method === 'POST' && url.pathname === '/token') {
        const form = await readBody(req);
        const code = form.get('code') ?? '';
        const saved = codes.get(code);
        codes.delete(code);
        if (!saved || saved.expires < now || form.get('grant_type') !== 'authorization_code' ||
            form.get('client_id') !== clientId || form.get('redirect_uri') !== saved.redirect ||
            !form.get('code_verifier') ||
            createHash('sha256').update(form.get('code_verifier')).digest('base64url') !== saved.challenge) {
          return send(res, 400, { error: 'invalid_grant' });
        }
        const claims = { iss: issuer, aud: clientId, sub: subject,
          email: user, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 900,
          auth_time: saved.authTime, amr: saved.localDevice ? ['local_device'] : ['pwd', 'otp'],
          ...(saved.nonce ? { nonce: saved.nonce } : {}),
        };
        const jwt = issueToken(privateKey, claims);
        return send(res, 200, { token_type: 'Bearer', expires_in: 900,
          id_token: jwt, access_token: jwt, scope: 'openid profile email' });
      }
      if (req.method === 'GET' && url.pathname === '/userinfo') {
        const jwt = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
        const p = readToken(jwt, publicKey);
        if (!p) return send(res, 401, { error: 'invalid_token' });
        return send(res, 200, { sub: p.sub, email: p.email });
      }
      return send(res, 404, { error: 'not_found' });
    } catch (e) {
      console.error('[OIDC local]', e instanceof Error ? e.message : 'erro');
      return send(res, 400, { error: 'invalid_request' });
    }
  });
  server.listen(4181, '127.0.0.1', () => {
    console.log('OIDC de homologacao iniciado em http://127.0.0.1:4181');
    console.log('Somente loopback; PROIBIDO em producao. Mantenha esta janela aberta.');
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
}
const operation = process.argv[2];
if (operation === 'setup') setup();
else if (operation === 'serve') runServer();
else if (operation === 'otp') console.log(totp(inspect().otpHex));
else throw Error('Uso: node infra/local-oidc.mjs setup|serve|otp');
