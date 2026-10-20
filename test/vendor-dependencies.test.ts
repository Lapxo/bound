import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {sha256} from '../src/host/hash.ts';
import {dependencyDelivery} from '../tools/vendor-dependencies.ts';
import {verifyModuleDelivery} from '../src/host/native/module-delivery.ts';

const limits={members:200,bytes:1_000_000,responseBytes:3_000_000};
test('retained dependency source verifies the fixed build closure without runtime npm resolution',()=>{
 const pins=JSON.parse(readFileSync(new URL('../vendor/dependencies.json',import.meta.url),'utf8'));
 const manifest=JSON.parse(readFileSync(new URL('../vendor/'+pins.delivery.path,import.meta.url),'utf8'));
 const sources=JSON.parse(readFileSync(new URL('../vendor/'+pins.sources.path,import.meta.url),'utf8'));
 const files=[...manifest.modules.map((m:{path:string;snapshot:string;coordinate:string})=>({path:m.path,source:sources.packages.find((p:{archive:string})=>p.archive===m.snapshot).files.find((f:{coordinate:string})=>'package/'+f.coordinate===m.coordinate).source})),...manifest.notices.map((n:{path:string;snapshot:string})=>({path:n.path,source:sources.packages.find((p:{archive:string})=>p.archive===n.snapshot).license.source}))];
 const bytes=Buffer.from(JSON.stringify({manifest,files}));
 const delivery=verifyModuleDelivery(bytes,pins.delivery.digest,pins.delivery.limits);
 const archives=new Set(pins.packages.map((p:{digest:string})=>p.digest));
 assert.ok(delivery.manifest.modules.every(m=>archives.has(m.snapshot)));
 assert.ok(pins.packages.every((p:{digest:string})=>delivery.manifest.notices.some(n=>n.snapshot===p.digest)));
 assert.deepEqual(pins.openNeeds,[],'no unresolved dependency in the selected runtime build');
 assert.equal(delivery.manifest.needs.some(n=>n.name==='@lapxo/topos/object-provider'),false);
 assert.equal(pins.delivery.runtimeIntegration,'build-relocation@1');
});
function archive(name:string,source:string,license=true){
 const dir=mkdtempSync(join(tmpdir(),'dependency-archive-'));
 try{
  mkdirSync(join(dir,'package','dist'),{recursive:true});
  writeFileSync(join(dir,'package','package.json'),JSON.stringify({name,version:'1.0.0',type:'module',exports:{'.':{default:'./dist/index.js'}}}));
  writeFileSync(join(dir,'package','dist','index.js'),source);
  writeFileSync(join(dir,'package','dist','unused.js'),'throw Error("not reached");');
  if(license)writeFileSync(join(dir,'package','LICENSE'),'Fixture license\n');
  const bytes=execFileSync('tar',['-czf','-','-C',dir,'package'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
  return {name,version:'1.0.0',digest:sha256(bytes),bytes};
 }finally{rmSync(dir,{recursive:true,force:true})}
}

test('vendored files retain exact source and license; inventory does not execute source',()=>{
 const source='export const value=7; throw Error("must not execute during vendoring");\n';
 const delivery=dependencyDelivery([archive('fixture/one',source)],['fixture/one'],limits);
 assert.equal(delivery.manifest.modules.length,1);
 assert.equal(delivery.manifest.notices.length,1);
 assert.equal(delivery.files.find(f=>f.path.endsWith('/dist/index.js'))?.source,source);
 assert.equal(delivery.files.find(f=>f.path.endsWith('/LICENSE'))?.source,'Fixture license\n');
 assert.equal(delivery.files.some(f=>f.path.endsWith('/unused.js')),false);
});
test('changed archive and mismatched package metadata refuse before materialization',()=>{
 const original=archive('fixture/one','export const value=7;');
 const changed={...original,bytes:new Uint8Array(original.bytes)};changed.bytes[0]^=1;
 assert.throws(()=>dependencyDelivery([changed],['fixture/one'],limits),/archive bytes differ/);
 assert.throws(()=>dependencyDelivery([{...original,name:'fixture/other'}],['fixture/other'],limits),/package identity differs/);
});
test('license cannot be dropped from a vendored dependency',()=>{
 assert.throws(()=>dependencyDelivery([archive('fixture/one','export const value=7;',false)],['fixture/one'],limits),/license absent/);
});
test('npm or checkout resolution cannot fill an unpinned transitive dependency',()=>{
 const one=archive('fixture/one',"export {value} from '@lapxo/topos/wire';");
 assert.throws(()=>dependencyDelivery([one],['fixture/one'],limits),/unpinned library/);
});
test('calculated imports and CommonJS loaders remain explicit refusals',()=>{
 for(const source of ['export const open=name=>import(name);',"export const open=()=>require('external');"]){
  assert.throws(()=>dependencyDelivery([archive('fixture/one',source)],['fixture/one'],limits),/unresolved|CommonJS load/);
 }
});
test('need order does not change the exact delivery identity',()=>{
 const a=archive('fixture/one','export const value=7;'),b=archive('fixture/two','export const value=9;');
 const first=dependencyDelivery([a,b],['fixture/one','fixture/two'],limits);
 const second=dependencyDelivery([b,a],['fixture/two','fixture/one'],limits);
 assert.equal(first.digest,second.digest);assert.deepEqual(first.bytes,second.bytes);
});
