import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function readEnhancementsSource(){
  const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../enhancements-parts');
  return fs.readdirSync(dir)
    .filter(f=>/^[0-9]+\.txt$/.test(f))
    .sort()
    .map(f=>fs.readFileSync(path.join(dir,f),'utf8'))
    .join('');
}
