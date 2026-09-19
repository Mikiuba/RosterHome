import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readEnhancementsSource} from './_enhancements-source.mjs';

test('enhancements are stored as small fragments',()=>{
  const dir=new URL('../enhancements-parts/',import.meta.url);
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.part'));
  assert.ok(files.length>=3);
  for(const f of files) assert.ok(fs.statSync(new URL(f,dir)).size<25000);
  const source=readEnhancementsSource();
  assert.match(source,/Together/);
  assert.match(source,/Mobile calendar polish/);
  assert.match(source,/Offline\/PWA status/);
  assert.doesNotMatch(source,/Exportación operativa a Apple Calendar/);
});
