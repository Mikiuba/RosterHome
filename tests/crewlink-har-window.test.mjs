import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');

test('browserSync returns the selected range and live range when CrewLink exposes it',()=>{
  assert.match(worker,/range:selectedRange/);
  assert.match(worker,/availableRange:availableStart&&availableEnd\?\{start:availableStart,end:availableEnd\}:null/);
});
