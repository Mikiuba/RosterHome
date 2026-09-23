import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('v1.1.4 exposes daily CrewLink Auto Sync UI',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../auto-sync.js',import.meta.url),'utf8');
  assert.match(html,/id="autoSyncEnable"/);
  assert.match(html,/id="autoSyncRun"/);
  assert.match(html,/id="autoSyncDisable"/);
  assert.match(html,/auto-sync\.js\?v=1\.1\.4/);
  assert.match(js,/\/api\/autosync\/config/);
  assert.match(js,/\/api\/autosync\/run/);
  assert.match(js,/\/api\/autosync\/roster/);
  assert.match(js,/mergeParsed/);
});

test('worker has encrypted daily scheduled sync and keeps previous roster on failure',()=>{
  const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');
  const cfg=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.deepEqual(cfg.triggers.crons,['17 4 * * *']);
  assert.match(worker,/async scheduled\(controller,env,ctx\)/);
  assert.match(worker,/runAllAutoSync/);
  assert.match(worker,/AES-GCM/);
  assert.match(worker,/sealCredentials/);
  assert.match(worker,/openCredentials/);
  assert.match(worker,/RosterParser\.parseCrewLinkText/);
  assert.match(worker,/PDFJS_URL/);
  assert.match(worker,/last roster válido|último roster válido/i);
});
