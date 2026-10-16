import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {members} from '../../dist/host/archive.js';
const sha=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
/** Public, content-addressed fixture preparation; no provider program is executed. */
export async function referenceWorldFixture(){
 const fixture=JSON.parse(readFileSync(new URL('../../samples/reference-backend/world-fixture.json',import.meta.url),'utf8'));
 const laid=new URL('../../.fixtures/worlds/',import.meta.url);
 if(existsSync(laid)){const blobs=new Map<string,Uint8Array>();for(const name of readdirSync(laid)){const bytes=readFileSync(new URL(name,laid));if(!/^[a-f0-9]{64}$/.test(name)||sha(bytes)!=='sha256:'+name)throw Error('REFUSE·fixture laid member identity');blobs.set('sha256:'+name,bytes)}const standing=blobs.get(fixture.standing);if(!standing)throw Error('REFUSE·fixture laid standing absent');return{standing:new TextDecoder('utf-8',{fatal:true}).decode(standing),members:blobs,fixture:fixture.standing};}
 const cache=join(tmpdir(),'bound-reference-fixtures'),cached=join(cache,fixture.blob.slice(7));
 let bytes:Uint8Array;
 if(process.env.BOUND_TEST_WORLD_ARCHIVE)bytes=readFileSync(process.env.BOUND_TEST_WORLD_ARCHIVE);
 else if(existsSync(cached))bytes=readFileSync(cached);
 else{
  const response=await fetch(fixture.source,{signal:AbortSignal.timeout(fixture.timeoutMs)});if(!response.ok||!response.body)throw Error('REFUSE·fixture public source unavailable');
  const chunks:Uint8Array[]=[];let length=0;
  for await(const chunk of response.body){length+=chunk.byteLength;if(length>fixture.bytes){await response.body.cancel().catch(()=>{});throw Error('REFUSE·fixture archive byte budget')}chunks.push(chunk)}
  bytes=Buffer.concat(chunks);
 }
 if(bytes.byteLength!==fixture.bytes||sha(bytes)!==fixture.blob)throw Error('REFUSE·fixture public archive identity');
 if(!existsSync(cached)){mkdirSync(cache,{recursive:true});const part=cached+'.'+process.pid+'.part';writeFileSync(part,bytes,{mode:0o444});renameSync(part,cached)}
 const blobs=new Map<string,Uint8Array>();
 for(const member of members(bytes)){
  if(!member.name.startsWith('dist/worlds/'))continue;
  const name=member.name.slice('dist/worlds/'.length);if(!/^[a-f0-9]{64}$/.test(name)||sha(member.bytes)!=='sha256:'+name)throw Error('REFUSE·fixture world member identity');
  blobs.set('sha256:'+name,member.bytes);
 }
 const standing=blobs.get(fixture.standing);if(!standing)throw Error('REFUSE·fixture supported standing absent');
 return{standing:new TextDecoder('utf-8',{fatal:true}).decode(standing),members:blobs,fixture:fixture.blob};
}
