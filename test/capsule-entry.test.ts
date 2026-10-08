import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { canonical } from '@lapxo/topos/wire';
import { capsuleAt } from '../src/host/capsule.ts';
import { blobAt } from '../src/land/ledger.ts';
const record = (name: string, text: string, type = '0'): Buffer => {
  const body = Buffer.from(text);
  const h = Buffer.alloc(512);
  h.write(name, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136); h.fill(32, 148, 156); h.write(type, 156); h.write('ustar\0', 257);
  h.write(h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([h, body, Buffer.alloc(Math.ceil(body.length / 512) * 512 - body.length)]);
};
const tar = (...rows: Buffer[]): Buffer => gzipSync(Buffer.concat([...rows, Buffer.alloc(1024)]));
const sha = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const save = (store: string, digest: string, bytes: Uint8Array): void => { const at = blobAt(store, digest); mkdirSync(join(store, 'cas', 'blobs'), { recursive: true }); writeFileSync(at, bytes); };

test('a declared capsule entry runs exactly that member and cannot reuse another entry answer', () => {
  const store=mkdtempSync(join(tmpdir(),'capsule-entry-'));
  const prior=process.argv[1];process.argv[1]=new URL('../src/cli/verb.ts',import.meta.url).pathname;
  try {
    const body=(name:string)=>`export const render = () => ['${name}'];`;
    const bytes=tar(record('capsule.bound',canonical({scope:'region/one',role:'render',form:'alphabet',measure:'reads',value:'**',by:'fixture',at:'policy:test'})+'\n'),record('chosen.js',body('chosen')),record('other.js',body('other')));
    const digest=sha(bytes);save(store,digest,bytes);
    assert.throws(()=>capsuleAt(digest,'../chosen.js',store),/REFUSE·capsule .* declared entry .* unavailable/);
    const request={protocol:'bound-lock/1',verb:'render' as const,rootScope:'fixture',region:'one',files:[]};
    const missing=capsuleAt(digest,'missing.js',store);assert.ok(missing);
    assert.throws(()=>missing.ask([request]),/REFUSE·capsule .* declared entry .* unavailable/);
    const chosen=capsuleAt(digest,'chosen.js',store),other=capsuleAt(digest,'other.js',store);assert.ok(chosen);assert.ok(other);
    assert.deepEqual(chosen.ask([request]),[{protocol:'bound-lock/1',kind:'fact',lines:['chosen']}]);
    assert.deepEqual(other.ask([request]),[{protocol:'bound-lock/1',kind:'fact',lines:['other']}]);
    assert.deepEqual(chosen.ask([request]),[{protocol:'bound-lock/1',kind:'fact',lines:['chosen']}]);
  } finally {process.argv[1]=prior;rmSync(store,{recursive:true,force:true});}
});


test('render requests retain independent receipts by digest, across another view',()=>{
 const store=mkdtempSync(join(tmpdir(),'capsule-render-reuse-')),prior=process.argv[1];process.argv[1]=new URL('../src/cli/verb.ts',import.meta.url).pathname;
 try{
  const calls=join(store,'calls'),module="import{appendFileSync}from'node:fs';export const render=asked=>{appendFileSync("+JSON.stringify(calls)+",'1');return [asked.shape];};";
  const bytes=tar(record('capsule.bound',canonical({scope:'region/prose',role:'render',form:'alphabet',measure:'reads',value:'**',by:'fixture',at:'policy:test'})+'\n'),record('entry.js',module)),digest=sha(bytes);save(store,digest,bytes);const capsule=capsuleAt(digest,'entry.js',store)!;
  const ask=(shape:string)=>capsule.ask([{protocol:'bound-lock/1',verb:'render',rootScope:'fixture',region:'prose',files:[],shape}]);
  const first=ask('first'),second=ask('second');assert.deepEqual(ask('first'),first);assert.deepEqual(ask('second'),second);assert.equal(readFileSync(calls,'utf8'),'11','an intervening view cannot evict a closed render');
 }finally{process.argv[1]=prior;rmSync(store,{recursive:true,force:true});}
});
