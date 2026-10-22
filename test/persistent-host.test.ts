import{pinnedHostInstrument}from'./support/pinned-host-instrument.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,readdirSync,rmSync,readFileSync,writeFileSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {canonical} from '@lapxo/topos/wire';
import {nativeHostInstrument,startNativeHost,nativeHostEnvironment} from '@lapxo/bound/host';
import {signBytes} from '../src/host/adapters/keys/ed25519.ts';
import {actingRootFixture} from './support/acting-root.ts';
const pinned=pinnedHostInstrument(new URL('../',import.meta.url).pathname),entry=pinned.entry,instrument=pinned.instrument;process.once('exit',pinned.close);
const yes=JSON.parse(readFileSync(new URL('../samples/native-host/yes.json',import.meta.url),'utf8')).persistent;
const no=JSON.parse(readFileSync(new URL('../samples/native-host/no.json',import.meta.url),'utf8')).persistent;
const limits=yes.limits;
const row=(scope:string,value:string,role='writes',form='alphabet',measure='id')=>canonical({scope,value,role,form,measure,by:'target',at:'policy:fixture'});
const extra=[...['lines','evidence'].map(v=>row('view/'+v,v+'@8','demands')),...Object.entries({bytes:268435456,files:2048,readings:16,probes:1}).map(([k,v])=>row('reading-identity/'+k,'0..'+v,'writes','interval',k))];
const tree=(at:string):unknown=>readdirSync(at,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).map(f=>[f.name,f.isDirectory()?tree(join(at,f.name)):readFileSync(join(at,f.name)).toString('base64')]);
for(const name of yes.places as string[])test('persistent native host shares CLI bytes and authority: '+name,async()=>{
 const f=actingRootFixture(name,[],{entry,extraBootstrapRows:extra,families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity'}),scratch=mkdtempSync(join(tmpdir(),'native-host-test-'));
 let calls=0;
 const host=await startNativeHost({place:f.root,instrument,expectedInstrument:instrument.digest,limits,scratchParent:scratch,environment:{...process.env,NODE_OPTIONS:'--require /does-not-exist',UV_THREADPOOL_SIZE:'99'},signer:{keyId:'owner',name:'file',sign:async(lot)=>{calls++;return lot.bytes.map(bytes=>({keyId:lot.keyId,signature:signBytes(bytes,f.ownerPem,lot.algorithm)}))}}});
 const cli=(args:string[])=>{const r=spawnSync(process.execPath,[...host.flags,entry,...args],{cwd:f.root,env:host.environment,encoding:'utf8',timeout:20000,maxBuffer:limits.responseBytes});return {status:r.status,stdout:r.stdout,stderr:r.stderr}};
 try{
  await assert.rejects(startNativeHost({place:f.root,instrument,expectedInstrument:instrument.digest,limits,environment:process.env}),error=>(error as {code:string}).code==='host/busy');
  assert.equal(Object.keys(host.environment).some(k=>/^(NODE_|UV_)/.test(k)),false);
  const args=['--as','reading-identities@lines+evidence'],before=tree(f.root),first=await host.request({verb:'fold',args});assert.equal(first.status,0,first.stderr);assert.deepEqual(first,cli(['fold',...args]));
  for(const got of await Promise.all(Array.from({length:3},()=>host.request({verb:'fold',args}))))assert.deepEqual(got,first);
  assert.deepEqual(tree(f.root),before);const dirs=readdirSync(scratch);assert.equal(dirs.length,1);assert.deepEqual(readdirSync(join(scratch,dirs[0]!)),[]);
  const bad=await host.request({verb:'fold',args:['--as','reading-identities@'+no.unsupportedView]});assert.deepEqual(bad,cli(['fold','--as','reading-identities@'+no.unsupportedView]));assert.match(bad.stderr,/bound-refusal@1/);
  const text=row('sample/host','accepted')+'\n',file=join(f.temp,'lot.bound');writeFileSync(file,text);
  const signed=await host.request({verb:'sign',signer:'owner',args:['@input/lot.bound','--key','owner'],inputs:[{name:'lot.bound',text}]});assert.equal(signed.status,0,signed.stderr);assert.deepEqual(signed,cli(['sign',file,'--key','owner','--key-file',f.key]));assert.equal(calls,1);
  assert.deepEqual(readdirSync(join(scratch,dirs[0]!)),[]);
  const abort=new AbortController();abort.abort();await assert.rejects(host.request({verb:'land',signer:'owner',args:['@input/lot.bound'],inputs:[{name:'lot.bound',text}]},abort.signal),/host\/cancelled/);assert.deepEqual(tree(f.root),before);
  const invalid=await host.request({verb:'sign',signer:'owner',args:['@input/bad.bound','--key',no.unboundKey],inputs:[{name:'bad.bound',text}]});assert.notEqual(invalid.status,0);assert.equal(calls,1);assert.deepEqual(readdirSync(join(scratch,dirs[0]!)),[]);
  // Clone the exact state before admission: deterministic signed records and act
  // identity agree. Timing diagnostics remain operational measurements.
  const copy=join(f.temp,'cli-copy');cpSync(f.root,copy,{recursive:true});
  const landed=await host.request({verb:'land',signer:'owner',args:['@input/signed.bound'],inputs:[{name:'signed.bound',text:signed.stdout}]});assert.equal(landed.status,0,landed.stderr);
  const other=spawnSync(process.execPath,[...host.flags,entry,'land',file,'--key','owner','--key-file',f.key],{cwd:copy,env:host.environment,encoding:'utf8',timeout:20000,maxBuffer:limits.responseBytes});assert.equal(other.status,0,other.stderr);
  const hostAct=landed.stdout.split('\n').filter(x=>x.startsWith('ACT '));const cliAct=other.stdout.split('\n').filter(x=>x.startsWith('ACT '));assert.deepEqual(hostAct,cliAct);assert.equal(hostAct.length,1);
  const identity=hostAct[0]!.split(' ')[1]!;
  const recovered=await host.request({verb:'fold',args:['--as','act',identity]});
  const recoveredCLI=spawnSync(process.execPath,[...host.flags,entry,'fold','--as','act',identity],{cwd:copy,env:host.environment,encoding:'utf8',timeout:20000,maxBuffer:limits.responseBytes});
  assert.deepEqual(recovered,{status:recoveredCLI.status,stdout:recoveredCLI.stdout,stderr:recoveredCLI.stderr});
  const again=await host.request({verb:'land',signer:'owner',args:['@input/signed.bound'],inputs:[{name:'signed.bound',text:signed.stdout}]});assert.equal(again.status,0,again.stderr);assert.match(again.stdout,/ONCE/);
  assert.deepEqual(readdirSync(join(scratch,dirs[0]!)),[]);
 }finally{await host.close();await assert.rejects(host.request({verb:'fold',args:[]}),error=>(error as {code:string}).code==='host/closed');assert.deepEqual(readdirSync(scratch),[]);assert.throws(()=>process.kill(host.pid,0));rmSync(scratch,{recursive:true,force:true});f.close()}
 console.log(`PERSISTENT-HOST ${name} · CLI identity text sign refusal act matched · no retained request files · closed`);
});
test('environment sanitation removes all Node and libuv controls without mutating the caller',()=>{
 const env={PATH:'/bin',NODE_OPTIONS:'bad',NODE_PATH:'bad',NODE_EXTRA_CA_CERTS:'bad',UV_THREADPOOL_SIZE:'99'};assert.deepEqual(nativeHostEnvironment(env),{PATH:'/bin'});assert.equal(env.NODE_OPTIONS,'bad');
});

test('cancelling an active injected signer leaves no admission or temporary input',async()=>{
 const f=actingRootFixture('cancel',[],{entry,extraBootstrapRows:extra,families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity'}),scratch=mkdtempSync(join(tmpdir(),'native-host-cancel-'));
 let entered:()=>void;const started=new Promise<void>(resolve=>{entered=resolve});
 const host=await startNativeHost({place:f.root,instrument,expectedInstrument:instrument.digest,limits,scratchParent:scratch,environment:process.env,signer:{keyId:'owner',name:'file',sign:async(_lot,signal)=>{entered!();return new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})})}}});
 try{const before=tree(f.root),abort=new AbortController(),result=host.request({verb:'land',signer:'owner',args:['@input/lot.bound','--key','owner'],inputs:[{name:'lot.bound',text:row('sample/cancel','never')+'\n'}]},abort.signal);await started;abort.abort();const refused=await result;assert.notEqual(refused.status,0);assert.deepEqual(tree(f.root),before);for(const dir of readdirSync(scratch))assert.deepEqual(readdirSync(join(scratch,dir)),[])}finally{await host.close();assert.deepEqual(readdirSync(scratch),[]);rmSync(scratch,{recursive:true,force:true});f.close()}
});

