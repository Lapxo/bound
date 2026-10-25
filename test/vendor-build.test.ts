import assert from 'node:assert/strict';
import {test} from 'node:test';
import {relocateImports} from '../build/vendor-build.ts';

test('vendor relocation changes executable import literals, never strings in program data',()=>{
 const source=`import {value} from 'fixed/module'; export * from 'fixed/module';
 const message='fixed/module'; const late=name=>import(name); const literal=()=>import('fixed/module');`;
 const result=relocateImports(source,'/build/dist/main.js',name=>name==='fixed/module'?'/build/dist/vendor/module.js':undefined);
 assert.match(result,/from "\.\/vendor\/module.js"/);
 assert.match(result,/import\("\.\/vendor\/module.js"\)/);
 assert.ok(result.includes("const message='fixed/module'"));
 assert.ok(result.includes('name=>import(name)'));
});
test('public import types use delivered vendor declarations without changing the original type',()=>{
 const source=`export type Value=import('fixed/module').Value; export type {Other} from 'fixed/module';`;
 const result=relocateImports(source,'/build/dist/main.d.ts',(name,types)=>name==='fixed/module'&&types?'/build/dist/vendor/module.d.ts':undefined);
 assert.match(result,/import\("\.\/vendor\/module.js"\)\.Value/);
 assert.match(result,/from "\.\/vendor\/module.js"/);
});
