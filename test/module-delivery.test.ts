import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sha256} from '../src/host/hash.ts';
import {moduleClosure,type ModuleClosureSnapshot} from '../src/host/native/module-closure.ts';
import {deliverModuleClosure,verifyModuleDelivery,type ClosureDelivery} from '../src/host/native/module-delivery.ts';

const limits={members:200,bytes:1_000_000,responseBytes:3_000_000};
const snapshot=(name:string,entries:Record<string,string>,entry='entry.js'):ModuleClosureSnapshot=>({identity:sha256(name),entry,members:new Map(Object.entries(entries).map(([at,source])=>[at,{source,digest:sha256(source)}]))});
const build=(one:ModuleClosureSnapshot,name='need/custom')=>deliverModuleClosure([name],new Map([[name,one]]),()=>undefined,limits);

/** Test host only. Production browser adapters remain in their own repository. */
function installed(offered:ClosureDelivery,need:string,tamper=false):string {
 const delivery=verifyModuleDelivery(offered.bytes,offered.digest,limits);
 const root=realpathSync(mkdtempSync(join(tmpdir(),'bound-delivery-consumer-')));
 try{
  writeFileSync(join(root,'package.json'),'{"type":"module"}');
  for(const file of delivery.files){mkdirSync(dirname(join(root,file.path)),{recursive:true});writeFileSync(join(root,file.path),file.source)}
  if(tamper){const entry=delivery.manifest.needs.find(n=>n.name===need)!;const file=delivery.manifest.modules.find(m=>m.snapshot===entry.snapshot&&m.coordinate===entry.entry)!;writeFileSync(join(root,file.path),'console.log("UNVERIFIED_EFFECT"); export const result=0;')}
  const mapping=delivery.importMap,expected=Object.fromEntries(delivery.manifest.modules.map(m=>[new URL(m.path,pathToFileURL(root+'/')).href,m.digest]));
  const hook=`import{registerHooks}from'node:module';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
const base=${JSON.stringify(pathToFileURL(root+'/').href)},map=${JSON.stringify(mapping)},expected=${JSON.stringify(expected)};
registerHooks({resolve(s,c,next){let target=map.imports[s];for(const [scope,values]of Object.entries(map.scopes))if(c.parentURL?.startsWith(new URL(scope,base).href)&&values[s])target=values[s];const r=next(target?new URL(target,base).href:s,c);if(!Object.hasOwn(expected,r.url))throw Error('outside verified closure');return r},load(u,c,next){const b=readFileSync(new URL(u));if('sha256:'+createHash('sha256').update(b).digest('hex')!==expected[u])throw Error('changed delivered bytes');return next(u,c)}});`;
  const result=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(hook),'--input-type=module','-e',`console.log(JSON.stringify((await import(${JSON.stringify(need)})).result));`],{cwd:root,env:{...process.env,NODE_OPTIONS:''},encoding:'utf8',timeout:4000});
  if(tamper){assert.notEqual(result.status,0);assert.match(result.stderr,/changed delivered bytes/);assert.doesNotMatch(result.stdout,/UNVERIFIED_EFFECT/);return 'REFUSE'}
  assert.equal(result.status,0,result.stderr);return result.stdout.trim();
 }finally{rmSync(root,{recursive:true,force:true})}
}

for(const [name,result] of [['catalogue/notice',7],['weather/reading',13]] as const)test('unchanged executable files install without checkout resolution: '+name,()=>{
 const lib=snapshot(name+'/library',{'data.js':`export const value=${result};`},'data.js');
 const one=snapshot(name,{'entry.js':"import {value} from 'domain/data'; export const result=value;",'unused.js':"throw Error('must not ship');"});
 const delivery=deliverModuleClosure([name],new Map([[name,one]]),s=>s==='domain/data'?lib:undefined,limits);
 assert.equal(delivery.files.length,2);assert.notEqual(delivery.closure,delivery.digest);
 assert.equal(verifyModuleDelivery(delivery.bytes,delivery.digest,limits).digest,delivery.digest);
 for(const m of delivery.manifest.modules)assert.equal(sha256(delivery.files.find(f=>f.path===m.path)!.source),m.digest);
 assert.equal(installed(delivery,name),String(result));
});

test('root order and repeated needs preserve exact delivery bytes; shared cycle uses existing traversal',()=>{
 const one=snapshot('cycle',{'entry.js':"import './other.js'; export const result=2;",'other.js':"import './entry.js';"});
 const entries=new Map([['arbitrary/one',one],['arbitrary/two',one]]);
 const a=deliverModuleClosure(['arbitrary/two','arbitrary/one','arbitrary/one'],entries,()=>undefined,limits);
 const b=deliverModuleClosure(['arbitrary/one','arbitrary/two'],entries,()=>undefined,limits);
 assert.deepEqual(a.bytes,b.bytes);assert.equal(a.files.length,2);assert.equal(installed(a,'arbitrary/two'),'2');
 assert.equal(moduleClosure(one,()=>undefined).length,2,'existing single-root API retained');
});

