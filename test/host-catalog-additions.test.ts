import{createHash}from'node:crypto';import{runConformance}from'../dist/engine/index.js';import{completeProducerSuite}from'./support/conformance-catalog-complete.ts';
import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{fileURLToPath}from'node:url';import*as host from'../dist/host/index.js';import{readRefusalCatalog}from'../dist/host/refusals.js';import{completeProducerCases}from'./support/conformance-catalog-complete.ts';import{currentProducerFixture}from'./support/conformance-catalog-current.ts';
for(const domain of['archive-records','water-quality'])test(`new host refusals use actual producers and the complete registry: ${domain}`,async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),fixture=await currentProducerFixture(host,root,domain);
 try{
  const registered=[...completeProducerCases.map(([,code])=>code),...fixture.operations.keys()].sort(),catalog=readRefusalCatalog(readFileSync(new URL('../docs/contracts/refusals.bound',import.meta.url),'utf8')).map(one=>one.code).sort();assert.deepEqual(registered,catalog);assert.equal(new Set(registered).size,catalog.length);
  for(const code of['host/document-target','host/input','authority/coverage','reference/integrity','receipts/open']){
   let actual:unknown;try{const result:any=await fixture.operations.get(code)!();actual=result?.kind==='refuse'?result.code:null}catch(error){actual=(error as{code?:string}).code}
   assert.equal(actual,code,'producer '+code);
  }
  const digest=(bytes:Uint8Array|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex'),contract=digest(readFileSync(new URL('../docs/contracts/refusals.bound',import.meta.url))),wanted=new Set(['host/document-target','host/input','authority/coverage','reference/integrity','receipts/open']),cases=[...fixture.operations.keys()].flatMap((code,index)=>wanted.has(code)?[['u'+String(index).padStart(3,'0'),code]as const]:[]),suite=completeProducerSuite(contract,cases),bytes=new TextEncoder().encode(JSON.stringify(suite)+'\n');
  const stub=await runConformance(bytes,{suite:digest(bytes),implementation:digest('wrong success stub'),contract,rules:[],refusals:[...wanted]},{digest,evaluate:async()=>new TextEncoder().encode('["fact",null]\n')},{timeoutMs:15000,maxBytes:262144,maxCases:48});assert.equal(stub.met,false);assert.equal(stub.cases.length,5);assert.ok(stub.cases.every(one=>!one.met));
  console.log(JSON.stringify({domain,node:process.version,registered:catalog.length,executedNewProducerCases:5,previousProducerCasesNotRepeated:catalog.length-5,successStubRejected:stub.cases.length}));
 }finally{fixture.close()}
});
