import { spawnSync } from 'node:child_process';
const origin = process.env.VITE_API_BASE_URL || 'https://seo-local-api-vh6q.onrender.com';
const url = new URL(origin);
if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') {
  throw new Error('VITE_API_BASE_URL must be an HTTPS origin without credentials or path.');
}
const result = spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','apps/web/vite.config.ts'],{
  stdio:'inherit',env:{...process.env,VITE_API_BASE_URL:url.origin,VITE_AUTH_MODE:'firebase',
    VITE_FIREBASE_EMULATORS:'false',VITE_REVIEW_BUILD:'',VITE_LOCAL_EASY_LOGIN:''},
});
process.exit(result.status ?? 1);
