import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');

test('makeReport is posted inside the authenticated browser without navigating the CDP context',()=>{
  assert.match(worker,/const reportViaFetchExpr=/);
  assert.match(worker,/body\.set\('crewlinkService','individualDutyPlan'\)/);
  assert.match(worker,/body\.set\('crewlinkOperation','makeReport'\)/);
  assert.match(worker,/body\.set\('buddyName',''\)/);
  assert.match(worker,/body\.set\('beginDate'/);
  assert.match(worker,/body\.set\('endDate'/);
  assert.match(worker,/fetch\('clApp'/);
  assert.match(worker,/credentials:'include'/);
  assert.match(worker,/DOMParser/);
});

test('navigation fallback is deferred until Runtime.evaluate has returned',()=>{
  assert.match(worker,/setTimeout\(\(\)=>\{try\{if\(btn&&f\.requestSubmit\)/);
  assert.match(worker,/\},250\);return \{ok:true\}/);
  assert.match(worker,/Page\.frameNavigated/);
});
