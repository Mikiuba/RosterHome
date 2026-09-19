const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
const files=['index.html','styles.css','app.js','storage.js','roster-parser.js','roster-history.js','ftl-engine.js','manifest.webmanifest','service-worker.js','crewlink-changes.js','crewlink-sync.js','calendar-export.js'];
const allowed=new Set([...files,'enhancements.js']);
for(const file of fs.readdirSync(out)){if(!allowed.has(file))throw Error('Unexpected existing build file: '+file);}
for(const file of files)fs.copyFileSync(path.join(root,file),path.join(out,file));
const partsDir=path.join(root,'enhancements-parts');
const parts=fs.readdirSync(partsDir).filter(f=>/^[0-9]+\.part$/.test(f)).sort();
if(!parts.length)throw Error('No enhancement fragments found.');
fs.writeFileSync(path.join(out,'enhancements.js'),parts.map(f=>fs.readFileSync(path.join(partsDir,f),'utf8')).join(''),'utf8');
console.log('Built '+(files.length+1)+' public assets; enhancements.js from '+parts.length+' fragments.');
