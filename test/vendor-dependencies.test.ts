import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {sha256} from '../src/host/hash.ts';
import {moduleSnapshot,deliverModuleClosure} from '../src/host/native/module-delivery.ts';
import {verifyModuleDelivery} from '../src/host/native/module-delivery.ts';

const limits={members:200,bytes:1_000_000,responseBytes:3_000_000};
test('retained dependency source verifies the fixed build closure without runtime npm resolution',()=>{
 const pins=JSON.parse(readFileSync(new URL('../vendor/dependencies.json',import.meta.url),'utf8'));
 const manifestBytes=readFileSync(new URL('../vendor/'+pins.delivery.path,import.meta.url));
 const manifest=JSON.parse(manifestBytes.toString('utf8'));
 const sourcesBytes=readFileSync(new URL('../vendor/'+pins.sources.path,import.meta.url));
 assert.equal(sha256(sourcesBytes),pins.sources.digest);
 const sources=JSON.parse(sourcesBytes.toString('utf8'));
 for(const pin of pins.packages){const held=sources.packages.find((p:{archive:string})=>p.archive===pin.digest);assert.ok(held);const manifest=JSON.parse(held.manifest.source);assert.equal(manifest.name,pin.name);assert.equal(manifest.version,pin.version);assert.equal(sha256(held.manifest.source),held.manifest.digest);assert.equal(sha256(held.license.source),held.license.digest);assert.ok(held.license.source.length);}
 const files=[...manifest.modules.map((m:{path:string;snapshot:string;coordinate:string})=>({path:m.path,source:sources.packages.find((p:{archive:string})=>p.archive===m.snapshot).files.find((f:{coordinate:string})=>'package/'+f.coordinate===m.coordinate).source})),...manifest.notices.map((n:{path:string;snapshot:string})=>({path:n.path,source:sources.packages.find((p:{archive:string})=>p.archive===n.snapshot).license.source}))];
 const bytes=Buffer.from(JSON.stringify({manifest,files}));
 // The delivery pin covers this raw UTF-8 bundle, not the stored manifest,
 // a tar/gzip container or output from a compiler. A trailing LF is different bytes.
 assert.equal(sha256(bytes),pins.delivery.digest);
 assert.notEqual(sha256(manifestBytes),pins.delivery.digest);
 const delivery=verifyModuleDelivery(bytes,pins.delivery.digest,pins.delivery.limits);
 assert.throws(()=>verifyModuleDelivery(manifestBytes,pins.delivery.digest,pins.delivery.limits),/bundle bytes differ/);
 assert.throws(()=>verifyModuleDelivery(Buffer.concat([bytes,Buffer.from('\n')]),pins.delivery.digest,pins.delivery.limits),/bundle bytes differ/);
 const altered=Buffer.from(bytes);altered[altered.length-1]^=1;
 assert.throws(()=>verifyModuleDelivery(altered,pins.delivery.digest,pins.delivery.limits),/bundle bytes differ/);
 const archives=new Set(pins.packages.map((p:{digest:string})=>p.digest));
 assert.ok(delivery.manifest.modules.every(m=>archives.has(m.snapshot)));
 assert.ok(pins.packages.every((p:{digest:string})=>delivery.manifest.notices.some(n=>n.snapshot===p.digest)));
 assert.deepEqual(pins.openNeeds,[],'no unresolved dependency in the selected runtime build');
 assert.equal(delivery.manifest.needs.some(n=>n.name==='@lapxo/topos/object-provider'),false);
 assert.equal(pins.delivery.runtimeIntegration,'standard-esm-exports@1');
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


test('unchanged dependency modules and notices use the public closure verifier',()=>{
 const source='export const value=7; throw Error("must not execute during vendoring");\n',pin=archive('fixture/one',source),snapshot=moduleSnapshot(pin.bytes,pin.digest,'package/dist/index.js'),notice={snapshot:pin.digest,coordinate:'package/LICENSE',source:'Fixture license\n',digest:sha256('Fixture license\n')};
 const delivery=deliverModuleClosure(['fixture/one'],new Map([['fixture/one',snapshot]]),()=>undefined,limits,[notice]);
 assert.equal(delivery.manifest.modules.length,1);assert.equal(delivery.manifest.notices.length,1);assert.equal(delivery.files.find(f=>f.path.endsWith('/dist/index.js'))?.source,source);assert.equal(delivery.files.find(f=>f.path.endsWith('/LICENSE'))?.source,notice.source);assert.equal(delivery.files.some(f=>f.path.endsWith('/unused.js')),false);
 const changed=new Uint8Array(pin.bytes);changed[0]^=1;assert.throws(()=>moduleSnapshot(changed,pin.digest,snapshot.entry),/archive bytes differ/);
 assert.throws(()=>deliverModuleClosure(['fixture/other'],new Map([['fixture/one',snapshot]]),()=>undefined,limits),/unknown need/);
 assert.throws(()=>deliverModuleClosure(['fixture/one'],new Map([['fixture/one',snapshot]]),()=>undefined,limits,[{...notice,source:'changed'}]),/notice bytes/);
});
test('the fixed input graph cannot resolve an unpinned transitive dependency',()=>{
 const pin=archive('fixture/one',"export {value} from '@lapxo/topos/wire';"),snapshot=moduleSnapshot(pin.bytes,pin.digest,'package/dist/index.js');
 assert.throws(()=>deliverModuleClosure(['fixture/one'],new Map([['fixture/one',snapshot]]),()=>undefined,limits),/unpinned library/);
});
test('calculated imports and CommonJS loaders remain explicit refusals',()=>{
 for(const source of ['export const open=name=>import(name);',"export const open=()=>require('external');"]){const pin=archive('fixture/one',source),snapshot=moduleSnapshot(pin.bytes,pin.digest,'package/dist/index.js');assert.throws(()=>deliverModuleClosure(['fixture/one'],new Map([['fixture/one',snapshot]]),()=>undefined,limits),/unresolved|CommonJS load/);}
});
test('need and snapshot order do not change the exact public delivery identity',()=>{
 const a=archive('fixture/one','export const value=7;'),b=archive('fixture/two','export const value=9;'),one=moduleSnapshot(a.bytes,a.digest,'package/dist/index.js'),two=moduleSnapshot(b.bytes,b.digest,'package/dist/index.js');
 const first=deliverModuleClosure(['one','two'],new Map([['one',one],['two',two]]),()=>undefined,limits),second=deliverModuleClosure(['two','one'],new Map([['two',two],['one',one]]),()=>undefined,limits);
 assert.equal(first.digest,second.digest);assert.deepEqual(first.bytes,second.bytes);
});
