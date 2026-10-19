import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {readRootStandingInProcess} from '../src/host/in-process.ts';
import type {RootStandingHostContext} from '../src/host/in-process.ts';
import {admissionHistoryAt,admissionAnchor} from '../src/fold/admission-history.ts';
import {sha256} from '../src/host/hash.ts';
import {canonical} from '@lapxo/topos/wire';
import {land,landMemo,storeOf} from '../src/land/ledger.ts';
import {underTheRegions} from '../src/land/act.ts';
import {PLACE_ACT_CONTEXT} from '@lapxo/topos/core';
import {actingRootFixture} from './support/acting-root.ts';

const tree=(at:string):string=>sha256(readdirSync(at).sort().map(n=>{const p=join(at,n);return n+':'+(statSync(p).isDirectory()?tree(p):sha256(readFileSync(p)))}).join('\n'));
const input=(fixture:ReturnType<typeof actingRootFixture>,place:string)=>{
 const bytes=Buffer.from(admissionHistoryAt(fixture.root,Number.MAX_SAFE_INTEGER).join('\n')+'\n');
 const context:RootStandingHostContext={place,source:'snapshot:'+place,snapshot:sha256(bytes),anchor:admissionAnchor(fixture.root),reading:{instrument:sha256('declared fixture instrument'),implementation:sha256('declared fixture implementation'),policy:sha256('declared fixture policy'),inputs:[],environment:[['node',sha256(process.version)]]},limits:{timeoutMs:2000,maxBytes:262144,records:512}};
 return {bytes,context};
};
for(const place of ['water-quality','editorial-register'])test(`in-process Root standing agrees with the real CLI component and writes no files: ${place}`,async()=>{
 const fixture=actingRootFixture(place);
 try{
  const expected=fixture.run(['fold','--as','standing']);assert.equal(expected.status,0,expected.stderr);
  const {context,bytes}=input(fixture,place),before=tree(fixture.root);let calls=0;
  const port={read:async(source:string,digest:string)=>{assert.equal(source,context.source);assert.equal(digest,context.snapshot);calls++;return bytes}};
  const first=await readRootStandingInProcess(context,port);assert.equal(first.kind,'fact');if(first.kind!=='fact')return;
  const carrier=JSON.parse(expected.stdout);assert.equal(carrier.profile,PLACE_ACT_CONTEXT);assert.deepEqual(first.value.rootStanding,carrier.root);assert.equal(tree(fixture.root),before);
  const second=await readRootStandingInProcess(context,port);assert.deepEqual(second,first);assert.equal(calls,2,'no hidden source cache substitutes a fresh port read');assert.equal(tree(fixture.root),before);
  const limited=await readRootStandingInProcess({...context,limits:{...context.limits,records:1}},port);assert.equal(limited.kind,'refuse');if(limited.kind==='refuse')assert.equal(limited.code,'host/budget');
  const altered=await readRootStandingInProcess(context,{read:async()=>Buffer.concat([bytes,Buffer.from('x')])});assert.equal(altered.kind,'refuse');if(altered.kind==='refuse')assert.equal(altered.code,'host-port/integrity');
  const controller=new AbortController();controller.abort();const cancelled=await readRootStandingInProcess({...context,signal:controller.signal},{read:async()=>{throw Error('must not read')}});assert.equal(cancelled.kind,'refuse');if(cancelled.kind==='refuse')assert.equal(cancelled.code,'host/cancelled');
  const missing=await readRootStandingInProcess({...context,reading:{...context.reading,environment:undefined} as never},{read:async()=>{throw Error('unknown context must not invoke port')}});assert.equal(missing.kind,'refuse');assert.equal(tree(fixture.root),before);
 }finally{fixture.close()}
});

test('concurrent calls keep receiver authority and identity isolated',async()=>{
 const left=actingRootFixture('archive'),right=actingRootFixture('weather');
 try{
  const a=input(left,'archive'),b=input(right,'weather');
  const [one,two]=await Promise.all([readRootStandingInProcess(a.context,{read:async()=>a.bytes}),readRootStandingInProcess(b.context,{read:async()=>b.bytes})]);
  assert.equal(one.kind,'fact');assert.equal(two.kind,'fact');if(one.kind!=='fact'||two.kind!=='fact')return;
  assert.notEqual(one.value.reading,two.value.reading);
  const foreign=await readRootStandingInProcess({...a.context,snapshot:b.context.snapshot},{read:async()=>b.bytes});assert.equal(foreign.kind,'refuse','foreign bytes cannot select their own receiver anchor');
  assert.deepEqual(await readRootStandingInProcess(a.context,{read:async()=>a.bytes}),one,'another place cannot poison this call');
  const controller=new AbortController();const cancelled=readRootStandingInProcess({...a.context,signal:controller.signal},{read:async()=>new Promise(()=>{})});controller.abort();const stopped=await cancelled;assert.equal(stopped.kind,'refuse');
 }finally{left.close();right.close()}
});

test('importing the host does not inspect the embedding application argv or execute the CLI',()=>{
 const module=pathToFileURL(join(process.cwd(),'src/host/in-process.ts')).href;
 const script=`const descriptor=Object.getOwnPropertyDescriptor(process,'argv');Object.defineProperty(process,'argv',{configurable:true,get(){throw Error('consumer argv inspected')}});try{const api=await import(${JSON.stringify(module)});if(typeof api.readRootStandingInProcess!=='function')throw Error('missing host')}finally{Object.defineProperty(process,'argv',descriptor)};console.log('host imported without CLI');`;
 assert.equal(execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'}).trim(),'host imported without CLI');
});

for(const place of ['river-samples','library-register'])test(`write identity separates Root declarations from operational maintenance: ${place}`,async()=>{
 const fixture=actingRootFixture(place);
 try{
  const read=async()=>{const {context,bytes}=input(fixture,place);return readRootStandingInProcess(context,{read:async()=>bytes})};
  const before=await read();assert.equal(before.kind,'fact');if(before.kind!=='fact')return;
  const store=storeOf(fixture.root);
  landMemo(store,'host-maintenance-probe',Buffer.from('operational memo'));
  land(store,'folder',[canonical({scope:'beat/host-probe',measure:'ms',value:'1..1',form:'interval',role:'writes',by:'folder',at:'place:kept'})]);
  await underTheRegions(store,['host-probe'],'identity probe',async()=>assert.deepEqual(await read(),before));
  assert.deepEqual(await read(),before,'memo, beat and lock do not enter authenticated Root history');
  const proposal=join(fixture.temp,'declaration.bound');
  writeFileSync(proposal,canonical({scope:'sample/notice',measure:'id',value:'present',form:'alphabet',role:'writes',by:'target',at:'policy:write-identity'})+'\n');
  const admitted=fixture.run(['land',proposal,'--key','owner','--key-file',fixture.key]);assert.equal(admitted.status,0,admitted.stderr);
  const after=await read();assert.equal(after.kind,'fact');if(after.kind!=='fact')return;
  assert.notEqual(after.value.reading,before.value.reading,'a consumed admitted declaration changes Root reading identity');
  assert.notEqual(after.value.result,before.value.result);
 }finally{fixture.close()}
});
