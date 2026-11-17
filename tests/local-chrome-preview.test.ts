import test from 'node:test';
import assert from 'node:assert/strict';
import { cidFromResultUrl, LocalChromePreviewProvider } from '../packages/rank-providers/local-chrome-preview.js';

test('CID found in exact Maps feature identifier', () => {
  assert.equal(cidFromResultUrl('https://www.google.com/maps/place/Jares/data=!4m2!3m1!1s0x0:0x494c784ebd090660'), BigInt('0x494c784ebd090660').toString());
  assert.equal(cidFromResultUrl('https://www.google.com/maps?cid=123456789'), '123456789');
  assert.equal(cidFromResultUrl('https://www.google.com/maps?cid=0'), null);
  assert.equal(cidFromResultUrl('https://www.google.com/maps?cid=18446744073709551616'), null);
  assert.equal(cidFromResultUrl('https://example.org/maps/place/Jares/data=!4m2!3m1!1s0x0:0x494c784ebd090660'), null);
  assert.equal(cidFromResultUrl('https://www.google.com/maps/search/loja+de+moveis'), null);
});

test('local-preview has zero external API cost and only supports Maps', async () => {
  const provider = new LocalChromePreviewProvider();
  assert.equal(provider.demo, true);
  assert.equal(provider.supports('MAPS'), true);
  assert.equal(provider.supports('LOCAL_FINDER'), false);
  assert.equal(provider.supports('LOCAL_PACK'), false);
  const q = { surface: 'MAPS', device: 'desktop', language: 'pt-BR' } as Parameters<typeof provider.quote>[0];
  assert.deepEqual(await provider.quote(q), { maxCostMicros: 0, depth: 20 });
  await assert.rejects(provider.quote({ ...q, device: 'mobile' }));
  await assert.rejects(provider.quote({ ...q, language: 'en-US' }));
});

test('local preview activation requires explicit staging and local database', async () => {
  const { localPreviewEnabled } = await import('../packages/rank-providers/local-chrome-preview.js');
  const names = ['NODE_ENV', 'RANK_PROVIDER', 'LRT_LOCAL_EVAL', 'DATABASE_URL'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, {
      NODE_ENV: 'staging', RANK_PROVIDER: 'local_chrome_preview',
      LRT_LOCAL_EVAL: 'I_ACCEPT_LOCAL_ONLY_EXPERIMENTAL_USE',
      DATABASE_URL: 'postgresql://user:secret@127.0.0.1:55432/lrt',
    });
    assert.equal(localPreviewEnabled(), true);
    process.env.DATABASE_URL = 'postgresql://user:secret@db.production.example/lrt';
    assert.equal(localPreviewEnabled(), false);
    process.env.DATABASE_URL = 'postgresql://user:secret@localhost:55432/lrt';
    process.env.NODE_ENV = 'production';
    assert.equal(localPreviewEnabled(), false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
