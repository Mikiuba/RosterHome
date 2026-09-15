import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Browser Run transport uses current binding CDP endpoints', () => {
  const source=fs.readFileSync(new URL('../cloudflare/worker.mjs',import.meta.url),'utf8');
  assert.match(source,/https:\/\/fake\.host/);
  assert.match(source,/\/v1\/devtools\/browser\?/);
  assert.match(source,/\/v1\/devtools\/browser\/\$\{encodeURIComponent\(info\.sessionId\)\}/);
  assert.doesNotMatch(source,/browser\.internal|\/v1\/acquire|connectDevtools/);
});
