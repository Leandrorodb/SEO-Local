import { build } from 'esbuild';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
await mkdir('functions/lib',{recursive:true});
await build({entryPoints:['apps/firebase/functions.ts'],outfile:'functions/lib/index.js',bundle:true,platform:'node',
  format:'esm',target:'node24',packages:'external',sourcemap:false});
const root=JSON.parse(await readFile('package.json','utf8'));
const dependencies=Object.fromEntries(['firebase-admin','firebase-functions','fastify','@fastify/helmet','@fastify/rate-limit',
  'zod','pdfkit','jose','pg','drizzle-orm','pngjs'].map(k=>[k,root.dependencies[k]]));
await writeFile('functions/package.json',JSON.stringify({name:'seo-local-functions',private:true,type:'module',main:'lib/index.js',
  engines:{node:'24'},dependencies},null,2)+'\n');
console.log('Firebase Functions compiled.');
