import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {moduleImportSyntax} from '../src/host/native/module-syntax.ts';

test('Node linker inventories the compiled instrument without evaluating its modules',()=>{
 const names=(readdirSync(new URL('../dist/',import.meta.url),{recursive:true}) as string[]).filter(p=>p.endsWith('.js')).map(p=>'dist/'+p);
 names.push('vendor/syntax/parser.js','assets/wasm/runtime.js','assets/wasm/guest.js');
 const corpus=names.sort().map(coordinate=>({coordinate,source:readFileSync(new URL('../'+coordinate,import.meta.url),'utf8')}));
 const program=`import{SourceTextModule}from'node:vm';
let text='';for await(const part of process.stdin)text+=part;
const rows=JSON.parse(text).map(({coordinate,source})=>({coordinate,imports:[...new Set(new SourceTextModule(source).dependencySpecifiers)]}));
process.stdout.write(JSON.stringify(rows));`;
 const observed=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',program],{input:JSON.stringify(corpus),encoding:'utf8',timeout:5000});
 assert.equal(observed.status,0,observed.stderr);
 const inventory=JSON.parse(observed.stdout) as {coordinate:string;imports:string[]}[];
 assert.equal(inventory.length,corpus.length);
 for(const [index,row] of inventory.entries()){
  const expected=moduleImportSyntax(corpus[index]!.source,row.coordinate,{esmOnly:false,staticOnly:true});
  assert.deepEqual([...row.imports].sort(),[...expected.imports].sort(),row.coordinate);
  assert.ok(row.imports.every(s=>s.startsWith('.')||s.startsWith('node:')),'runtime npm dependency at '+row.coordinate);
 }
});
