const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(out,{recursive:true});
// Explicit allowlist: credentials, HAR, server source and documentation never become assets.
const files=['index.html','styles.css','app.js','enhancements.js','storage.js','roster-parser.js','roster-history.js','ftl-engine.js','manifest.webmanifest','service-worker.js','crewlink-changes.js','crewlink-sync.js'];
for(const file of fs.readdirSync(out)){if(!files.includes(file))throw Error('Unexpected existing build file: '+file);}
for(const file of files)fs.copyFileSync(path.join(root,file),path.join(out,file));
console.log('Built '+files.length+' public assets.');
