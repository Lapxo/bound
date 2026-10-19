import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical} from '@lapxo/topos/wire';
import {actingRootFixture} from './support/acting-root.ts';
import {landRootLotInProcess,recoverRootActInProcess,rootLotSnapshot,type RootLotContext,type RootLotPorts} from '../src/host/in-process-root.ts';
import {ownLock} from '../src/observe/runner.ts';
import {sha256} from '../src/host/hash.ts';
import {signBytes} from '../src/host/adapters/keys/ed25519.ts';
import {storeOf} from '../src/land/ledger.ts';
import {nativePublicationStorage} from '../src/host/ports/publication.ts';

const deferred=()=>{let resolve!:()=>void;return {promise:new Promise<void>(r=>resolve=r),resolve:()=>resolve()}};
function offered(f:ReturnType<typeof actingRootFixture>){
 const root=resolve(fileURLToPath(new URL('..',import.meta.url))),bytes=Buffer.from(canonical({scope:'sample/host-note',measure:'id',value:'present',role:'writes',form:'alphabet',by:'target',at:'policy:fixture'})+'\n');let calls=0;
 const limits={timeoutMs:2000,maxBytes:65536,records:64};
 const context:RootLotContext={place:'native receiver',snapshot:rootLotSnapshot(f.root),source:'offered lot',digest:sha256(bytes),reading:{instrument:sha256('fixture instrument'),implementation:sha256('fixture implementation'),policy:sha256('fixture policy'),inputs:[],environment:[['node',sha256(process.version)]]},limits};
 const ports:RootLotPorts={root:f.root,instrumentName:basename(root),runtime:{root,entry:join(root,'src','cli','verb.ts'),directory:join(root,'src'),extension:'.ts',lock:ownLock()},read:async()=>bytes,signer:{keyId:'owner',name:'file',sign:async lot=>{calls++;return lot.bytes.map(bytes=>({keyId:lot.keyId,signature:signBytes(bytes,f.ownerPem,lot.algorithm)}))}},limits:{...limits,diagnostics:262144}};
 return {context,ports,bytes,calls:()=>calls};
}
for(const name of ['botanical-records','harbor-register'])test(`classic Root lot uses the native admission and result: ${name}`,{timeout:15000},async()=>{
 const f=actingRootFixture(name);
 try{
  const a=offered(f),got=await landRootLotInProcess(a.context,a.ports);assert.equal(got.kind,'fact',JSON.stringify(got));if(got.kind!=='fact'||!('identity' in got.value)||!got.value.identity)return;
  assert.equal(got.value.status,'landed');assert.equal(a.calls(),1);
  const native=f.run(['fold','--as','act',got.value.identity]);assert.equal(native.status,0,native.stderr);assert.match(native.stdout,/scope=sample\/host-note/);
  const recovered=recoverRootActInProcess(got.value.identity,a.ports);assert.equal(recovered.kind,'fact');
  const stale=await landRootLotInProcess(a.context,a.ports);assert.equal(stale.kind,'refuse');assert.equal(a.calls(),1);
  const again=await landRootLotInProcess({...a.context,snapshot:rootLotSnapshot(f.root)},a.ports);assert.equal(again.kind,'fact');assert.equal(a.calls(),1);
 }finally{f.close()}
});

test('Root cancellation while the injected signer waits commits no act',{timeout:10000},async()=>{
 const f=actingRootFixture('cancelled-root'),entered=deferred(),controller=new AbortController();
 try{
  const a=offered(f),before=rootLotSnapshot(f.root);
  const run=landRootLotInProcess({...a.context,signal:controller.signal},{...a.ports,signer:{...a.ports.signer,sign:async()=>{entered.resolve();return new Promise(()=>{})}}});await entered.promise;controller.abort();
  const got=await run;assert.equal(got.kind,'refuse');assert.equal(rootLotSnapshot(f.root),before);assert.equal(readFileSync(join(f.root,'TARGET.bound'),'utf8').includes('scope=sample/host-note'),false);
 }finally{controller.abort();f.close()}
});

test('Root publication response loss is uncertain and recoverable by its native identity',async()=>{
 const f=actingRootFixture('root-recovery');
 try{
  const a=offered(f),got=await landRootLotInProcess(a.context,{...a.ports,storage:{publish(staged,committed){nativePublicationStorage.publish(staged,committed);throw Error('fixture reply lost after visibility')}}});
  assert.equal(got.kind,'uncertain',JSON.stringify(got));if(got.kind!=='uncertain')return;
  assert.equal(recoverRootActInProcess(got.identity,a.ports).kind,'fact');assert.equal(a.calls(),1);
  assert.equal(f.run(['fold','--as','act',got.identity]).status,0);
 }finally{f.close()}
});

