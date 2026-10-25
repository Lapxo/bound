import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readdirSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startNativeHost} from '@lapxo/bound/host';
import {actingRootFixture} from './support/acting-root.ts';
import {pinnedHostInstrument} from './support/pinned-host-instrument.ts';
const pin=pinnedHostInstrument(new URL('../',import.meta.url).pathname);process.once('exit',pin.close);
const limits={requestBytes:16777216,responseBytes:33554432,timeoutMs:15000,heapMiB:256,queuedRequests:8};
for(const place of ['seed-vault','estuary-log'])test('canonical host lifetime and scratch ownership: '+place,async()=>{
 const f=actingRootFixture(place,[],{entry:pin.entry}),parent=mkdtempSync(join(tmpdir(),'host-lifetime-')),sentinel=join(parent,'consumer.txt'),alias=join(parent,'place-alias');writeFileSync(sentinel,'consumer-owned');symlinkSync(f.root,alias,'dir');
 const options={place:f.root,instrument:pin.instrument,expectedInstrument:pin.instrument.digest,limits,environment:process.env,scratchParent:parent};let host;
 try{
  await assert.rejects(startNativeHost({...options,scratchParent:join(parent,'missing','parent')}),error=>(error as NodeJS.ErrnoException).code==='ENOENT');
  host=await startNativeHost(options);await assert.rejects(startNativeHost({...options,place:alias}),error=>(error as {code:string}).code==='host/busy');
  const dirs=()=>readdirSync(parent).filter(name=>name.startsWith('bound-native-host-'));assert.equal(dirs().length,1);
  const refused=await host.request({verb:'fold',args:['--as','undeclared-view']});assert.notEqual(refused.status,0);assert.deepEqual(readdirSync(join(parent,dirs()[0]!)),[]);
  const ending=host.close();await assert.rejects(startNativeHost({...options,place:alias}),error=>(error as {code:string}).code==='host/busy');await Promise.all([ending,host.close()]);assert.deepEqual(dirs(),[]);assert.throws(()=>process.kill(host!.pid,0));
  await assert.rejects(host.request({verb:'fold',args:[]}),error=>(error as {code:string}).code==='host/closed');
  const next=await startNativeHost({...options,place:alias});await next.close();assert.deepEqual(dirs(),[]);assert.equal(readFileSync(sentinel,'utf8'),'consumer-owned');
  console.log('HOST-LIFETIME '+place+' · alias busy · failed scratch released · async close · consumer files preserved');
 }finally{await host?.close();rmSync(parent,{recursive:true,force:true});f.close()}
});
