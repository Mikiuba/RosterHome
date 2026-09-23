import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');

test('CrewLink login verifies the authenticated session through Individual Duty Plan',()=>{
  assert.match(worker,/Page\.frameNavigated/);
  assert.match(worker,/Comprobando sesión y abriendo Individual Duty Plan/);
  assert.match(worker,/authState/);
  assert.match(worker,/CrewLink volvió a la pantalla de acceso/);
  assert.doesNotMatch(worker,/submitAndPoll\(cdp,sessionId,loginExpr/);
});
