import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {parse} from '@lapxo/topos/wire';
import {sha256} from '../src/host/hash.ts';
import {deliverModuleClosure,type ModuleClosureSnapshot} from '../src/host/native/module-delivery.ts';
import {moduleInventory} from '../src/host/native/module-inventory.ts';

const limits={members:20,bytes:100_000,responseBytes:200_000};
const snapshot=(name:string,files:Record<string,string>):ModuleClosureSnapshot=>({identity:sha256(name),entry:'entry.js',members:new Map(Object.entries(files).map(([coordinate,source])=>[coordinate,{source,digest:sha256(source)}]))});
const build=(one:ModuleClosureSnapshot)=>deliverModuleClosure(['need/value'],new Map([['need/value',one]]),()=>undefined,limits);
const context={scope:'consumer/modules',by:'consumer',at:'policy:module-inventory'};
const inventoryOf=(bytes:Uint8Array,digest:string,sources:Parameters<typeof moduleInventory>[3])=>moduleInventory(bytes,digest,limits,sources,context);
const metadata=(one:ModuleClosureSnapshot)=>[{snapshot:one.identity,source:'example/value',version:'1.0.0'}];

test('module inventory projects exact verified modules as canonical data lines',()=>{
 const one=snapshot('first',{'entry.js':"import './value.js'; export const value=1;",'value.js':'export const value=1;','unreached.js':'throw Error("unreached");'});
 const delivery=build(one),inventory=inventoryOf(delivery.bytes,delivery.digest,metadata(one));
 assert.equal(inventory.modules.length,2);
 assert.equal(inventory.closure,delivery.closure);
 assert.equal(inventory.delivery,delivery.digest);
 assert.deepEqual(inventory.lines.trim().split('\n').map(line=>{const row=parse(line);assert.equal(row.kind,'fact');if(row.kind!=='fact')throw Error('expected canonical record');const {format,...metadata}=JSON.parse(row.value.fields.about!);assert.equal(format,'module-inventory-record/1');assert.equal(row.value.fields.value,metadata.digest);assert.equal(row.value.fields.measure,'digest');return metadata}),inventory.modules);
 for(const line of inventory.modules){assert.equal(line.unit,'module');assert.equal(line.reachedFrom,delivery.closure);assert.equal(line.digest,one.members.get(line.module)!.digest)}
 assert.equal(inventory.lines,inventoryOf(delivery.bytes,delivery.digest,metadata(one)).lines);
});

test('an unreachable unit does not enter or alter the delivered executable closure',()=>{
 const one=snapshot('same-pinned-envelope',{'entry.js':'export const value=1;'});
 const extra={...one,members:new Map([...one.members,['unreached.js',{source:'export const unused=2;',digest:sha256('export const unused=2;')}]])};
 const before=build(one),after=build(extra);
 assert.deepEqual(after.bytes,before.bytes);
 assert.equal(inventoryOf(after.bytes,after.digest,metadata(extra)).lines,inventoryOf(before.bytes,before.digest,metadata(one)).lines);
 // A differently authenticated envelope changes provenance, even when reached
 // executable bytes are unchanged; it must not be presented as the same receipt.
 const renamed={...extra,identity:sha256('new-envelope-with-unreached-member')},changed=build(renamed);
 assert.deepEqual(changed.files.map(f=>f.source),before.files.map(f=>f.source));
 assert.notEqual(changed.digest,before.digest);
 assert.notEqual(inventoryOf(changed.bytes,changed.digest,metadata(renamed)).lines,inventoryOf(before.bytes,before.digest,metadata(one)).lines);
});

test('absent or altered module digests refuse through the existing delivery verifier',()=>{
 const one=snapshot('digest',{'entry.js':'export const value=1;'}),delivery=build(one);
 for(const digest of [undefined,sha256('different')]){
  const value=JSON.parse(new TextDecoder().decode(delivery.bytes));
  value.manifest.modules[0].digest=digest;
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  assert.throws(()=>inventoryOf(bytes,sha256(bytes),metadata(one)),/REFUSE·closure delivery/);
 }
 assert.throws(()=>inventoryOf(delivery.bytes,sha256('wrong archive'),metadata(one)),/bundle bytes differ/);
});

test('declared package metadata must cover exactly the verified source snapshots',()=>{
 const one=snapshot('coverage',{'entry.js':'export const value=1;'}),delivery=build(one);
 for(const offered of [[],[...metadata(one),...metadata(one)],[{...metadata(one)[0]!,snapshot:sha256('foreign')}],[{...metadata(one)[0]!,version:''}]]){
  assert.throws(()=>inventoryOf(delivery.bytes,delivery.digest,offered),/REFUSE·module inventory/);
 }
});

test('compiled public engine inventory names only the executable module closure',async()=>{
 const api=await import(new URL('../dist/host/native/module-delivery.js',import.meta.url).href);
 const root=new URL('../',import.meta.url),dist=new URL('dist/',root);
 const pkg=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
 const members=new Map<string,{source:string;digest:string}>();
 for(const name of (readdirSync(dist,{recursive:true}) as string[]).filter(name=>name.endsWith('.js')).sort()){
  const source=readFileSync(new URL(name,dist),'utf8');members.set('dist/'+name,{source,digest:sha256(source)});
 }
 const identityOf=(held:typeof members)=>sha256(JSON.stringify(['build-module-map/1',[...held].map(([name,m])=>[name,m.digest])]));
 const one={identity:identityOf(members),entry:pkg.exports['./engine'].default.replace(/^\.\//,''),members};
 const budget=JSON.parse(readFileSync(new URL('vendor/dependencies.json',root),'utf8')).delivery.limits;
 const deliveryOf=(snapshot:typeof one)=>api.deliverModuleClosure(['consumer/engine'],new Map([['consumer/engine',snapshot]]),()=>undefined,budget);
 const before=deliveryOf(one),inventory=api.moduleInventory(before.bytes,before.digest,budget,[{snapshot:one.identity,source:pkg.name,version:pkg.version}],context);
 assert(inventory.modules.length>0&&inventory.modules.length<members.size);
 for(const m of inventory.modules){assert.equal(m.digest,members.get(m.module)!.digest);assert.equal(m.reachedFrom,before.closure)}
 assert.equal(inventory.lines,api.moduleInventory(before.bytes,before.digest,budget,[{snapshot:one.identity,source:pkg.name,version:pkg.version}],context).lines);
 // A new unused member changes the captured envelope, not the executable set.
 const extra=new Map(members),unused='export const unreachable=1;';
 extra.set('dist/unreached-inventory-test.js',{source:unused,digest:sha256(unused)});
 const after=deliveryOf({...one,identity:identityOf(extra),members:extra});
 assert.deepEqual(after.manifest.modules.map(m=>[m.coordinate,m.digest]),before.manifest.modules.map(m=>[m.coordinate,m.digest]));
 assert.deepEqual(after.files.map(f=>f.source),before.files.map(f=>f.source));
 assert.notEqual(after.digest,before.digest,'changed provenance is not an identical carrier');
 const tampered=JSON.parse(new TextDecoder().decode(before.bytes));tampered.manifest.modules[0].digest=sha256('altered');
 const bytes=new TextEncoder().encode(JSON.stringify(tampered));
 assert.throws(()=>api.moduleInventory(bytes,sha256(bytes),budget,[{snapshot:one.identity,source:pkg.name,version:pkg.version}],context),/REFUSE/);
});
