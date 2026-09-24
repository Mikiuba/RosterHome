import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');

test('browserSync returns the exact live CrewLink range used for the PDF',()=>{
  assert.match(worker,/availableRange:\{start:availableStart,end:availableEnd\}/);
  assert.match(worker,/range:selectedRange/);
});
