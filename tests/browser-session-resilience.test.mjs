import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');

test('Browser Run sessions request a long keep_alive',()=>{
  assert.match(worker,/devtools\/browser\?keep_alive=600000/);
});

test('CrewLink navigation uses active DOM polling rather than Page.loadEventFired',()=>{
  assert.match(worker,/async function navigateUntil/);
  assert.match(worker,/async function waitUntil/);
  assert.doesNotMatch(worker,/Page\.loadEventFired/);
});

test('Browser session creation retries a transient 429',()=>{
  assert.match(worker,/acquire\.status===429/);
  assert.match(worker,/21000/);
});
