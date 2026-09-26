import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../auto-sync.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('Auto Sync persists a bounded history and exposes it through the API',()=>{
  assert.match(worker,/autoHistory:\$\{profile\}/);
  assert.match(worker,/slice\(-30\)/);
  assert.match(worker,/\/api\/autosync\/history/);
  assert.match(worker,/status:'ok'/);
  assert.match(worker,/status:'error'/);
});

test('Auto Sync distinguishes updated rosters from runs without changes',()=>{
  assert.match(worker,/rosterFingerprint/);
  assert.match(worker,/changed=!previous\?\.fingerprint\|\|previous\.fingerprint!==fingerprint/);
  assert.match(client,/h\.changed\?'Actualizado':'Sin cambios'/);
});

test('Auto Sync history displays duties and flights',()=>{
  assert.match(worker,/function autoSyncCounts/);
  assert.match(client,/duties/);
  assert.match(client,/vuelos/);
  assert.match(html,/id="autoSyncHistory"/);
});
