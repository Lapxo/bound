import{httpsContent}from'./support/https-content.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {canonical} from '@lapxo/topos/wire';
import {readSemanticStanding,semanticStandingBytes} from '@lapxo/topos/core';
import {sha256} from '../dist/host/hash.js';
import {encodeReference} from '../dist/host/reference-profile.js';
import {inspectReference as implementation} from '../dist/host/reference.js';
import {inspectReference} from '../dist/host/reference-native-api.js';

const policy=[
 canonical({scope:'wire/transport',role:'writes',form:'alphabet',measure:'id',value:'content-request/1'}),
 canonical({scope:'transport/https',role:'writes',form:'alphabet',measure:'id',value:'fetch'}),
 canonical({scope:'transport/timeout',role:'writes',form:'interval',measure:'milliseconds',value:'0..300'}),
 canonical({scope:'transport/response-bytes',role:'writes',form:'interval',measure:'bytes',value:'0..8192'})
];
test('public native inspection is the CLI implementation, not another reader',()=>{
 assert.equal(inspectReference,implementation);
});
for(const place of ['catalog','route-notes'])test('public inspection preserves the existing standing without authenticating it: '+place,async t=>{
 const bytes=readFileSync(new URL('../samples/reference-port/yes/'+place+'/standing.json',import.meta.url));
 const document=JSON.parse(bytes.toString()),standing=semanticStandingBytes(readSemanticStanding(document.standing));
 let received=0,altered=false;const server=await httpsContent((_req,res)=>{received++;res.end(altered?Buffer.concat([bytes,Buffer.from(' ')]):bytes)});try{
 const reference=encodeReference({class:'standing',algorithm:'sha256',digest:sha256(standing).slice(7),blob:sha256(bytes),source:server.origin+'/'+place});
 const result=await inspectReference(reference,policy,server.options);
 assert.equal(result.standing,standing);
 assert.equal(result.authentication,'not demonstrated; inspect only');
 assert.equal(received,1);
 await assert.rejects(()=>inspectReference(reference,[]),/no admitted content-request\/1 policy/);
 assert.equal(received,1,'missing authority must not start transport');
 altered=true;
 await assert.rejects(()=>inspectReference(reference,policy,server.options),/digest mismatch/);
 }finally{await server.close()}
});
