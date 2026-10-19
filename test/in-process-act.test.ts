import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readdirSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {contextualActFixture} from './support/contextual-act.ts';
import {declaredRootClockSource} from '../src/host/root-clock-source.ts';
import {nativePlaceActPersistence,placeActResult} from '../src/host/ports/place-act.ts';
import {nativePublicationStorage} from '../src/host/ports/publication.ts';
import {landPlaceActInProcess,recoverPlaceActInProcess,type PlaceActHostContext,type PlaceActHostPorts} from '../src/host/in-process-act.ts';
import {signBytes} from '../src/host/adapters/keys/ed25519.ts';
import {sha256} from '../src/host/hash.ts';
import {storeOf} from '../src/land/ledger.ts';
import {selfName} from '../src/fold/claims.ts';
import {canonical} from '@lapxo/topos/wire';
import {underTheRegions} from '../src/land/act.ts';
import {withoutEffects} from '../src/host/read-only.ts';
import {invokeSigningPort} from '../src/engine/ports.ts';

const deferred=()=>{let resolve!:()=>void;return {promise:new Promise<void>(r=>resolve=r),resolve:()=>resolve()}};
function offered(f:ReturnType<typeof contextualActFixture>){
 const selected=declaredRootClockSource(f.root),packet=f.packet(f.placeNames,'new reading'),bytes=Buffer.from(packet.context),store=storeOf(f.root);
 const context:PlaceActHostContext={place:'receiver',source:'offered context',identity:sha256(bytes),rootSnapshot:selected.trust.contract.root.snapshot,reading:{instrument:sha256('fixture instrument'),implementation:sha256('fixture implementation'),policy:sha256('fixture policy'),inputs:[],environment:[['node',sha256(process.version)]]},algorithm:'ed25519:sample',contentLimits:{timeoutMs:2000,maxBytes:65536},signingLimits:{timeoutMs:5000,maxBytes:65536},storageLimits:selected.selection.storageBudget};
 let calls=0;
 const ports:PlaceActHostPorts={instrumentName:selfName(),read:async()=>bytes,sign:async lot=>{calls++;return lot.bytes.map(bytes=>({keyId:lot.keyId,signature:signBytes(bytes,f.ownerPem,lot.algorithm)}))},trust:()=>declaredRootClockSource(f.root).trust,persistence:nativePlaceActPersistence(store),limits:{storage:selected.selection.storageBudget,signing:{timeoutMs:5000,maxBytes:65536},content:{timeoutMs:2000,maxBytes:selected.selection.budget.bytes}}};
 return {context,ports,packet,selected,store,calls:()=>calls};
}
for(const name of ['wetland-register','museum-catalogue'])test(`in-process atomic act is visible through the real CLI and replay signs nothing: ${name}`,async()=>{
 const f=contextualActFixture(name,name==='museum-catalogue'?['holdings','public-notes']:['catalog','inventory']);
 try{
  const a=offered(f),got=await landPlaceActInProcess(a.context,a.ports);assert.equal(got.kind,'fact',got.kind==='fact'?'':got.diagnostic);if(got.kind!=='fact')return;
  assert.equal(got.value.act.kind,'landed');assert.equal(a.calls(),1);assert.deepEqual(got.value.act.receipts,a.packet.receipts);
  const query=f.run(['fold','--as','act',a.context.identity]);assert.equal(query.status,0,query.stderr);assert.equal(JSON.parse(query.stdout).context,a.packet.context);
  const file=join(f.temp,'replay.json');writeFileSync(file,JSON.stringify(a.packet)+'\n');const replay=f.run(['land',file]);assert.equal(replay.status,0,replay.stderr);assert.equal(JSON.parse(replay.stdout).status,'once');
  const twice=await landPlaceActInProcess(a.context,a.ports);assert.equal(twice.kind,'fact');if(twice.kind==='fact')assert.equal(twice.value.act.kind,'once');assert.equal(a.calls(),1);
  assert.equal(readdirSync(join(a.store,'ledger','place-acts')).filter(n=>n.startsWith('committed-')).length,1);
 }finally{f.close()}
});

test('cancellation while signing has no visible partial act or receiver advance',{timeout:10000},async()=>{
 const f=contextualActFixture('cancelled-receiver'),entered=deferred(),controller=new AbortController();
 try{
  const a=offered(f),before=a.selected.trust.current().heads;
  const run=landPlaceActInProcess({...a.context,signal:controller.signal},{...a.ports,sign:async()=>{entered.resolve();return new Promise(()=>{})}});
  await entered.promise;controller.abort();const got=await run;assert.equal(got.kind,'refuse');if(got.kind==='refuse')assert.match(got.code,/cancelled/);
  assert.equal(placeActResult(a.store,a.context.identity,a.selected.trust,a.context.storageLimits),undefined);
  assert.deepEqual(declaredRootClockSource(f.root).trust.current().heads,before);
  assert.deepEqual(readdirSync(join(a.store,'locks')),[]);
 }finally{controller.abort();f.close()}
});

