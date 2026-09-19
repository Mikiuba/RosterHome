import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readEnhancementsSource} from './_enhancements-source.mjs';

test('enhancements use many small repository fragments',()=>{
  const dir=new URL('../enhancements-parts/',import.meta.url);
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.txt'));
  assert.ok(files.length>=8);
  for(const f of files) assert.ok(fs.statSync(new URL(f,dir)).size<9000);
  const source=readEnhancementsSource();
  assert.match(source,/Together/);
  assert.match(source,/Mobile calendar polish/);
  assert.match(source,/Offline\/PWA status/);
});
