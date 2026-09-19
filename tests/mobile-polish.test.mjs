import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('v0.9.2 mobile polish is present',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../enhancements.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(html,/id="togetherMonthSelect"/);
  assert.match(html,/id="mobileDaySheet"/);
  assert.match(js,/simple-status-short/);
  assert.match(js,/rhOpenMobileDaySheet/);
  assert.match(css,/box-sizing:border-box/);
  assert.match(css,/\.simple-status-recovery/);
  assert.match(css,/\.footer\{display:none\}/);
});
