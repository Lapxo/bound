import assert from'node:assert/strict';
import{test}from'node:test';
import{readFileSync}from'node:fs';
import{pathToFileURL,fileURLToPath}from'node:url';
import{join}from'node:path';
import{observe as sourceObserve}from'../tools/samples/engine-reader.ts';

const root=fileURLToPath(new URL('../',import.meta.url)),bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
for(const place of['engine-alphabet','engine-interval'])test('formed engine reader retains captured projection at '+place,async()=>{
 const sample=JSON.parse(readFileSync(join(root,'samples',place,'inputs/sample.json'),'utf8')),compiled=await import(pathToFileURL(join(root,'samples',place,'reader.js')).href);
 assert.deepEqual(Object.keys(compiled),['observe']);
 assert.deepEqual(compiled.observe(bytes(sample)),sourceObserve(bytes(sample)));
 assert.deepEqual(compiled.observe(bytes(sample)),[{scope:'conformance/engine-object/'+sample.name,role:'writes',measure:'count',bound:{kind:'interval',lo:0,hi:0}}]);
 for(const broken of[{...sample,expected:[]},{...sample,history:[...sample.history,'not wire']}]){
  let source:any,actual:any;try{sourceObserve(bytes(broken))}catch(e){source=e}try{compiled.observe(bytes(broken))}catch(e){actual=e}
  assert.ok(source instanceof Error);assert.ok(actual instanceof Error);assert.equal(actual.name,source.name);assert.equal(actual.message,source.message);
 }
});
test('formed engine reader retains the order refusal',async()=>{
 const sample=JSON.parse(readFileSync(join(root,'samples/no/engine-order/inputs/sample.json'),'utf8')),compiled=await import(pathToFileURL(join(root,'samples/no/engine-order/reader.js')).href);
 assert.throws(()=>sourceObserve(bytes(sample)));assert.throws(()=>compiled.observe(bytes(sample)));
});
