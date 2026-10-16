import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {dirname,join,normalize} from 'node:path';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
// Rebuild from source so removed modules cannot survive into a release archive.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--build', '--force'], { cwd: root, stdio: 'inherit' });

// A forced build does not reuse the compiler cache; leave only the build outputs.
const config = JSON.parse(readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'));
const cache = config.compilerOptions?.tsBuildInfoFile;
if (cache) {
  const at = new URL(cache, new URL('../', import.meta.url));
  if (!fileURLToPath(at).startsWith(root)) throw new Error('Compiler cache is outside the project');
  rmSync(at, { force: true });
}

// Public type roots and their relative imports must be delivered together.
// Internal declarations outside that closure are not part of the package API.
const pkg = JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const delivered = new Set(pkg.files.filter((file:string)=>file.endsWith('.d.ts')));
const roots = new Set<string>([pkg.types]);
function typeRoots(value:unknown):void {
  if(!value||typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)){
    if(key==='types'&&typeof item==='string')roots.add(item.replace(/^\.\//,''));
    else typeRoots(item);
  }
}
typeRoots(pkg.exports);
const compiler=require('typescript');
for(const file of new Set([...roots,...delivered] as string[])){
  if(!delivered.has(file))throw Error('Public declaration is not delivered: '+file);
  const parsed=compiler.preProcessFile(readFileSync(new URL('../'+file,import.meta.url),'utf8'),true,true);
  for(const reference of [...parsed.importedFiles,...parsed.referencedFiles]){
    if(!reference.fileName.startsWith('.'))continue;
    const base=normalize(join(dirname(file),reference.fileName));
    const dependency=base.endsWith('.d.ts')?base:base.endsWith('.ts')||base.endsWith('.js')?base.slice(0,-3)+'.d.ts':base+'.d.ts';
    if(!delivered.has(dependency))throw Error('Public declaration dependency is not delivered: '+file+' -> '+dependency);
  }
}
