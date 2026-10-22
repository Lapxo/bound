import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical} from '@lapxo/topos/wire';
import {encodeLocatedReference,locatedReferenceIdentity} from '@lapxo/topos/contract';
import {readSemanticStanding,semanticStandingBytes} from '@lapxo/topos/core';
import {inspectReference} from '../src/host/reference-native-api.ts';
import {sha256} from '../src/host/hash.ts';
import {actingRootFixture} from './support/acting-root.ts';
import {join} from 'node:path';

const policy=[canonical({scope:'wire/transport',role:'writes',form:'alphabet',measure:'id',value:'content-request/1'}),canonical({scope:'transport/https',role:'writes',form:'alphabet',measure:'id',value:'fetch'}),canonical({scope:'transport/timeout',role:'writes',form:'interval',measure:'milliseconds',value:'0..300'}),canonical({scope:'transport/response-bytes',role:'writes',form:'interval',measure:'bytes',value:'0..8192'})];
for(const place of ['catalog','route-notes'])test('located-reference host uses Topos interpretation and keeps missing bytes open: '+place,async t=>{
 const bytes=readFileSync(new URL('../samples/reference-port/yes/'+place+'/standing.json',import.meta.url)),standing=semanticStandingBytes(readSemanticStanding(JSON.parse(bytes.toString()).standing));
 const base={class:'standing' as const,algorithm:'sha256' as const,digest:sha256(standing).slice(7),blob:sha256(bytes)};
 const holder={...base,location:'https://example.invalid/'+place,'location-class':'holder' as const},fragment=encodeLocatedReference(holder),fetch=t.mock.method(globalThis,'fetch',async()=>new Response(bytes));
 const present=await inspectReference(fragment,policy);assert.equal('standing' in present&&present.standing,standing);assert.equal(present.authentication,'not demonstrated; inspect only');
 for(const ref of [base,{...holder,location:'https://example.invalid/view#display','location-class':'viewer' as const}]){
  const count=fetch.mock.callCount(),missing=await inspectReference(encodeLocatedReference(ref),[]);assert.equal('needs' in missing&&missing.needs,'needs/bytes/'+base.blob);assert.equal('identity'in missing&&missing.identity,locatedReferenceIdentity(base));assert.equal(fetch.mock.callCount(),count);
 }
 fetch.mock.mockImplementation(async()=>new Response(null,{status:404}));const unavailable=await inspectReference(fragment,policy);assert.equal('needs'in unavailable&&unavailable.needs,'needs/bytes/'+base.blob);
 fetch.mock.mockImplementation(async()=>{throw new TypeError('network unavailable')});assert.equal('needs'in await inspectReference(fragment,policy),true);
 fetch.mock.mockImplementation(async()=>new Response(Buffer.concat([bytes,Buffer.from(' ')])));await assert.rejects(()=>inspectReference(fragment,policy),e=>e instanceof Error&&e.message.includes('blob integrity'));
 fetch.mock.mockImplementation(async()=>new Response(new Uint8Array(8193)));await assert.rejects(()=>inspectReference(fragment,policy),/byte bound/);
 const count=fetch.mock.callCount();await assert.rejects(()=>inspectReference(fragment,[]),/no admitted content-request/);assert.equal(fetch.mock.callCount(),count);
 await assert.rejects(()=>inspectReference(fragment.replace('#topos-reference:1?','#topos-reference:99?'),policy),/profile/);
});

for(const place of ['catalog','orchard'])test('CLI names unavailable located bytes without claiming a fold or changing admitted lines: '+place,()=>{
 const f=actingRootFixture(place);
 try{
  const before=readFileSync(join(f.root,'TARGET.bound'),'utf8'),ledger=readFileSync(join(f.root,'.bound/ledger/owner.bound'),'utf8');
  const reference=encodeLocatedReference({class:'standing',algorithm:'sha256',digest:'a'.repeat(64),blob:'sha256:'+'b'.repeat(64)});
  const result=f.run(['fold',reference]);assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/NEEDS    needs\/bytes\/sha256:/);assert.doesNotMatch(result.stdout,/AUTHENTICATED|PASS|CELL/);
  assert.equal(readFileSync(join(f.root,'TARGET.bound'),'utf8'),before);assert.equal(readFileSync(join(f.root,'.bound/ledger/owner.bound'),'utf8'),ledger);
 }finally{f.close()}
});

for(const place of['catalog','route-notes'])test('located transport bounds origins, redirects, streaming and cancellation: '+place,async t=>{
 const bytes=readFileSync(new URL('../samples/reference-port/yes/'+place+'/standing.json',import.meta.url)),standing=semanticStandingBytes(readSemanticStanding(JSON.parse(bytes.toString()).standing)),ref=encodeLocatedReference({class:'standing',algorithm:'sha256',digest:sha256(standing).slice(7),blob:sha256(bytes),location:'https://example.invalid/'+place,'location-class':'holder'});
 const calls=t.mock.method(globalThis,'fetch',async()=>new Response(bytes));
 await assert.rejects(()=>inspectReference(ref,policy,{allowedOrigins:['https://other.invalid']}),e=>e instanceof Error&&'code'in e&&e.code==='reference/transport');assert.equal(calls.mock.callCount(),0);
 const aborted=new AbortController();aborted.abort();await assert.rejects(()=>inspectReference(ref,policy,{signal:aborted.signal}),e=>e instanceof Error&&'code'in e&&e.code==='reference/cancelled');assert.equal(calls.mock.callCount(),0);
 calls.mock.mockImplementation(async()=>new Response(null,{status:302,headers:{location:'https://other.invalid/'}}));await assert.rejects(()=>inspectReference(ref,policy),e=>e instanceof Error&&'code'in e&&e.code==='reference/transport');assert.equal(calls.mock.callCount(),1);
 let cancelled=false;calls.mock.mockImplementation(async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8193));},cancel(){cancelled=true;}})));await assert.rejects(()=>inspectReference(ref,policy),e=>e instanceof Error&&'code'in e&&e.code==='host-port/budget');assert.ok(cancelled);
 const during=new AbortController();calls.mock.mockImplementation(async()=>new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,1));setTimeout(()=>during.abort(),5);},cancel(){cancelled=true;}})));await assert.rejects(()=>inspectReference(ref,policy,{signal:during.signal}),e=>e instanceof Error&&'code'in e&&e.code==='reference/cancelled');
 calls.mock.mockImplementation(async()=>new Response(bytes));const after=await inspectReference(ref,policy,{allowedOrigins:['https://example.invalid']});assert.equal('standing'in after&&after.standing,standing);
});
