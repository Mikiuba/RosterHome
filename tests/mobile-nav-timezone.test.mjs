import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('v0.9.0 keeps mobile tabs readable and exposes timezone selector',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

  assert.match(html,/<select id="homeTz">/);
  for(const tz of ['Europe/Athens','Europe/Madrid','Europe/Lisbon','Europe/Berlin','Asia/Kolkata','UTC']){
    assert.match(html,new RegExp(`value="${tz.replace('/','\\/')}"`));
  }

  assert.match(css,/\.tabs \.tab\{[\s\S]*flex:0 0 auto!important/);
  assert.match(css,/white-space:nowrap!important/);
  assert.match(css,/\.month-view \.simple-status-time\{[\s\S]*display:none!important/);
});
