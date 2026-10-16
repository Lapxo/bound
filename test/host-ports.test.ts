import{test}from'node:test';import assert from'node:assert/strict';import{createHash,sign}from'node:crypto';import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';
import{canonical,formatSignature}from'@lapxo/topos/wire';
import{readContent,retainContent,invokeSigningPort}from'@lapxo/bound/engine';
import{readContent as referenceRead,BoundRefusal}from'@lapxo/bound/reference';import{exportAuthenticatedReference,openAuthenticatedReference}from'@lapxo/bound/reference/native';import{referenceRootFixture}from'./support/reference-root.ts';
const yes=JSON.parse(readFileSync(new URL('../samples/host-ports/yes.json',import.meta.url),'utf8')),no=JSON.parse(readFileSync(new URL('../samples/host-ports/no.json',import.meta.url),'utf8'));
const sha=(bytes:Uint8Array|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex'),limits={timeoutMs:100,maxBytes:65536},code=(name:string)=>(e:unknown)=>{assert.ok(no.codes.includes(name));return e instanceof BoundRefusal&&e.code==='host-port/'+name};
test('public host ports retain owned bytes and reject failed or interrupted operations',async()=>{
 assert.equal(readContent,referenceRead);const bytes=new TextEncoder().encode('retained bytes'),digest=sha(bytes),saved=new Map<string,Uint8Array>();let calls=0;
 const ports={digestBytes:sha,read:async()=>bytes,retain:async(id:string,value:Uint8Array)=>{calls++;saved.set(id,new Uint8Array(value))}};
 const read=await readContent('fixture:content',digest,ports,limits);read[0]^=1;assert.equal(sha(bytes),digest);assert.deepEqual(await retainContent(digest,bytes,ports,limits),{digest,bytes:bytes.length});assert.equal(sha(saved.get(digest)!),digest);
 await assert.rejects(()=>readContent('fixture:content',digest,ports,{...limits,maxBytes:1}),code('budget'));
 await assert.rejects(()=>readContent('fixture:content','sha256:'+'0'.repeat(64),ports,limits),code('integrity'));
 await assert.rejects(()=>readContent('fixture:content',digest,{...ports,read:async()=>{throw Error('private diagnostic')}},limits),code('failed'));
 const before=calls;await assert.rejects(()=>retainContent(digest,new Uint8Array([0]),ports,limits),code('integrity'));assert.equal(calls,before);
 await assert.rejects(()=>retainContent(digest,bytes,{...ports,retain:async()=>{throw Error('private persistence diagnostic')}},limits),code('failed'));
 const controller=new AbortController();controller.abort();await assert.rejects(()=>retainContent(digest,bytes,ports,limits,controller.signal),code('cancelled'));assert.equal(calls,before);
 await assert.rejects(()=>readContent('fixture:content',digest,{...ports,read:async(_s,_d,signal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled'))))},{...limits,timeoutMs:10}),code('timeout'));
 await assert.rejects(()=>readContent('fixture:content',digest,{...ports,digestBytes:async()=>new Promise(()=>{})},{...limits,timeoutMs:10}),code('timeout'));
 const shared=new Uint8Array(new SharedArrayBuffer(1));await assert.rejects(()=>readContent('fixture:content',sha(shared),{...ports,read:async()=>shared},limits),code('response'));
 const lot={keyId:'fixture',algorithm:'ed25519:sample',bytes:[canonical({scope:'proof',form:'alphabet',role:'writes',measure:'id',value:'yes',by:'fixture',epoch:'1',at:'witness:fixture'})]};
 await assert.rejects(()=>invokeSigningPort(lot,async()=>[],limits),code('response'));await assert.rejects(()=>invokeSigningPort(lot,async()=>{throw Error('private signer diagnostic')},limits),code('failed'));
 await assert.rejects(()=>invokeSigningPort(lot,async()=>[],limits,controller.signal),code('cancelled'));await assert.rejects(()=>invokeSigningPort(lot,async()=>new Promise(()=>{}),{...limits,timeoutMs:10}),code('timeout'));await assert.rejects(()=>retainContent(digest,bytes,{...ports,retain:async()=>new Promise(()=>{})},{...limits,timeoutMs:10}),code('timeout'));
 console.log('PORTS owned content · verified retention · signer content persistence failures · budget integrity cancellation timeout refused');
});
for(const name of yes.places)test('native injected host ports '+name,async()=>{
 const{f,bundle,ledger}=referenceRootFixture(name);try{
  const before=ledger(),signed=await exportAuthenticatedReference(f.root,'https://example.test/reading',{hostSigner:{name:'file',sign:async lot=>lot.bytes.map(bytes=>({keyId:lot.keyId,signature:formatSignature(lot.algorithm,sign(null,Buffer.from(bytes),f.owner.privateKey).toString('base64'))}))}});assert.equal(signed.context.semanticIdentity,bundle.context.semanticIdentity);assert.deepEqual(ledger(),before);
  await assert.rejects(()=>exportAuthenticatedReference(f.root,'https://example.test/reading',{hostSigner:{name:'wrong',sign:async()=>[]}}),e=>e instanceof BoundRefusal&&e.code==='reference-export/signer');
  await assert.rejects(()=>exportAuthenticatedReference(f.root,'https://example.test/reading',{hostSigner:{name:'file',sign:async()=>[{keyId:'owner',signature:'invalid'}]}}),e=>e instanceof BoundRefusal&&e.code==='reference-export/signer');
  const row=(scope:string,value:string,measure='id',form='alphabet')=>canonical({scope,value,measure,form,role:'writes',by:'target',at:'policy:fixture'}),path=join(f.temp,'host-ports.bound');writeFileSync(path,[row('engine/object','esm@1'),row('reference/snapshot',bundle.context.snapshot),row('reference/epoch',String(bundle.context.epoch)),row('reference/policy',bundle.context.policy),row('reference/form-implementation',bundle.context.formImplementation),row('wire/transport','content-request/1'),row('transport/https','fetch'),row('transport/timeout','0..1000','milliseconds','interval'),row('transport/response-bytes','0..262144','bytes','interval')].join('\n')+'\n');const admitted=f.run(['land',path,'--key','owner','--key-file',f.key]);assert.equal(admitted.status,0,admitted.stderr);
  const current=ledger();let reads=0;const opened=await openAuthenticatedReference(f.root,bundle.reference,{content:{name:'fetch',read:async()=>{reads++;return Buffer.from(bundle.carrier)}}});assert.equal(opened.readings[0].state,yes.state);assert.equal(reads,1);assert.deepEqual(ledger(),current);
  await assert.rejects(()=>openAuthenticatedReference(f.root,bundle.reference,{content:{name:'wrong',read:async()=>{reads++;return Buffer.from(bundle.carrier)}}}),e=>e instanceof BoundRefusal&&e.code==='authenticated-reference/transport');assert.equal(reads,1);
  console.log('HOST '+name+' · declared signer and content injected · real signature verified · wrong binding refused · no commit');
 }finally{f.close()}
});
