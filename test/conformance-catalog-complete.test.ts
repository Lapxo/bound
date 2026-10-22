import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{fileURLToPath,pathToFileURL}from'node:url';import{createHash}from'node:crypto';
import*as engine from'../src/engine/index.ts';import*as reference from'../src/host/reference-authenticated.ts';import*as native from'../src/host/reference-native-api.ts';import*as host from'../src/host/index.ts';
import{completeProducerFixture,completeProducerCases,completeProducerSuite}from'./support/conformance-catalog-complete.ts';
const digest=(b:Uint8Array|string)=>'sha256:'+createHash('sha256').update(b).digest('hex');
for(const place of['catalog-register','tidal-ledger'])test('receiver-owned opaque suite executes every catalog refusal through public producers: '+place,async()=>{
 const candidateRoot=process.env.BOUND_CONFORMANCE_CANDIDATE??fileURLToPath(new URL('../',import.meta.url));
 const selected=process.env.BOUND_CONFORMANCE_CANDIDATE?{
  engine:await import(pathToFileURL(candidateRoot+'/dist/engine/index.js').href),reference:await import(pathToFileURL(candidateRoot+'/dist/host/reference-authenticated.js').href),native:await import(pathToFileURL(candidateRoot+'/dist/host/reference-native-api.js').href),host:await import(pathToFileURL(candidateRoot+'/dist/host/index.js').href),
 }:{engine,reference,native,host};
 const fixture=await completeProducerFixture({...selected,candidateRoot,hostModule:pathToFileURL(candidateRoot+'/dist/host/index.js').href,cli:candidateRoot+'/dist/cli/verb.js'},place);
 try{
 const contract=digest(readFileSync(candidateRoot+'/docs/contracts/refusals.bound')),suite=completeProducerSuite(contract,fixture.cases),bytes=new TextEncoder().encode(JSON.stringify(suite)+'\n'),codes=selected.reference.readRefusalCatalog(readFileSync(candidateRoot+'/docs/contracts/refusals.bound','utf8')).map((r:any)=>r.code).sort();
 assert.deepEqual([...fixture.cases.map(([,code])=>code)].sort(),codes);assert.equal(new Set(fixture.cases.map(([,code])=>code)).size,codes.length);
 for(const vector of suite.cases)assert.match(vector.request,/^\["catalog-complete@1","(?:[acemnprs][0-9]{2}|u[0-9]{3})"\]\n$/);
 const implementation=process.env.BOUND_CONFORMANCE_IMPLEMENTATION??digest(readFileSync(candidateRoot+'/dist/engine/index.js'));assert.match(implementation,/^sha256:[a-f0-9]{64}$/);
 if(process.env.BOUND_CONFORMANCE_CANDIDATE)assert.ok(process.env.BOUND_CONFORMANCE_IMPLEMENTATION,'installed conformance requires receiver-pinned candidate archive identity');
 const limits={timeoutMs:15000,maxBytes:262144,maxCases:48},batches=[];
 for(let at=0;at<suite.cases.length;at+=limits.maxCases){
  const selectedSuite={...suite,cases:suite.cases.slice(at,at+limits.maxCases)},selectedBytes=new TextEncoder().encode(JSON.stringify(selectedSuite)+'\n'),refusals=selectedSuite.cases.flatMap(vector=>vector.covers.map(code=>code.slice('refusal/'.length))),receiver={suite:digest(selectedBytes),implementation,contract,rules:[],refusals};
  const result=await selected.engine.runConformance(selectedBytes,receiver,{digest,evaluate:fixture.evaluate},limits);assert.equal(result.met,true,JSON.stringify(fixture.observed.filter((row:any)=>result.cases.some((c:any)=>!c.met&&c.id===row.id))));assert.equal(result.cases.length,selectedSuite.cases.length);
  const stub=await selected.engine.runConformance(selectedBytes,{...receiver,implementation:digest('wrong success stub')},{digest,evaluate:async()=>new TextEncoder().encode('["fact",null]\n')},limits);assert.equal(stub.met,false);assert.ok(stub.cases.every((c:any)=>!c.met));batches.push({result,stub});
 }
 const result={met:batches.every(batch=>batch.result.met),cases:batches.flatMap(batch=>batch.result.cases)},stub={met:batches.every(batch=>batch.stub.met),cases:batches.flatMap(batch=>batch.stub.cases)};assert.equal(result.cases.length,codes.length);assert.equal(stub.cases.length,codes.length);assert.equal(new Set(result.cases.map(one=>one.id)).size,codes.length);

 if(process.env.BOUND_CONFORMANCE_CAPTURE)writeFileSync(process.env.BOUND_CONFORMANCE_CAPTURE,JSON.stringify({scope:'public API conformance experiment; not authoritative Root delivery',result,stub,requestShape:'opaque operation IDs only; no Node paths or key material',allCases:codes.length,batches:batches.length,maxCasesPerExecution:limits.maxCases,fixturePreparation:'outside response evaluation clocks'},null,2)+'\n');
 }finally{fixture.close()}
});
