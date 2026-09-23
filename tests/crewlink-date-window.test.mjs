import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync(new URL('../crewlink-sync.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');

test('manual CrewLink dates are constrained from today to the last selectable date',()=>{
  assert.match(client,/function crewlinkSelectableWindow/);
  assert.match(client,/clStart'\)\.min=selectable\.min/);
  assert.match(client,/clStart'\)\.max=selectable\.max/);
  assert.match(client,/clEnd'\)\.min=selectable\.min/);
  assert.match(client,/clEnd'\)\.max=selectable\.max/);
  assert.match(client,/clStart'\)\.value=selectable\.min/);
  assert.match(client,/clEnd'\)\.value=selectable\.max/);
});

test('Auto Sync uses today through the last day of month plus two',()=>{
  assert.match(worker,/function crewlinkSelectableRange/);
  assert.match(worker,/getUTCMonth\(\)\+3,0/);
  assert.match(worker,/function autoRange\(now=new Date\(\)\)\{\s*return crewlinkSelectableRange\(now\);/);
  assert.match(worker,/payload\.start<allowed\.start/);
  assert.match(worker,/payload\.end>allowed\.end/);
});
