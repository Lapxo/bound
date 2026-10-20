import{test}from'node:test';import assert from'node:assert/strict';import{writeFileSync}from'node:fs';import{spawnSync}from'node:child_process';import{join}from'node:path';import{fileURLToPath}from'node:url';
import{canonical}from'@lapxo/topos/wire';
import{prepareNativeReadingIdentity,nativeHostInstrument}from'../src/host/index.ts';
import{actingRootFixture}from'./support/acting-root.ts';
import{catalogProjectedFixture,catalogReadingInstrument}from'./support/conformance-catalog-reading.ts';
const code=(result:Awaited<ReturnType<typeof prepareNativeReadingIdentity>>)=>{assert.equal(result.kind,'refuse',JSON.stringify(result));return result.kind==='refuse'?result.code:undefined};
const limits={bytes:65536,files:16,readings:16,probes:1};
const row=(scope:string,measure:string,value:string,extra:Record<string,string>={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:fixture',...extra});
const budgetRows=Object.entries(limits).map(([name,n])=>row('reading-identity/'+name,name,'0..'+n,{form:'interval'}));
test('public native preparation refuses undeclared resource bounds, unknown selection and unprojected readers',async()=>{
 const instrument=nativeHostInstrument(fileURLToPath(new URL('../',import.meta.url)),fileURLToPath(new URL('../src/cli/verb.ts',import.meta.url)));
 const f=actingRootFixture('catalog-reading',[],{families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity',fields:'scope|role|form|measure|value|by|at|epoch|sig|about|shape|needs',extraBootstrapRows:[row('wire/shapes','id','run|TARGET.bound'),row('wire/region-measures','id','coordinates'),row('wire/region-coordinate','id','coordinates'),row('reader/sample','reader','reader.js',{shape:'TARGET.bound',needs:'/'})]});
 try{
  const prepare=(reader?:string)=>prepareNativeReadingIdentity({place:f.root,instrument,limits,...(reader?{reader}:{})});
  assert.equal(code(await prepare()),'reading-identity/budget');
  const admit=(rows:string[])=>{const file=join(f.temp,'catalog-lines.bound');writeFileSync(file,rows.join('\n')+'\n');const result=f.run(['land',file,'--key','owner','--key-file',f.key]);assert.equal(result.status,0,result.stderr)};
  admit(budgetRows);const absent=await prepare('absent-reader');assert.equal(code(absent),'reading-identity/selection',JSON.stringify(absent));
  writeFileSync(join(f.root,'reader.js'),'export const observe=()=>[];\n');
  assert.equal(code(await prepare('reader.js')),'reading-identity/projection');
 }finally{f.close()}
});

test('public native preparation names missing execution context from a real legacy projected world',async()=>{
 const instrument=nativeHostInstrument(fileURLToPath(new URL('../',import.meta.url)),fileURLToPath(new URL('../src/cli/verb.ts',import.meta.url)));
 const f=catalogProjectedFixture('catalog-legacy-projection',false);try{const result=await prepareNativeReadingIdentity({place:f.root,instrument,limits});assert.equal(code(result),'reading-identity/context',JSON.stringify(result));}finally{f.close()}
});
test('public native preparation names an unavailable local place as a host execution failure',async()=>{
 const instrument=nativeHostInstrument(fileURLToPath(new URL('../',import.meta.url)),fileURLToPath(new URL('../src/cli/verb.ts',import.meta.url)));
 const result=await prepareNativeReadingIdentity({place:join('/private/tmp','bound-catalog-absent-'+crypto.randomUUID()),instrument,limits});assert.equal(code(result),'reading-identity/failed',JSON.stringify(result));
});
test('public native preparation authenticates a modern retained reading carrier',()=>{
 const f=catalogProjectedFixture('catalog-modern-projection',true);try{
  const selected=catalogReadingInstrument(f.temp),script=join(f.temp,'consumer.mjs');
  // A clean public consumer excludes the test runner's own preload arguments;
  // the CLI and host calls below inherit precisely the same runtime boundary.
  writeFileSync(script,`import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{spawnSync}from'node:child_process';
import{prepareNativeReadingIdentity,nativeHostInstrument}from ${JSON.stringify(new URL('file://'+selected.root+'/dist/host/index.js').href)};
const root=${JSON.stringify(f.root)},selected=${JSON.stringify(selected)},limits=${JSON.stringify(limits)},instrument=nativeHostInstrument(selected.root,selected.entry);
const result=await prepareNativeReadingIdentity({place:root,instrument,limits});assert.equal(result.kind,'fact',JSON.stringify(result));
const folded=spawnSync(process.execPath,[selected.entry,'fold'],{cwd:root,encoding:'utf8',env:{...process.env},timeout:15000});assert.equal(folded.status,0,folded.stderr+folded.stdout);
const retained=await prepareNativeReadingIdentity({place:root,instrument,limits});assert.equal(retained.kind,'fact',JSON.stringify(retained));
const {identity,receipt}=retained.preparations[0].readings[0];assert.ok(receipt,'public preparation reused the real fold receipt');
const carrier=join(root,'.bound/cas/carried',identity.slice(7)),original=readFileSync(carrier);writeFileSync(carrier,'altered retained context');
try{const corrupt=await prepareNativeReadingIdentity({place:root,instrument,limits});assert.equal(corrupt.code,'reading-identity/integrity',JSON.stringify(corrupt));assert.equal(readFileSync(carrier,'utf8'),'altered retained context','inspection never repairs corrupt evidence');}finally{writeFileSync(carrier,original)}
`);
  const execution=spawnSync(process.execPath,[script],{cwd:f.root,encoding:'utf8',env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},timeout:20000});assert.equal(execution.status,0,execution.stderr+execution.stdout);
 }finally{f.close()}
});
