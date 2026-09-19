import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('v0.9.0 precaches the app shell for offline use',()=>{
  const sw=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
  for(const asset of ['./index.html','./styles.css','./storage.js','./roster-parser.js','./ftl-engine.js','./app.js','./enhancements.js','./crewlink-sync.js']){
    assert.match(sw,new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
  assert.match(sw,/request\.mode==='navigate'/);
  assert.match(sw,/cache\.match\('\.\/index\.html'/);
  assert.match(sw,/startsWith\('\/api\/'\)/);
});

test('offline UI and FTL month spacing are explicit',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const js=fs.readFileSync(new URL('../enhancements.js',import.meta.url),'utf8');
  const crew=fs.readFileSync(new URL('../crewlink-sync.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

  assert.match(html,/id="offlineBadge"/);
  assert.match(js,/navigator\.onLine/);
  assert.match(js,/Sin conexión · datos guardados/);
  assert.match(crew,/Para actualizar desde CrewLink necesitas conexión a internet/);
  assert.match(css,/#ftlMonth\{[\s\S]*margin:0 0 18px!important/);
});
