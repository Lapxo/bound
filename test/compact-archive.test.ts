import assert from 'node:assert/strict';import {test} from 'node:test';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';import {members} from '../src/host/archive.ts';
test('standard npm archive preserves mixed bytes and is deterministic without a custom compressor',()=>{
 const root=mkdtempSync(join(tmpdir(),'native-npm-carrier-'));try{
  let state=0x426f756e;const mixed=Buffer.alloc(1024*1024+17);for(let i=0;i<mixed.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;mixed[i]=i<524288?65:state&255}
  writeFileSync(join(root,'package.json'),JSON.stringify({name:'archive-fixture',version:'1.0.0',files:['mixed.bin','empty.txt'],scripts:{prepack:'exit 91'}}));writeFileSync(join(root,'mixed.bin'),mixed);writeFileSync(join(root,'empty.txt'),'');
  const pack=()=>{execFileSync('npm',['pack','--ignore-scripts','--cache',join(root,'cache')],{cwd:root,stdio:'pipe'});return readFileSync(join(root,'archive-fixture-1.0.0.tgz'))};
  const first=pack(),second=pack();assert.deepEqual(first,second);assert.deepEqual(gunzipSync(first),gunzipSync(second));const files=members(first);assert.equal(files.length,3);assert.deepEqual(Buffer.from(files.find(f=>f.name==='package/mixed.bin')!.bytes),mixed);assert.equal(files.find(f=>f.name==='package/empty.txt')!.bytes.length,0);
  const broken=Buffer.from(first);broken[broken.length-5]^=1;assert.throws(()=>members(broken));
 }finally{rmSync(root,{recursive:true,force:true})}
});