test('a native host exits and removes its scratch when its consumer dies',async()=>{
 const f=actingRootFixture('orphan-check',[],{entry}),scratch=mkdtempSync(join(tmpdir(),'native-host-owner-'));
 const source=`import {startNativeHost,installedHostInstrument} from ${JSON.stringify(new URL('../dist/host/index.js',import.meta.url).href)};const host=await startNativeHost({place:${JSON.stringify(f.root)},instrument:installedHostInstrument(${JSON.stringify(instrument.installed!.request)},${JSON.stringify(entry)}),expectedInstrument:${JSON.stringify(instrument.digest)},limits:${JSON.stringify(limits)},environment:process.env,scratchParent:${JSON.stringify(scratch)}});console.log(host.pid);setInterval(()=>{},1000);`;
 const consumer=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe'],env:process.env});
 try{
  const pid=await new Promise<number>((resolve,reject)=>{let text='';consumer.stdout!.on('data',b=>{text+=b.toString();if(text.includes('\n'))resolve(Number(text.trim()))});consumer.once('error',reject);consumer.once('exit',code=>{if(!text)reject(Error('consumer exited '+code))})});assert.ok(pid>0);
  const gone=new Promise<void>(resolve=>consumer.once('exit',()=>resolve()));consumer.kill('SIGKILL');await gone;
  let alive=true;for(let n=0;n<100;n++){try{process.kill(pid,0)}catch{alive=false;break}await new Promise(resolve=>setTimeout(resolve,25))}assert.equal(alive,false,'host must not survive its consumer');assert.deepEqual(readdirSync(scratch),[]);
 }finally{consumer.kill('SIGKILL');rmSync(scratch,{recursive:true,force:true});f.close()}
});

