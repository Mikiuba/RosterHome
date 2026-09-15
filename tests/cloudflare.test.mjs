import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';

test('worker status advertises local browser bridge', async()=>{
  const r=await worker.fetch(new Request('https://example.test/api/crewlink/status'),{ASSETS:{fetch(){throw new Error('not used')}}});
  assert.equal(r.status,200);
  const j=await r.json();
  assert.equal(j.version,'0.6.2');
  assert.equal(j.transport,'local-chrome-bridge');
  assert.equal(j.mode,'browser-extension');
});
