import {referenceWorldFixture} from './support/reference-world.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {canonical} from '@lapxo/topos/wire';
import {referenceRootFixture} from './support/reference-root.ts';
import {openAuthenticatedReference} from '@lapxo/bound/reference/native';
import {encodeReference,decodeReference,BoundRefusal} from '@lapxo/bound/reference';
const row=(scope:string,measure:string,value:string)=>canonical({scope,measure,value,role:'writes',form:'alphabet',by:'target',at:'policy:fixture'});
for(const place of ['native-reference-export','editorial-delivery'])test('explicit native reference backend '+place,async()=>{
 const {f,bundle,yes}=referenceRootFixture(place);
 try{
      let requests=0;const server=createServer((_req,res)=>{requests++;res.end(bundle.carrier)});await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
      try{
        const address=server.address();assert.ok(address&&typeof address!=='string');const reference=encodeReference({...decodeReference(bundle.reference),source:`http://127.0.0.1:${address.port}/carrier`});
        const file=join(f.temp,'reference-consumer.bound'),records=[row('engine/object','id','esm@1'),row('reference/snapshot','id',bundle.context.snapshot),row('reference/epoch','id',String(bundle.context.epoch)),row('reference/policy','id',bundle.context.policy),row('reference/form-implementation','id',bundle.context.formImplementation),row('wire/transport','id','content-request/1'),row('transport/http','id','fetch'),canonical({scope:'transport/timeout',role:'writes',form:'interval',measure:'milliseconds',value:'0..1000',by:'target',at:'policy:fixture'}),canonical({scope:'transport/response-bytes',role:'writes',form:'interval',measure:'bytes',value:'0..262144',by:'target',at:'policy:fixture'})];
        const admit=(lines:string[])=>{writeFileSync(file,lines.join('\n')+'\n');const got=f.run(['land',file,'--key','owner','--key-file',f.key]);assert.equal(got.status,0,got.stderr);};
        admit(records);const opened=await openAuthenticatedReference(f.root,reference);assert.equal(opened.backend,'esm@1');assert.equal(opened.semanticIdentity,bundle.context.semanticIdentity);assert.equal(opened.readings[0]?.state,yes.expectedState);
        const controller=new AbortController();controller.abort();const prior=requests;await assert.rejects(()=>openAuthenticatedReference(f.root,reference,{signal:controller.signal}),error=>error instanceof BoundRefusal&&error.code==='reference/cancelled');assert.equal(requests,prior);
        admit([row('engine/object','id','unsupported')]);const beforeUnsupported=requests;await assert.rejects(()=>openAuthenticatedReference(f.root,reference),error=>error instanceof BoundRefusal&&error.code==='reference/backend');assert.equal(requests,beforeUnsupported);
        admit([row('engine/object','id','wasm@1')]);
        for(const [name,measure,value] of [['memory','bytes','0..67108864'],['stack','bytes','0..1048576'],['execution','milliseconds','0..10000'],['worker-lifetime','milliseconds','0..15000'],['response','bytes','0..262144']])records.push(canonical({scope:'engine/wasm/'+name,role:'writes',form:'interval',measure,value,by:'target',at:'policy:fixture'}));
        admit(records.slice(9));await assert.rejects(()=>openAuthenticatedReference(f.root,reference),/unsupported form standing/);
        console.log('BACKEND '+place+' · ESM authenticated · WASM unsupported form refuses · no fallback · cancellation before fetch');
      }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}

 }finally{f.close()}
});

const backendYes=JSON.parse(readFileSync(new URL('../samples/reference-backend/yes.json',import.meta.url),'utf8')),backendNo=JSON.parse(readFileSync(new URL('../samples/reference-backend/no.json',import.meta.url),'utf8'));
let retainedWorld:ReturnType<typeof referenceWorldFixture>|undefined;
const preparedWorld=()=>retainedWorld??=referenceWorldFixture();
for(const place of backendYes.places)test('complete authenticated WASM opening '+place,async()=>{
 const {f,bundle,ledger}=referenceRootFixture(place,await preparedWorld());let payload=bundle.carrier,requests=0;
 const sockets=new Set<unknown>();
 // Each phase tests fresh carrier bytes, without inheriting an idle HTTP connection from WASM.
 const server=createServer((req,res)=>{requests++;sockets.add(req.socket);res.setHeader('Connection','close');res.end(payload)});
 try{
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const reference=encodeReference({...decodeReference(bundle.reference),source:`http://127.0.0.1:${address.port}/carrier`}),file=join(f.temp,'reference-consumer.bound');
  const admit=(rows:string[])=>{writeFileSync(file,rows.join('\n')+'\n');const result=f.run(['land',file,'--key','owner','--key-file',f.key]);assert.equal(result.status,0,result.stderr);};
  const span=(scope:string,measure:string,value:string)=>canonical({scope,measure,value,role:'writes',form:'interval',by:'target',at:'policy:fixture'});
  admit([row('engine/object','id','esm@1'),row('reference/snapshot','id',bundle.context.snapshot),row('reference/epoch','id',String(bundle.context.epoch)),row('reference/policy','id',bundle.context.policy),row('reference/form-implementation','id',bundle.context.formImplementation),row('wire/transport','id','content-request/1'),row('transport/http','id','fetch'),span('transport/timeout','milliseconds','0..1000'),span('transport/response-bytes','bytes','0..262144')]);
  const beforeEsm=ledger(),esm=await openAuthenticatedReference(f.root,reference);assert.deepEqual(ledger(),beforeEsm);
  admit([row('engine/object','id','wasm@1'),span('engine/wasm/memory','bytes','0..67108864'),span('engine/wasm/stack','bytes','0..1048576'),span('engine/wasm/execution','milliseconds','0..10000'),span('engine/wasm/worker-lifetime','milliseconds','0..15000'),span('engine/wasm/response','bytes','0..262144')]);
  const beforeWasm=ledger(),wasm=await openAuthenticatedReference(f.root,reference);
  assert.equal(wasm.backend,'wasm@1');assert.equal(esm.backend,'esm@1');assert.equal(wasm.semanticIdentity,bundle.context.semanticIdentity);assert.equal(wasm.semanticIdentity,esm.semanticIdentity);assert.equal(wasm.authorityContextIdentity,esm.authorityContextIdentity);assert.deepEqual(wasm.records,esm.records);assert.equal(JSON.stringify(wasm.readings),JSON.stringify(esm.readings));assert.equal(wasm.readings[0]?.state,backendYes.expectedState);assert.deepEqual(backendYes.backends,[esm.backend,wasm.backend]);assert.equal(backendYes.projection,'byte-equal');assert.equal(backendYes.commit,false);assert.equal(requests,2);assert.deepEqual(ledger(),beforeWasm);
  assert.equal(backendNo.mutation,'append-one-carrier-byte');assert.equal(backendNo.commit,false);payload=bundle.carrier+' ';await assert.rejects(()=>openAuthenticatedReference(f.root,reference),error=>error instanceof BoundRefusal&&error.code===backendNo.expectedCode);assert.equal(requests,3,'the integrity negative receives its own HTTP response');assert.equal(sockets.size,3,'ESM, WASM and corruption use separate HTTP connections');assert.deepEqual(ledger(),beforeWasm);
  console.log('WASM '+place+' · authenticated download · same standing · same records · byte-equal ESM projection · altered carrier refused · no commit');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));f.close()}
});