test('unknown needs, missing dependency and altered source refuse before delivery',()=>{
 const one=snapshot('missing',{'entry.js':"import './absent.js';"});
 assert.throws(()=>deliverModuleClosure(['missing'],new Map(),()=>undefined,limits),/unknown need/);
 assert.throws(()=>build(one),/module closure missing/);
 const good=snapshot('changed',{'entry.js':'export const result=1;'});
 const changed={...good,members:new Map([['entry.js',{source:'export const result=2;',digest:good.members.get('entry.js')!.digest}]])};
 assert.throws(()=>build(changed),/bytes differ/);
});

test('calculated/escaped loads, CommonJS and builtins retain pre-execution refusal',()=>{
 for(const source of ["globalThis.effect=1; import(globalThis.target);","globalThis.effect=1; const load=require; load('x');","require('fs');","import 'node:fs';","import 'node:module';"]){
  assert.throws(()=>build(snapshot(source,{'entry.js':source})),/REFUSE·module closure/);
 }
 assert.equal((globalThis as {effect?:number}).effect,undefined);
});

test('member, source, response and cancellation budgets apply without defaults',()=>{
 const one=snapshot('budget',{'entry.js':'export const result=1;'}),entry=new Map([['need',one]]);
 for(const bad of [{...limits,members:0},{...limits,bytes:4},{...limits,responseBytes:1},{...limits,signal:AbortSignal.abort()}])assert.throws(()=>deliverModuleClosure(['need'],entry,()=>undefined,bad),/resources|cancelled/);
 const two=snapshot('two',{'entry.js':"import './dep.js';",'dep.js':'export const x=1;'});
 assert.throws(()=>deliverModuleClosure(['need'],new Map([['need',two]]),()=>undefined,{...limits,members:1}),/resources/);
});

test('delivered bytes, omitted bindings and surplus executable files are independently verified',()=>{
 const lib=snapshot('lib',{'entry.js':'export const x=1;'}),one=snapshot('root',{'entry.js':"import {x} from 'domain/x'; export const result=x;"});
 const delivery=deliverModuleClosure(['need'],new Map([['need',one]]),()=>lib,limits);
 const altered=new Uint8Array(delivery.bytes);altered[altered.length-4]^=1;
 assert.throws(()=>verifyModuleDelivery(altered,delivery.digest,limits),/bundle bytes differ/);
 const absent=JSON.parse(new TextDecoder().decode(delivery.bytes));absent.manifest.libraries=[];
 const raw=Buffer.from(JSON.stringify(absent));assert.throws(()=>verifyModuleDelivery(raw,sha256(raw),limits),/unpinned library/);
 const extra=JSON.parse(new TextDecoder().decode(delivery.bytes));extra.files.push({path:'surplus.js',source:'throw Error("extra")'});
 const bytes=Buffer.from(JSON.stringify(extra));assert.throws(()=>verifyModuleDelivery(bytes,sha256(bytes),limits),/manifest resources/);
});

test('materialized bytes are checked again before the consumer executes them',()=>{
 assert.equal(installed(build(snapshot('consumer-tamper',{'entry.js':'export const result=1;'})),'need/custom',true),'REFUSE');
});

test('distribution notices stay pinned beside modules without becoming executable entries',()=>{
 const one=snapshot('notice',{'entry.js':'export const result=1;'}),source='Copyright example. Permission granted under MIT.';
 const notice={snapshot:one.identity,coordinate:'LICENSE',digest:sha256(source),source};
 const delivery=deliverModuleClosure(['need'],new Map([['need',one]]),()=>undefined,limits,[notice]);
 assert.equal(delivery.manifest.modules.length,1);assert.equal(delivery.files.length,2);
 assert.equal(delivery.manifest.notices.length,1);
 assert.equal(verifyModuleDelivery(delivery.bytes,delivery.digest,limits).digest,delivery.digest);
 assert.throws(()=>deliverModuleClosure(['need'],new Map([['need',one]]),()=>undefined,limits,[{...notice,source:'changed'}]),/notice bytes/);
});

test('URL-special coordinates, unsupported extensions and ambiguous snapshot identities refuse',()=>{
 assert.throws(()=>build(snapshot('hash',{'entry#x.js':'export const x=1;'},'entry#x.js')),/URL coordinate/);
 assert.throws(()=>build(snapshot('percent',{'entry.js':"import './%64ep.js';",'%64ep.js':'export const x=1;'})),/URL specifier/);
 assert.throws(()=>build(snapshot('cjs',{'entry.cjs':'exports.x=1;'},'entry.cjs')),/unsupported ESM member/);
 const a=snapshot('same',{'entry.js':'export const x=1;'}),b=snapshot('same',{'entry.js':'export const x=2;'});
 assert.throws(()=>deliverModuleClosure(['a','b'],new Map([['a',a],['b',b]]),()=>undefined,limits),/ambiguous snapshot/);
 assert.throws(()=>build(snapshot('bad-json',{'entry.json':'not JSON'},'entry.json')),/invalid JSON member/);
});