test('authority is rechecked after asynchronous signing before atomic publication',async()=>{
 const f=contextualActFixture('changed-authority');
 try{
  const a=offered(f);let moved=false;
  const trust={...a.selected.trust,current:()=>{const current=a.selected.trust.current();return moved?{...current,root:{...current.root,epoch:String(Number(current.root.epoch)+1)}}:current}};
  const got=await landPlaceActInProcess(a.context,{...a.ports,trust:()=>trust,sign:async(lot,signal)=>{const result=await a.ports.sign(lot,signal);moved=true;return result}});
  assert.equal(got.kind,'refuse');if(got.kind==='refuse')assert.match(got.diagnostic,/authority changed/);
  assert.equal(placeActResult(a.store,a.context.identity,a.selected.trust,a.context.storageLimits),undefined);
 }finally{f.close()}
});

test('a reply lost after visibility is uncertain, then recovered by identity without signing',async()=>{
 const f=contextualActFixture('recovered-receiver');
 try{
  const a=offered(f),lost=nativePlaceActPersistence(a.store,{publish(staged,committed){nativePublicationStorage.publish(staged,committed);throw Error('fixture reply lost after rename')}});
  const got=await landPlaceActInProcess(a.context,{...a.ports,persistence:lost});assert.equal(got.kind,'uncertain');if(got.kind==='uncertain')assert.equal(got.identity,a.context.identity);
  const historical={...a.selected.trust,current:()=>{throw Error('historical recovery must not acquire a current grant')}};
  const recovered=recoverPlaceActInProcess(a.context,{...a.ports,trust:()=>historical});assert.equal(recovered.kind,'fact');if(recovered.kind==='fact')assert.equal(recovered.value.act.context,a.packet.context);
  assert.equal(a.calls(),1);
  assert.equal((await landPlaceActInProcess(a.context,a.ports)).kind,'fact');assert.equal(a.calls(),1);
  const policy=join(f.temp,'later-policy.bound');writeFileSync(policy,canonical({scope:'sample/later-policy',measure:'id',value:'present',form:'alphabet',role:'writes',by:'target',at:'policy:fixture'})+'\n');
  const changed=f.run(['land',policy,'--key','owner','--key-file',f.key]);assert.equal(changed.status,0,changed.stderr);
  assert.equal(recoverPlaceActInProcess(a.context,a.ports).kind,'fact','historical recovery survives an actual Root change');
  const stale=await landPlaceActInProcess(a.context,a.ports);assert.equal(stale.kind,'refuse');if(stale.kind==='refuse')assert.equal(stale.code,'host/stale');assert.equal(a.calls(),1);
 }finally{f.close()}
});

test('the real CLI cannot mutate Root while the host signs, including a store alias',{timeout:15000},async()=>{
 const f=contextualActFixture('shared-receiver'),entered=deferred(),release=deferred();let child:ReturnType<typeof spawn>|undefined;
 try{
  const a=offered(f),alias=join(f.temp,'store-alias');symlinkSync(a.store,alias,'dir');
  const native=nativePlaceActPersistence(alias);
  const host=landPlaceActInProcess(a.context,{...a.ports,persistence:native,sign:async(lot,signal)=>{entered.resolve();await release.promise;return a.ports.sign(lot,signal)}});
  await entered.promise;
  const proposal=join(f.temp,'root-change.bound');writeFileSync(proposal,canonical({scope:'sample/change',measure:'id',value:'new',form:'alphabet',role:'writes',by:'target',at:'policy:fixture'})+'\n');
  child=spawn(process.execPath,['--experimental-strip-types',new URL('../src/cli/verb.ts',import.meta.url).pathname,'land',proposal,'--key','owner','--key-file',f.key],{cwd:f.root,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},stdio:['ignore','pipe','pipe']});
  let err='',out='';const waiting=deferred();child.stderr!.on('data',b=>{err+=String(b);if(err.includes('WAIT'))waiting.resolve()});child.stdout!.on('data',b=>{out+=String(b)});
  const done=new Promise<number|null>((resolve,reject)=>{child!.once('error',reject);child!.once('close',resolve)});
  await Promise.race([waiting.promise,done.then(()=>{throw Error('CLI did not wait: '+err+out)})]);
  release.resolve();assert.equal((await host).kind,'fact');assert.equal(await done,0,err);
  assert.deepEqual(readdirSync(join(a.store,'locks')),[]);
 }finally{release.resolve();if(child&&child.exitCode===null)child.kill('SIGTERM');f.close()}
});

