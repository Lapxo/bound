import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gzipSync,gunzipSync,constants} from 'node:zlib';
import {compactArchive} from '../build/compact-archive.ts';

test('archive compression preserves every byte and is deterministic',async()=>{
 const tar=Buffer.from('public evidence\n'.repeat(200)),input=gzipSync(tar);
 const first=await compactArchive(input),second=await compactArchive(input);
 assert.deepEqual(gunzipSync(first),tar);assert.deepEqual(first,second);
 assert.ok(first.length<=gzipSync(tar,{level:9,memLevel:7,strategy:constants.Z_FILTERED}).length);
});
test('archive compression rejects damaged input instead of producing a new carrier',async()=>{
 const input=gzipSync('public evidence');input[input.length-5]^=1;
 await assert.rejects(compactArchive(input));
});

// The carrier boundary is a byte count, unrelated to file names or regions.
test('archive compaction retains a mixed carrier across gzip member boundaries',async()=>{
 let state=0x12345678;const noise=(size:number)=>{const out=Buffer.alloc(size);
  for(let i=0;i<size;i++){state^=state<<13;state^=state>>>17;state^=state<<5;out[i]=state&255}return out};
 const text=noise(4*1024*1024),alphabet='0123456789abcdef';
 for(let i=0;i<text.length;i++)text[i]=alphabet.charCodeAt(text[i]!%alphabet.length);
 const binary=noise(1024*1024),tar=Buffer.concat([text,binary]),input=gzipSync(tar),packed=await compactArchive(input);
 const smallest=(block:Buffer)=>[constants.Z_DEFAULT_STRATEGY,constants.Z_FILTERED]
  .map(strategy=>gzipSync(block,{level:9,memLevel:7,strategy})).sort((a,b)=>a.length-b.length)[0]!;
 assert.deepEqual(packed,Buffer.concat([smallest(text),smallest(binary)]));
 assert.deepEqual(gunzipSync(packed),tar);assert.deepEqual(await compactArchive(input),packed);
 assert.ok(packed.length<gzipSync(tar,{level:9,memLevel:7,strategy:constants.Z_FILTERED}).length);
 const broken=Buffer.from(packed);broken[broken.length-5]^=1;await assert.rejects(compactArchive(broken));
});

test('archive compaction preserves the larger byte boundary without growing the prior carrier',async()=>{
 let state=0x426f756e;const bytes=Buffer.alloc(9*1024*1024);
 for(let i=0;i<bytes.length;i++){
  state^=state<<13;state^=state>>>17;state^=state<<5;
  bytes[i]=i<2*1024*1024?65:i<7*1024*1024?'0123456789abcdef'.charCodeAt((state>>>0)%16):state&255;
 }
 const input=gzipSync(bytes),packed=await compactArchive(input);
 assert.deepEqual(gunzipSync(packed),bytes);
 assert.deepEqual(await compactArchive(input),packed);
 const strategy=(part:Buffer)=>{
  const ordinary=gzipSync(part,{level:9,memLevel:7,strategy:constants.Z_DEFAULT_STRATEGY});
  const filtered=gzipSync(part,{level:9,memLevel:7,strategy:constants.Z_FILTERED});
  return ordinary.length<filtered.length?ordinary:filtered;
 };
 const prior=Buffer.concat([strategy(bytes.subarray(0,4*1024*1024)),strategy(bytes.subarray(4*1024*1024,8*1024*1024)),strategy(bytes.subarray(8*1024*1024))]);
 const priorEight=Buffer.concat([strategy(bytes.subarray(0,8*1024*1024)),strategy(bytes.subarray(8*1024*1024))]);
 assert.ok(packed.length<Math.min(prior.length,priorEight.length),'the fixed byte grid improves both existing partitions on mixed data');
 const broken=Buffer.from(packed);broken[broken.length-5]^=1;
 await assert.rejects(compactArchive(broken));
});
