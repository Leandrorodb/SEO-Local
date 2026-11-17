import { writeFile } from 'node:fs/promises';
import { makePool } from '../packages/db/index.js';
import { buildApp } from '../apps/api/app.js';
import { Authenticator } from '../apps/api/auth.js';
const pool = makePool('postgresql://unused@127.0.0.1/unused');
const app = buildApp({
  pool,
  auth: new Authenticator('https://documentation.invalid', 'documentation', async () => {
    throw Error('Documentation generation never authenticates');
  }),
});
try {
  await app.ready();
  await writeFile(
    'docs/openapi.json',
    JSON.stringify(app.getDecorator('openApiDocument'), null, 2),
  );
  console.log('docs/openapi.json generated from registered routes; no database connection used.');
} finally {
  await app.close();
  await pool.end();
}