test('an uncovered Root signer is refused before it is invoked',async()=>{
 const f=actingRootFixture('covered-root');
 try{
  const a=offered(f);let called=false;
  const got=await landRootLotInProcess(a.context,{...a.ports,signer:{keyId:'lane',name:'file',sign:async()=>{called=true;return []}}});
  assert.equal(got.kind,'refuse');assert.equal(called,false);
 }finally{f.close()}
});

test('a real Root change during signing refuses the stale lot instead of rebasing it',async()=>{
 const f=actingRootFixture('root-race');
 try{
  const a=offered(f),file=join(f.temp,'concurrent.bound');writeFileSync(file,canonical({scope:'sample/concurrent',measure:'id',value:'changed',role:'writes',form:'alphabet',by:'target',at:'policy:fixture'})+'\n');
  const got=await landRootLotInProcess(a.context,{...a.ports,signer:{...a.ports.signer,sign:async(lot,signal)=>{const concurrent=f.run(['land',file,'--key','owner','--key-file',f.key]);assert.equal(concurrent.status,0,concurrent.stderr);return a.ports.signer.sign(lot,signal)}}});
  assert.equal(got.kind,'refuse');assert.equal(readFileSync(join(f.root,'TARGET.bound'),'utf8').includes('scope=sample/host-note'),false);
 }finally{f.close()}
});

test('a post-commit render error preserves the native identity as committed',async()=>{
 const f=actingRootFixture('root-render-failure');
 try{
  const a=offered(f),got=await landRootLotInProcess(a.context,{...a.ports,storage:{publish(staged,committed){nativePublicationStorage.publish(staged,committed);mkdirSync(join(f.root,'TARGET.bound.render'))}}});
  assert.equal(got.kind,'fact',JSON.stringify(got));if(got.kind!=='fact'||!('identity' in got.value)||!got.value.identity)return;
  assert.equal(got.value.conformance,'incomplete');assert.equal(recoverRootActInProcess(got.value.identity,a.ports).kind,'fact');assert.equal(a.calls(),1);
 }finally{f.close()}
});

test('Root cancellation after preparation but before visibility publishes nothing',async()=>{
 const f=actingRootFixture('root-prepared-cancel'),controller=new AbortController();
 try{
  const a=offered(f),before=rootLotSnapshot(f.root);let prepared:string|undefined;
  const got=await landRootLotInProcess({...a.context,signal:controller.signal},{...a.ports,prepared:identity=>{prepared=identity;controller.abort()}});
  assert.equal(got.kind,'refuse');assert.ok(prepared);assert.equal(rootLotSnapshot(f.root),before);assert.equal(recoverRootActInProcess(prepared!,a.ports).kind,'refuse');
 }finally{f.close()}
});

test('Root host import and real admission do not inspect consumer argv or console',{timeout:15000},()=>{
 const f=actingRootFixture('embedded-root');
 try{
  const a=offered(f),api=new URL('../src/host/in-process-root.ts',import.meta.url).href;
  // Only a disposable fixture key travels on this private subprocess's stdin.
  // No key, input body or output transcript is written into the repository.
  const script=`import{readFileSync}from'node:fs';import{sign}from'node:crypto';const input=JSON.parse(readFileSync(0,'utf8')),descriptor=Object.getOwnPropertyDescriptor(process,'argv'),out=process.stdout.write,err=process.stderr.write;let result;Object.defineProperty(process,'argv',{configurable:true,get(){throw Error('consumer argv inspected')}});process.stdout.write=process.stderr.write=()=>{throw Error('consumer console touched')};try{const{landRootLotInProcess}=await import(${JSON.stringify(api)});result=await landRootLotInProcess(input.context,{...input.ports,read:async()=>Buffer.from(input.body,'base64'),signer:{...input.ports.signer,sign:async lot=>lot.bytes.map(bytes=>({keyId:lot.keyId,signature:lot.algorithm+':'+sign(null,Buffer.from(bytes),input.fixtureKey).toString('base64')}))}})}finally{Object.defineProperty(process,'argv',descriptor);process.stdout.write=out;process.stderr.write=err}if(result.kind!=='fact')throw Error(JSON.stringify(result));console.log('Root admitted without consumer argv or console')`;
  const output=execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{input:JSON.stringify({context:a.context,ports:a.ports,body:a.bytes.toString('base64'),fixtureKey:f.ownerPem}),encoding:'utf8',timeout:10000,maxBuffer:262144});
  assert.equal(output.trim(),'Root admitted without consumer argv or console');
 }finally{f.close()}
});