test('startup deadline has a named refusal and removes the owned scratch',async()=>{
 const f=actingRootFixture('startup-budget',[],{entry}),scratch=mkdtempSync(join(tmpdir(),'native-host-startup-'));
 try{await assert.rejects(startNativeHost({place:f.root,instrument,expectedInstrument:instrument.digest,limits:{...limits,timeoutMs:no.startupTimeoutMs},environment:process.env,scratchParent:scratch}),error=>(error as {code:string}).code==='host/timeout');
  for(let n=0;n<100&&readdirSync(scratch).length;n++)await new Promise(resolve=>setTimeout(resolve,10));assert.deepEqual(readdirSync(scratch),[]);
 }finally{rmSync(scratch,{recursive:true,force:true});f.close()}
});

test('bounded queue and input data refuse without writing to the place',async()=>{
 const f=actingRootFixture('queue-budget',[],{entry,extraBootstrapRows:extra,families:'keys|signer|wire|sample|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region|reading-identity'});
 const host=await startNativeHost({place:f.root,instrument,expectedInstrument:instrument.digest,limits:{...limits,requestBytes:256,queuedRequests:1},environment:process.env});
 try{const before=tree(f.root),command={verb:'fold' as const,args:['--as','reading-identities@lines+evidence']},first=host.request(command);
  await assert.rejects(host.request(command),error=>(error as {code:string}).code==='host/budget');assert.equal((await first).status,0);
  await assert.rejects(host.request({verb:'sign',signer:'owner',args:['@input/oversized.bound'],inputs:[{name:'oversized.bound',text:'x'.repeat(257)}]}),error=>(error as {code:string}).code==='host/budget');assert.deepEqual(tree(f.root),before);
 }finally{await host.close();f.close()}
});

