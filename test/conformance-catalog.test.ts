import{test}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{runConformance,readContent}from'../src/engine/index.ts';
import{readRefusalCatalog,decodeReference,inspectAuthenticatedReference}from'../src/host/reference-authenticated.ts';
import{catalogProducerAdapter,catalogProducerCases,catalogProducerSuite}from'./support/conformance-catalog.ts';
const digest=(bytes:Uint8Array|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
test('opaque byte suite exercises nine actual public refusal producers and rejects an always-successful stub',async()=>{
 const contract=digest('receiver selected catalog subset v1'),suite=catalogProducerSuite(contract),bytes=new TextEncoder().encode(JSON.stringify(suite)+'\n');
 const receiver={suite:digest(bytes),contract,implementation:digest('public producer adapter'),rules:[],refusals:catalogProducerCases.map(([,code])=>code)},limits={maxBytes:65536,maxCases:9,timeoutMs:1000};
 for(const vector of suite.cases){assert.match(vector.request,/^\["catalog-producer@1","[cp][0-9]{2}"\]\n$/);assert.ok(!vector.request.includes('/'));}
 const actual=await runConformance(bytes,receiver,{digest,evaluate:catalogProducerAdapter({readContent,readRefusalCatalog,decodeReference,inspectAuthenticatedReference},digest)},limits);assert.equal(actual.met,true,JSON.stringify(actual.cases));assert.equal(actual.cases.length,9);
 const stub=await runConformance(bytes,{...receiver,implementation:digest('always-successful stub')},{digest,evaluate:async()=>new TextEncoder().encode('["fact",null]\n')},limits);assert.equal(stub.met,false);assert.ok(stub.cases.every(c=>!c.met));
});
