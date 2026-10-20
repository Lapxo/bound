import{test}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{runConformance,objectFoldBytes,executeComputation,verifyComputation}from'../src/engine/index.ts';
import{additionalProducerCases,additionalProducerSuite,additionalProducerAdapter}from'./support/conformance-catalog-public.ts';
const digest=(b:Uint8Array|string)=>'sha256:'+createHash('sha256').update(b).digest('hex');
test('ten new catalog codes come from public producers and reject a wrong stub',async()=>{
 const contract=digest('receiver selected new producer contract'),suite=additionalProducerSuite(contract),bytes=new TextEncoder().encode(JSON.stringify(suite)+'\n'),receiver={suite:digest(bytes),implementation:digest('public producer adapter'),contract,rules:[],refusals:additionalProducerCases.map(([,code])=>code)},limits={maxBytes:65536,maxCases:10,timeoutMs:1000};
 for(const vector of suite.cases)assert.match(vector.request,/^\["public-producer@1","[ems][0-9]{2}"\]\n$/);
 const result=await runConformance(bytes,receiver,{digest,evaluate:additionalProducerAdapter({runConformance,objectFoldBytes,executeComputation,verifyComputation},digest)},limits);assert.equal(result.met,true,JSON.stringify(result.cases));assert.equal(result.cases.length,10);
 const stub=await runConformance(bytes,{...receiver,implementation:digest('always-successful stub')},{digest,evaluate:async()=>new TextEncoder().encode('["fact",null]\n')},limits);assert.equal(stub.met,false);assert.ok(stub.cases.every(c=>!c.met));
});
