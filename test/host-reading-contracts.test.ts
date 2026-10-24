import{test}from'node:test';import assert from'node:assert/strict';
import{generateKeyPairSync}from'node:crypto';
import{readFileSync,writeFileSync,readdirSync}from'node:fs';import{join}from'node:path';
import{canonical}from'@lapxo/topos/wire';import{startNativeHost}from'@lapxo/bound/host';
import{signBytes}from'../dist/host/adapters/keys/ed25519.js';import{actingRootFixture}from'./support/acting-root.ts';import{pinnedHostInstrument}from'./support/pinned-host-instrument.ts';
const pinned=pinnedHostInstrument(new URL('../',import.meta.url).pathname);process.once('exit',pinned.close);
const document=JSON.parse(readFileSync(new URL('../vectors/contracts/host-document-targets.json',import.meta.url),'utf8'));
const coverage=JSON.parse(readFileSync(new URL('../vectors/contracts/signer-coverage-diagnostics.json',import.meta.url),'utf8'));
const row=(scope:string,value:string)=>canonical({scope,measure:'id',value,form:'alphabet',role:'writes',at:'policy:fixture',by:'target'});
for(const domain of document.domains)test(`native document and signer contracts: ${domain}`,async()=>{
 const pair=generateKeyPairSync('ed25519'),pem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
 const extra=[['class','authorize'],['coverage','records/**'],['public-key',pair.publicKey.export({type:'spki',format:'der'}).toString('base64')],['signer','file']].map(([measure,value])=>canonical({scope:'keys/actor',measure,value,form:'alphabet',role:'writes',at:'policy:fixture',by:'target'}));
 extra.push(canonical({scope:'keys/actor',measure:'resolution',value:'1..16',form:'interval',role:'writes',at:'policy:fixture',by:'target'}));
 const f=actingRootFixture(domain,[],{entry:pinned.entry,families:'keys|signer|wire|sample|records|other|tree|write|leaf|view|reader|read|fold|receipts|rendered|resolved|beat|region',extraBootstrapRows:extra});let calls=0;
 const host=await startNativeHost({place:f.root,instrument:pinned.instrument,expectedInstrument:pinned.instrument.digest,limits:{requestBytes:1048576,responseBytes:1048576,timeoutMs:15000,heapMiB:256,queuedRequests:8},environment:process.env,signers:new Map([['actor',{name:'file',sign:async lot=>{calls++;return lot.bytes.map(bytes=>({keyId:lot.keyId,signature:signBytes(bytes,pem,lot.algorithm)}))}}]])});
 const results=[];
 const snapshot=(dir:string):unknown=>readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1).map(e=>[e.name,e.isDirectory()?snapshot(join(dir,e.name)):readFileSync(join(dir,e.name),'utf8')]);
 const ledger=()=>snapshot(join(f.root,'.bound/ledger'));
 try{
  writeFileSync(join(f.root,'logical-document.bound'),row('sample/document','content')+'\n');
  for(const c of document.cases){
   const before=ledger(),start=calls;
   const supported=c.id==='supported-form',input=c.input.carrier==='input',missing=c.id==='missing-input';
   const result=await host.request({verb:'fold',args:supported?['--as','lines']:[input?'@input/logical-document':'logical-document.bound'],...(input&&!missing?{inputs:[{name:'logical-document',text:row('sample/document','content')+'\n'}]}:{})});
   assert.equal(result.status===0,supported,c.id);assert.equal(calls,start);assert.deepEqual(ledger(),before);
   if(!supported){const record=JSON.parse(result.stderr.trim().split('\n').at(-1)!);assert.equal(record.code,missing?'host/input':'host/document-target');assert.equal(record.next,c.expected.next);assert.equal(result.stdout,'')}
   results.push({id:c.id,status:result.status,stderr:result.stderr.replaceAll(f.root,'[place]')});
  }
  for(const c of coverage.cases)for(const verb of ['sign','land']as const){
   const before=ledger(),start=calls,scopes=c.input.scopes as string[];
   const mismatch=c.id==='mismatch',unbound=c.id==='unbound';
   const key=mismatch?'owner':'actor',selected=unbound?'unbound':'actor';
   const result=await host.request({verb,signer:selected,args:['@input/lot','--key',key],inputs:[{name:'lot',text:scopes.map(scope=>row(scope,c.id)).join('\n')+'\n'}]});
   assert.equal(result.status===0,c.expected.kind==='fact',verb+'/'+c.id+' '+result.stderr);
   if(c.expected.kind==='refuse'){
    assert.equal(calls,start);assert.deepEqual(ledger(),before);
    const record=JSON.parse(result.stderr.trim().split('\n').at(-1)!);assert.equal(record.code,mismatch?'host/signer-mismatch':unbound?'host/unbound-signer':'authority/coverage');
    if(c.expected.firstUncoveredScope){assert.match(result.stderr,/keyId=actor scope=other\/a/)}
   }else assert.ok(calls>start);
   results.push({id:c.id,verb,status:result.status,signerCalls:calls-start,stderr:result.stderr.replaceAll(f.root,'[place]')});
  }
  console.log(JSON.stringify({domain,node:process.version,results}));
 }finally{await host.close();f.close()}
});
