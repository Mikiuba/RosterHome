import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';

test('worker status advertises hybrid cloud-browser import', async()=>{
  const env={ASSETS:{fetch(){throw new Error('not used')}},BROWSER:{},ROSTERHOME_ACCESS_KEY:'x'.repeat(32)};
  const r=await worker.fetch(new Request('https://example.test/api/crewlink/status'),env);
  assert.equal(r.status,200);
  const j=await r.json();
  assert.equal(j.version,'1.1.1');
  assert.equal(j.transport,'cloud-browser+local-bridge');
  assert.equal(j.mode,'hybrid');
  assert.equal(j.cloudBrowser,true);
  assert.equal(j.configured,true);
});
