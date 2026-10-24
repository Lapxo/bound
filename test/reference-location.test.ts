import{httpsContent}from'./support/https-content.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical} from '@lapxo/topos/wire';
import {encodeLocatedReference,locatedReferenceIdentity} from '@lapxo/topos/contract';
import {readSemanticStanding,semanticStandingBytes} from '@lapxo/topos/core';
import {inspectReference} from '../dist/host/reference-native-api.js';
import {sha256} from '../dist/host/hash.js';
import {actingRootFixture} from './support/acting-root.ts';
import {join} from 'node:path';

const policy=[canonical({scope:'wire/transport',role:'writes',form:'alphabet',measure:'id',value:'content-request/1'}),canonical({scope:'transport/https',role:'writes',form:'alphabet',measure:'id',value:'fetch'}),canonical({scope:'transport/timeout',role:'writes',form:'interval',measure:'milliseconds',value:'0..300'}),canonical({scope:'transport/response-bytes',role:'writes',form:'interval',measure:'bytes',value:'0..8192'})];
for(const place of ['catalog','route-notes'])test('located-reference host uses Topos interpretation and keeps missing bytes open: '+place,async()=>{
 const bytes=readFileSync(new URL('../samples/reference-port/yes/'+place+'/standing.json',import.meta.url)),standing=semanticStandingBytes(readSemanticStanding(JSON.parse(bytes.toString()).standing));
 let mode='normal',requests=0;const server=await httpsContent((_request,response)=>{requests++;if(mode==='absent'){response.writeHead(404);response.end()}else if(mode==='unavailable')response.destroy();else response.end(mode==='altered'?Buffer.concat([bytes,Buffer.from(' ')]):mode==='oversized'?new Uint8Array(8193):bytes)});
 try{
  const base={class:'standing' as const,algorithm:'sha256' as const,digest:sha256(standing).slice(7),blob:sha256(bytes)};
  const holder={...base,location:server.origin+'/'+place,'location-class':'holder' as const},fragment=encodeLocatedReference(holder);
  const present=await inspectReference(fragment,policy,server.options);assert.equal('standing'in present&&present.standing,standing);assert.equal(present.authentication,'not demonstrated; inspect only');
  for(const ref of [base,{...holder,location:server.origin+'/view#display','location-class':'viewer' as const}]){const count=requests,missing=await inspectReference(encodeLocatedReference(ref),[]);assert.equal('needs'in missing&&missing.needs,'needs/bytes/'+base.blob);assert.equal('identity'in missing&&missing.identity,locatedReferenceIdentity(base));assert.equal(requests,count)}
  mode='absent';assert.equal('needs'in await inspectReference(fragment,policy,server.options),true);
  mode='unavailable';assert.equal('needs'in await inspectReference(fragment,policy,server.options),true);
  mode='altered';await assert.rejects(()=>inspectReference(fragment,policy,server.options),/digest mismatch/);
  mode='oversized';await assert.rejects(()=>inspectReference(fragment,policy,server.options),/byte budget/);
  const count=requests;await assert.rejects(()=>inspectReference(fragment,[],server.options),/no admitted content-request/);assert.equal(requests,count);
  await assert.rejects(()=>inspectReference(fragment.replace('#topos-reference:1?','#topos-reference:99?'),policy,server.options),/profile/);
 }finally{await server.close()}
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

for(const place of['catalog','route-notes'])test('located transport bounds origins, redirects, streaming and cancellation: '+place,async()=>{
 const bytes=readFileSync(new URL('../samples/reference-port/yes/'+place+'/standing.json',import.meta.url)),standing=semanticStandingBytes(readSemanticStanding(JSON.parse(bytes.toString()).standing));
 let mode='normal',requests=0,connectionClosed=false;
 const server=await httpsContent((_request,response)=>{requests++;response.on('close',()=>{connectionClosed=true});if(mode==='redirect'){response.writeHead(302,{location:'https://other.invalid/'});response.end()}else if(mode==='oversized')response.end(new Uint8Array(8193));else if(mode==='stream'){response.write(bytes.subarray(0,1))}else response.end(bytes)});
 try{
  const ref=encodeLocatedReference({class:'standing',algorithm:'sha256',digest:sha256(standing).slice(7),blob:sha256(bytes),location:server.origin+'/'+place,'location-class':'holder'});
  await assert.rejects(()=>inspectReference(ref,policy,{...server.options,allowedOrigins:['https://other.invalid']}),e=>e instanceof Error&&'code'in e&&e.code==='reference/transport');assert.equal(requests,0);
  const aborted=new AbortController();aborted.abort();await assert.rejects(()=>inspectReference(ref,policy,{...server.options,signal:aborted.signal}),e=>e instanceof Error&&'code'in e&&e.code==='reference/cancelled');assert.equal(requests,0);
  mode='redirect';await assert.rejects(()=>inspectReference(ref,policy,server.options),e=>e instanceof Error&&'code'in e&&e.code==='reference/transport');assert.equal(requests,1);
  mode='oversized';await assert.rejects(()=>inspectReference(ref,policy,server.options),e=>e instanceof Error&&'code'in e&&e.code==='host-port/budget');
  mode='stream';connectionClosed=false;const during=new AbortController();const pending=inspectReference(ref,policy,{...server.options,signal:during.signal});setTimeout(()=>during.abort(),30);await assert.rejects(()=>pending,e=>e instanceof Error&&'code'in e&&e.code==='reference/cancelled');await new Promise(resolve=>setTimeout(resolve,10));assert.equal(connectionClosed,true);
  mode='normal';const after=await inspectReference(ref,policy,{...server.options,allowedOrigins:[server.origin]});assert.equal('standing'in after&&after.standing,standing);
 }finally{await server.close()}
});
