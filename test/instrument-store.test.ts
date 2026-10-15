import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonical} from '@lapxo/topos/wire';
import {instrumentStoreAt} from '../src/observe/runner.ts';
const publicLine=canonical({scope:'name',measure:'id',role:'writes',form:'alphabet',value:'public-artifact',by:'target'});
for(const place of ['catalog','inventory'])test('published '+place+' owns its CAS-only store without an authorship ledger',()=>{
 const base=mkdtempSync(join(tmpdir(),'bound-instrument-store-')),root=join(base,place);try{
  mkdirSync(join(root,'.bound','cas','blobs'),{recursive:true});writeFileSync(join(root,'TARGET.bound'),publicLine+'\n');
  assert.equal(instrumentStoreAt(root),join(root,'.bound'));
 }finally{rmSync(base,{recursive:true,force:true})}
});
test('historical signed delivery keeps sibling selection until its own ledger exists',()=>{
 const base=mkdtempSync(join(tmpdir(),'bound-instrument-history-')),root=join(base,'instrument');try{
  mkdirSync(root);writeFileSync(join(root,'TARGET.bound'),canonical({scope:'name',measure:'id',role:'writes',form:'alphabet',value:'legacy',by:'fixture',at:'policy:fixture',epoch:'1',sig:'ed25519:fixture:AAAA'})+'\n');
  assert.equal(instrumentStoreAt(root),join(base,'.bound'));mkdirSync(join(root,'.bound','ledger'),{recursive:true});assert.equal(instrumentStoreAt(root),join(root,'.bound'));
 }finally{rmSync(base,{recursive:true,force:true})}
});
test('arbitrary or empty TARGET presence never selects a public artifact store',()=>{
 const base=mkdtempSync(join(tmpdir(),'bound-instrument-unknown-')),root=join(base,'instrument');try{
  mkdirSync(join(root,'.bound','cas'),{recursive:true});for(const text of ['','ordinary text\n']){writeFileSync(join(root,'TARGET.bound'),text);assert.equal(instrumentStoreAt(root),join(base,'.bound'));}
  writeFileSync(join(root,'TARGET.bound'),canonical({scope:'name',measure:'id',role:'writes',form:'alphabet',value:'withdraw',by:'target'})+'\n');assert.throws(()=>instrumentStoreAt(root),/withdrawal in a public lock/);
 }finally{rmSync(base,{recursive:true,force:true})}
});
