import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runConformance} from '../src/engine/index.ts';
import {BoundRefusal} from '../src/host/refusals.ts';
const bytes=(s:string)=>new TextEncoder().encode(s),digest=(s:Uint8Array|string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
const contract=digest('external reference contract'),suite=bytes(JSON.stringify({profile:'bound-conformance@1',contract,cases:[{id:'integer',covers:['rule/identity'],request:'integer',expected:'["fact",42]\n'},{id:'refusal',covers:['refusal/input/invalid'],request:'invalid',expected:'["refuse","input/invalid"]\n'}]})),receiver={contract,suite:digest(suite),implementation:digest('candidate'),rules:['identity'],refusals:['input/invalid']},limits={timeoutMs:1000,maxBytes:65536,maxCases:8};
test('byte conformance accepts declared outputs and rejects a failing stub',async()=>{
 const evaluate=async(input:Uint8Array)=>{if(new TextDecoder().decode(input)==='invalid')throw new BoundRefusal('input/invalid','diagnostic only');return bytes('["fact",42]\n')};
 const met=await runConformance(suite,receiver,{digest,evaluate},limits);assert.equal(met.met,true);assert.equal(met.cases.length,2);
 const failed=await runConformance(suite,receiver,{digest,evaluate:async()=>bytes('["fact",null]\n')},limits);assert.equal(failed.met,false);assert.ok(failed.cases.every(c=>!c.met));
});
test('candidate cannot omit a catalog refusal or replace the receiver-pinned suite',async()=>{
 let calls=0;const ports={digest,evaluate:async()=>{calls++;return bytes('["fact",42]\n')}};
 await assert.rejects(()=>runConformance(suite,{...receiver,refusals:['input/invalid','missing/proof']},ports,limits),/conformance\/coverage/);
 await assert.rejects(()=>runConformance(bytes(new TextDecoder().decode(suite)+' '),receiver,ports,limits),/conformance\/integrity/);assert.equal(calls,0);
});
test('a clock, locale or map-order mutant cannot pass fixed byte vectors',async()=>{
 const mutants=[()=>JSON.stringify(['fact',Date.now()])+'\n',()=>JSON.stringify(['fact',new Intl.NumberFormat('de-DE',{minimumFractionDigits:1}).format(42)])+'\n',()=>JSON.stringify(['fact',Object.fromEntries(new Map([['b',2],['a',1]]))])+'\n'];
 for(const mutant of mutants){
  const result=await runConformance(suite,receiver,{digest,evaluate:async()=>bytes(mutant())},limits);assert.equal(result.met,false);
 }
});