test('persistent requests reread an externally edited public lock before signing',async()=>{
 const f=actingRootFixture('current-lock',[],{entry,extraBootstrapRows:extra});
 const host=await startNativeHost({place:f.root,instrument,expectedInstrument:instrument.digest,limits,environment:process.env,signer:{keyId:'owner',name:'file',sign:async(lot)=>lot.bytes.map(bytes=>({keyId:lot.keyId,signature:signBytes(bytes,f.ownerPem,lot.algorithm)}))}});
 try{
  const file=join(f.temp,'current.bound'),text=row('sample/fresh','current')+'\n';writeFileSync(file,text);
  const request={verb:'sign' as const,signer:'owner',args:['@input/lot.bound','--key','owner'],inputs:[{name:'lot.bound',text}]};
  assert.equal((await host.request(request)).status,0);
  // The source is external to land; preserve size and timestamps deliberately.
  const {statSync,utimesSync}=await import('node:fs');
  const at=join(f.root,'TARGET.bound'),old=readFileSync(at,'utf8'),stat=statSync(at);
  const altered=old.replace('value=sample','value=tamper');assert.notEqual(altered,old);assert.equal(Buffer.byteLength(altered),Buffer.byteLength(old));
  writeFileSync(at,altered);utimesSync(at,stat.atime,stat.mtime);
  const result=await host.request(request),cli=spawnSync(process.execPath,[...host.flags,entry,'sign',file,'--key','owner','--key-file',f.key],{cwd:f.root,env:host.environment,encoding:'utf8',timeout:20000});
  assert.deepEqual(result,{status:cli.status,stdout:cli.stdout,stderr:cli.stderr});
  writeFileSync(at,old);utimesSync(at,stat.atime,stat.mtime);assert.equal((await host.request(request)).status,0);
 }finally{await host.close();f.close()}
});

test('receiver-selected instrument bytes are checked again before sign and land',async()=>{
 const f=actingRootFixture('current-instrument',[],{entry}),copy=join(f.temp,'instrument');
 // Copy the selected public image once; its read-only directories must not be overwritten.
 const {installedHostInstrument}=await import('@lapxo/bound/host');cpSync(instrument.runtime.root,copy,{recursive:true});const selected=installedHostInstrument({...instrument.installed!.request,directory:copy},copy+'/dist/cli/verb.js');let calls=0;
 const host=await startNativeHost({place:f.root,instrument:selected,expectedInstrument:selected.digest,limits,environment:process.env,signer:{keyId:'owner',name:'file',sign:async(lot)=>{calls++;return lot.bytes.map(bytes=>({keyId:lot.keyId,signature:signBytes(bytes,f.ownerPem,lot.algorithm)}))}}});
 try{
  const text=row('sample/instrument','fresh')+'\n',request={verb:'sign' as const,signer:'owner',args:['@input/lot.bound','--key','owner'],inputs:[{name:'lot.bound',text}]};
  const signed=await host.request(request);assert.equal(signed.status,0,signed.stderr);assert.equal(calls,1);
  const {statSync,utimesSync,chmodSync}=await import('node:fs');const at=copy+'/TARGET.bound',original=readFileSync(at),stat=statSync(at),before=tree(f.root);
  chmodSync(at,0o600);writeFileSync(at,Buffer.alloc(original.length,32));utimesSync(at,stat.atime,stat.mtime);
  for(const command of [request,{verb:'land' as const,signer:'owner',args:['@input/signed.bound'],inputs:[{name:'signed.bound',text:signed.stdout}]}]){
   const refused=await host.request(command);assert.equal(refused.status,1);assert.match(refused.stderr,/public instrument lock/);
  }
  assert.equal(calls,1);assert.deepEqual(tree(f.root),before);
  writeFileSync(at,original);utimesSync(at,stat.atime,stat.mtime);assert.equal((await host.request(request)).status,0);assert.equal(calls,2);
 }finally{await host.close();f.close()}
});
