import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {canonical} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';
import {resolveSelectedContent} from '../src/host/source-content.ts';
const hash=(b:Uint8Array)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const artifact=new TextEncoder().encode('real artifact bytes');const artifactPin=hash(artifact);
const standing=new TextEncoder().encode(standingBytes([canonical({scope:'offers/check',kind:'check',measure:'digest',value:artifactPin,restsOn:artifactPin})]));const pin=hash(standing);
const line=(scope:string,value:string)=>canonical({scope,value,by:'target',role:'writes',form:'alphabet',measure:'id',at:'policy:source'});
const declarations=[line('uses/world',pin),line('sources/world','https://example.test/standing'),line('dep/resource',artifactPin),line('sources/resource','https://example.test/resource')];
test('declared source closure is verified once; warm cache works without network',async()=>{
 const cache=new Map<string,Uint8Array>();const urls:string[]=[];
 const port={algorithms:new Set(['sha256']),read:(d:string)=>cache.get(d),write:(d:string,b:Uint8Array)=>{cache.set(d,b);},fetch:async(u:string)=>{urls.push(u);return u.endsWith('/standing')?standing:artifact;}};
 assert.deepEqual(await resolveSelectedContent(declarations,port),[pin,artifactPin]);
 assert.deepEqual(urls,['https://example.test/standing','https://example.test/resource']);
 assert.deepEqual(await resolveSelectedContent(declarations,{...port,fetch:async()=>{throw Error('offline');}}),[]);
});
test('mismatch never enters CAS; missing closure never guesses a location',async()=>{
 const cache=new Map<string,Uint8Array>();const port={algorithms:new Set(['sha256']),read:(d:string)=>cache.get(d),write:(d:string,b:Uint8Array)=>{cache.set(d,b);},fetch:async()=>artifact};
 await assert.rejects(resolveSelectedContent(declarations,port),/hash mismatch/);assert.equal(cache.size,0);
 await assert.rejects(resolveSelectedContent(declarations.slice(0,2),{...port,fetch:async()=>standing}),/no declared source/);
 assert.ok(cache.has(pin));assert.ok(!cache.has(artifactPin));
});
test('cached corruption and an unadmitted digest fail before transport',async()=>{
 let calls=0;const port={algorithms:new Set(['sha256']),read:()=>artifact,write:()=>{throw Error('must not write');},fetch:async()=>{calls++;return standing;}};
 await assert.rejects(resolveSelectedContent(declarations,port),/hash mismatch/);
 await assert.rejects(resolveSelectedContent([line('uses/world','other:00')],port),/not admitted/);assert.equal(calls,0);
});

test('a coordinate containing the letters uses does not select a world',async()=>{
 const port={algorithms:new Set(['sha256']),read:()=>undefined,write:()=>{throw Error('must not write');},fetch:async()=>{throw Error('must not fetch');}};
 assert.deepEqual(await resolveSelectedContent([line('refuses/world',pin),line('resources/world','https://example.test/standing')],port),[]);
});
test('a declared host dependency is verified as bytes, never decoded as a standing',async()=>{
 const cache=new Map<string,Uint8Array>();let calls=0;
 const port={algorithms:new Set(['sha256']),read:(d:string)=>cache.get(d),write:(d:string,b:Uint8Array)=>{cache.set(d,b);},fetch:async()=>{calls++;return artifact;}};
 const dep=canonical({scope:'dep/reader',value:artifactPin,by:'target',role:'reads',form:'alphabet',measure:'id',at:'policy:release'});
 assert.deepEqual(await resolveSelectedContent([dep,line('sources/reader','https://example.test/reader')],port),[artifactPin]);
 assert.equal(calls,1);assert.deepEqual(await resolveSelectedContent([dep],port),[]);
});
