import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gzipSync,gunzipSync} from 'node:zlib';
import {compactArchive} from '../tools/compact-archive.ts';

test('archive compression preserves every byte and is deterministic',async()=>{
 const tar=Buffer.from('public evidence\n'.repeat(200)),input=gzipSync(tar);
 const first=await compactArchive(input),second=await compactArchive(input);
 assert.deepEqual(gunzipSync(first),tar);assert.deepEqual(first,second);
});
test('archive compression rejects damaged input instead of producing a new carrier',async()=>{
 const input=gzipSync('public evidence');input[input.length-5]^=1;
 await assert.rejects(compactArchive(input));
});