test('request limits cannot enlarge receiver-selected storage or signing budgets',async()=>{
 const f=contextualActFixture('budgeted-receiver');
 try{
  const a=offered(f);
  const got=await landPlaceActInProcess({...a.context,storageLimits:{...a.context.storageLimits,acts:a.context.storageLimits.acts+1}},a.ports);
  assert.equal(got.kind,'refuse');assert.equal(a.calls(),0);
  let read=false;
  const oversized=await landPlaceActInProcess({...a.context,contentLimits:{...a.context.contentLimits,maxBytes:a.ports.limits.content.maxBytes+1}},{...a.ports,read:async()=>{read=true;return Buffer.from(a.packet.context)}});
  assert.equal(oversized.kind,'refuse');assert.equal(read,false,'receiver content budget applies before acquisition');
  assert.equal((await landPlaceActInProcess(a.context,a.ports)).kind,'fact');
  const next=f.packet(['catalog'],'next'),bytes=Buffer.from(next.context);
  const full=await landPlaceActInProcess({...a.context,identity:sha256(bytes),storageLimits:{...a.context.storageLimits,acts:1}},{...a.ports,read:async()=>bytes});
  assert.equal(full.kind,'refuse');assert.equal(a.calls(),1,'capacity is checked before asking for another signature');
 }finally{f.close()}
});

test('an offered frame cannot pass the canonical-line signing port',async()=>{
 let called=false;
 await assert.rejects(invokeSigningPort({keyId:'fixture',algorithm:'ed25519:sample',bytes:['["place-act-context@1","receipt"]\n']},async()=>{called=true;return []},{timeoutMs:100,maxBytes:4096}));
 assert.equal(called,false);
});

test('preview cannot invoke a signer or acquire a transactional lock',async()=>{
 const f=contextualActFixture('preview-receiver');
 try{
  const a=offered(f);let read=false;
  const got=await withoutEffects(()=>landPlaceActInProcess(a.context,{...a.ports,read:async()=>{read=true;return Buffer.from(a.packet.context)}}));
  assert.equal(got.kind,'refuse');assert.equal(a.calls(),0);assert.equal(read,false);
  assert.equal(placeActResult(a.store,a.context.identity,a.selected.trust,a.context.storageLimits),undefined);
 }finally{f.close()}
});

test('cancellation during CLI-compatible exclusion releases only the waiting host act',{timeout:10000},async()=>{
 const f=contextualActFixture('waiting-receiver'),held=deferred(),release=deferred(),attempted=deferred(),controller=new AbortController();
 let holding:Promise<void>|undefined;
 try{
  const a=offered(f);holding=underTheRegions(a.store,[''],'existing act',async()=>{held.resolve();await release.promise});await held.promise;
  const native=a.ports.persistence,persistence={...native,exclusive:<T>(regions:readonly string[],run:()=>Promise<T>)=>{attempted.resolve();return native.exclusive(regions,run)}};
  const run=landPlaceActInProcess({...a.context,signal:controller.signal},{...a.ports,persistence});await attempted.promise;controller.abort();
  const got=await run;assert.equal(got.kind,'refuse');assert.equal(a.calls(),0);
  assert.equal(placeActResult(a.store,a.context.identity,a.selected.trust,a.context.storageLimits),undefined);
  release.resolve();await holding;assert.deepEqual(readdirSync(join(a.store,'locks')),[]);
 }finally{controller.abort();release.resolve();await holding;f.close()}
});

test('import and actual contextual admission do not inspect consumer argv or write its console',()=>{
 const f=contextualActFixture('embedded-receiver');
 try{
  const a=offered(f),api=new URL('../src/host/in-process-act.ts',import.meta.url).href,source=new URL('../src/host/root-clock-source.ts',import.meta.url).href,persistence=new URL('../src/host/ports/place-act.ts',import.meta.url).href;
  const script=`import {readFileSync} from 'node:fs';const input=JSON.parse(readFileSync(0,'utf8')),descriptor=Object.getOwnPropertyDescriptor(process,'argv'),out=process.stdout.write,err=process.stderr.write,before=['SIGTERM','exit'].map(s=>process.listenerCount(s));let result;Object.defineProperty(process,'argv',{configurable:true,get(){throw Error('consumer argv inspected')}});process.stdout.write=process.stderr.write=()=>{throw Error('host wrote consumer console')};try{const {landPlaceActInProcess}=await import(${JSON.stringify(api)}),{declaredRootClockSource}=await import(${JSON.stringify(source)}),{nativePlaceActPersistence}=await import(${JSON.stringify(persistence)});if(['SIGTERM','exit'].some((s,i)=>process.listenerCount(s)!==before[i]))throw Error('import installed process handlers');result=await landPlaceActInProcess(input.context,{instrumentName:input.instrumentName,read:async()=>Buffer.from(input.packet.context),sign:async lot=>input.packet.receipts.map(r=>({keyId:lot.keyId,signature:r.signature})),trust:()=>declaredRootClockSource(input.root).trust,persistence:nativePlaceActPersistence(input.store),limits:input.limits});}finally{Object.defineProperty(process,'argv',descriptor);process.stdout.write=out;process.stderr.write=err}if(result.kind!=='fact')throw Error(result.diagnostic);console.log('admitted without consumer argv or console');`;
  const output=execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',script],{input:JSON.stringify({context:a.context,instrumentName:a.ports.instrumentName,packet:a.packet,root:f.root,store:a.store,limits:a.ports.limits}),encoding:'utf8',timeout:10000,maxBuffer:65536});
  assert.equal(output.trim(),'admitted without consumer argv or console');
 }finally{f.close()}
});
