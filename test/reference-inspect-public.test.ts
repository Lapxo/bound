import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {canonical} from '@lapxo/topos/wire';
import {readSemanticStanding,semanticStandingBytes} from '@lapxo/topos/core';
import {sha256} from '../src/host/hash.ts';
import {encodeReference} from '../src/host/reference-profile.ts';
import {inspectReference as implementation} from '../src/host/reference.ts';
import {inspectReference} from '../src/host/reference-native-api.ts';

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
 const reference=encodeReference({class:'standing',algorithm:'sha256',digest:sha256(standing).slice(7),blob:sha256(bytes),source:'https://example.invalid/'+place});
 const fetch=t.mock.method(globalThis,'fetch',async()=>new Response(bytes));
 const result=await inspectReference(reference,policy);
 assert.equal(result.standing,standing);
 assert.equal(result.authentication,'not demonstrated; inspect only');
 assert.equal(fetch.mock.callCount(),1);
 await assert.rejects(()=>inspectReference(reference,[]),/no admitted content-request\/1 policy/);
 assert.equal(fetch.mock.callCount(),1,'missing authority must not start transport');
 fetch.mock.mockImplementation(async()=>new Response(Buffer.concat([bytes,Buffer.from(' ')])));
 await assert.rejects(()=>inspectReference(reference,policy),/blob integrity/);
});
