import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonical} from '@lapxo/topos/wire';
import {standingBytes} from '@lapxo/topos/standing';
import {blobAt} from '../src/land/ledger.ts';
import {sha256} from '../src/host/hash.ts';
import {contextProviderServices} from '../src/host/selected-topos.ts';

for(const [place,value] of [['catalogue',11],['temperature',29]] as const)test('world-loading port requires its selected exact ESM closure: '+place,async()=>{
 const root=mkdtempSync(join(tmpdir(),'context-load-')),store=join(root,'.bound');
 const put=(source:string)=>{const digest=sha256(source),at=blobAt(store,digest);mkdirSync(dirname(at),{recursive:true});writeFileSync(at,source);return digest};
 const offer=(digest:string,dependencies= digest)=>put(standingBytes([
  canonical({scope:'wire/topos/context-view',value:'context'}),
  canonical({scope:'context',kind:'check',view:'context',measure:'digest',value:digest,restsOn:dependencies})
 ]));
 try{
  const code=put('export const value='+value+';'),services=contextProviderServices(store);
  assert.throws(()=>services.module(code),/no declared closure/);
  services.topos(offer(code));
  assert.equal((await import(pathToFileURL(services.module(code)).href)).value,value);
  assert.throws(()=>contextProviderServices(store).module(code),/no declared closure/,'selection context is per call');
  for(const source of [
   'globalThis.unverifiedContextEffect=1; const later=()=>import(target);',
   'globalThis.unverifiedContextEffect=1; if(false) import(target);',
   'globalThis.unverifiedContextEffect=1; const later=()=>require("node:fs");'
  ]){
   const rejected=put(source),port=contextProviderServices(store);port.topos(offer(rejected));
   assert.throws(()=>port.module(rejected),/unresolved|CommonJS load/);
   assert.equal((globalThis as {unverifiedContextEffect?:number}).unverifiedContextEffect,undefined);
  }
  const missing=contextProviderServices(store);
  assert.throws(()=>missing.topos(offer(code,'none')),/missing required restsOn/);
  assert.throws(()=>missing.module(code),/no declared closure/);
  const changed=put('export const value=0;'),port=contextProviderServices(store);port.topos(offer(changed));
  writeFileSync(blobAt(store,changed),'export const value=1;');
  assert.throws(()=>port.module(changed),/content hash mismatch/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
