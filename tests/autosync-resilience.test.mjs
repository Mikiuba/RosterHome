import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Auto Sync retries transient CrewLink failures and keeps activation enabled',()=>{
  const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');
  const client=fs.readFileSync(new URL('../auto-sync.js',import.meta.url),'utf8');
  assert.match(worker,/for\(let tryNo=1;tryNo<=2;tryNo\+\+\)/);
  assert.match(worker,/reportViaFetchExpr/);
  assert.match(worker,/setTimeout\(r,1800\)/);
  assert.match(client,/Auto Sync está activado/);
  assert.match(client,/Se reintentará automáticamente mañana/);
});

test('service worker does not ignore asset query versions',()=>{
  const sw=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
  assert.match(sw,/cache\.match\(request,\{ignoreSearch:false\}\)/);
});
