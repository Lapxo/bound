import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {executeComputation,verifyComputation} from '../src/engine/index.ts';
import type {ComputationContext} from '../src/engine/index.ts';
import {signBytes,verifyBytes} from '../src/host/adapters/keys/ed25519.ts';
const digest=(bytes:Uint8Array|string)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const encode=(text:string)=>new TextEncoder().encode(text),limits={timeoutMs:1000,maxBytes:65536};
function fixture(){
 const key=generateKeyPairSync('ed25519'),secret=key.privateKey.export({format:'pem',type:'pkcs8'}).toString(),publicKey=key.publicKey.export({format:'pem',type:'spki'}).toString();
 const context:ComputationContext={contract:digest('contract'),numericPolicy:digest('exact integers'),reading:{instrument:digest('instrument'),implementation:digest('implementation'),policy:digest('policy'),inputs:[['second',digest('2')],['first',digest('1')]],environment:[]},keyId:'test-reader',algorithm:'ed25519:test'};
 const verify=async(bytes:string,sig:{keyId:string;signature:string},algorithm:string)=>sig.keyId===context.keyId&&verifyBytes(bytes,publicKey,sig.signature,[algorithm]);
 const ports={digest,evaluate:async(bytes:Uint8Array)=>encode(JSON.stringify({input:new TextDecoder().decode(bytes)})+'\n'),sign:async(lot:any)=>lot.bytes.map((bytes:string)=>({keyId:lot.keyId,signature:signBytes(bytes,secret,lot.algorithm)})),verify};
 return {context,ports};
}
test('computation signs an identified question and verifies only receiver-selected inputs',async()=>{
 const {context,ports}=fixture(),input=encode('admitted input'),answer=await executeComputation(context,input,ports,limits);
 assert.equal(answer.statement.origin,context.reading.implementation);
 assert.deepEqual(await verifyComputation(context,input,answer.output,answer.statement,ports,limits),answer.statement);
 await assert.rejects(()=>verifyComputation(context,encode('altered'),answer.output,answer.statement,ports,limits),/computation\/context/);
 await assert.rejects(()=>verifyComputation(context,input,encode('altered'),answer.statement,ports,limits),/computation\/context/);
 await assert.rejects(()=>verifyComputation(context,input,answer.output,{...answer.statement,signature:answer.statement.signature.slice(0,-3)+'bad'},ports,limits),/computation\/signature/);
});
test('two implementations are two origins for one question; redelivery adds no origin',async()=>{
 const {context,ports}=fixture(),input=encode('same question'),a=await executeComputation(context,input,ports,limits),b=await executeComputation({...context,reading:{...context.reading,implementation:digest('other engine')}},input,ports,limits),again=await executeComputation(context,input,ports,limits);
 assert.equal(a.statement.question,b.statement.question);assert.notEqual(a.statement.origin,b.statement.origin);assert.notEqual(a.statement.reading,b.statement.reading);assert.deepEqual(a,again);
 const reordered={...context,reading:{...context.reading,inputs:[...context.reading.inputs].reverse()}};
 assert.deepEqual(await executeComputation(reordered,input,ports,limits),a,'reference ordering is canonical');
});
test('failure, cancellation and invalid signer produce no successful computation statement',async()=>{
 const {context,ports}=fixture(),input=encode('same question');let signatures=0;
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>executeComputation(context,input,{...ports,sign:async()=>{signatures++;return []}},limits,controller.signal),/cancelled/);assert.equal(signatures,0);
 await assert.rejects(()=>executeComputation(context,input,{...ports,evaluate:async()=>{throw Error('failed')},sign:async()=>{signatures++;return []}},limits),/host-port\/failed/);assert.equal(signatures,0);
 await assert.rejects(()=>executeComputation(context,input,{...ports,verify:async()=>false},limits),/computation\/signature/);
});
