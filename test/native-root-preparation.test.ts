import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFileSync,readFileSync,statSync,utimesSync} from 'node:fs';
import {canonical,parse} from '@lapxo/topos/wire';
import {declaredRootClockSource} from '../src/host/root-clock-source.ts';
import {admissionHistoryAt,admissionAnchor} from '../src/fold/admission-history.ts';
import {foldClaims,fieldOf} from '../src/fold/claims.ts';
import {eraOf} from '../src/fold/digests.ts';
import {actingRootFixture} from './support/acting-root.ts';
import {underRootAuthority,rootAuthorityProtection} from '../src/land/act.ts';
import {storeOf} from '../src/land/ledger.ts';
import {currentNativeRoot,inheritedNativeRoot} from '../src/host/native/root.ts';
test('native Root preparation requires its actual lease and rereads a committed cursor',async()=>{
 const fixture=actingRootFixture('native-root-preparation',[]),store=storeOf(fixture.root);
 try{
  let expected:ReturnType<typeof currentNativeRoot>['context']|undefined;
  let expired:ReturnType<typeof rootAuthorityProtection>|undefined;
  await underRootAuthority(store,'prepare native Root',()=>{
   const proof=rootAuthorityProtection(store);expired=proof;
   const prepared=currentNativeRoot(store,process.pid,proof);expected=prepared.context;
   assert.equal(prepared.root.epoch,1);
   const history=admissionHistoryAt(fixture.root,Number(prepared.context.epoch)),live=foldClaims(history).standing.filter(line=>fieldOf(line,'value')!=='withdraw');
   assert.deepEqual(prepared.root.history,history);assert.deepEqual(prepared.root.live,live);
   assert.deepEqual(prepared.root.signer,admissionAnchor(fixture.root));assert.deepEqual(prepared.root.eras,eraOf(live).admitted);
   const observation=declaredRootClockSource(fixture.root).observation;
   assert.ok(Object.isFrozen(observation)&&Object.isFrozen(observation.history)&&Object.isFrozen(observation.algorithms));
   assert.ok(Object.isFrozen(observation.anchor)&&Object.isFrozen(observation.anchor.coverage)&&Object.isFrozen(observation.anchor.depth)&&Object.isFrozen(observation.anchor.admittedBy));
   assert.throws(()=>{(observation.history as string[]).push('invented')},TypeError);
   assert.deepEqual(inheritedNativeRoot({store,parent:process.pid,expected},proof),prepared.root);
  });
  assert.throws(()=>currentNativeRoot(store,process.pid,expired!),/protection|lease|protected/);
  const proposal=join(fixture.temp,'advance.bound');
  writeFileSync(proposal,canonical({scope:'sample/checkpoint',role:'writes',form:'alphabet',measure:'id',value:'advanced',by:'target',at:'witness:native-root-preparation'})+'\n');
  const landed=fixture.run(['land',proposal,'--key','owner','--key-file',join(fixture.temp,'fixture.pem')]);
  assert.equal(landed.status,0,landed.stderr);
  await underRootAuthority(store,'fresh native Root',()=>{
   const proof=rootAuthorityProtection(store),fresh=currentNativeRoot(store,process.pid,proof);
   assert.equal(fresh.root.epoch,2);
   assert.notDeepEqual(fresh.context,expected);
   assert.throws(()=>inheritedNativeRoot({store,parent:process.pid,expected:expected!},proof),/actual authority cursor or dependencies changed/);
  });
 }finally{fixture.close()}
});

test('next native Root observation sees revocation and refuses same-size restored-mtime signature changes',async()=>{
 const fixture=actingRootFixture('native-root-fresh-observation',[]),store=storeOf(fixture.root);
 try{
  let original:ReturnType<typeof currentNativeRoot>;
  await underRootAuthority(store,'original native Root',()=>{original=currentNativeRoot(store,process.pid,rootAuthorityProtection(store));});
  const proposal=join(fixture.temp,'retire.bound');writeFileSync(proposal,canonical({scope:'keys/lane',role:'writes',form:'alphabet',measure:'class',value:'withdraw',by:'target',at:'policy:fixture'})+'\n');
  const landed=fixture.run(['land',proposal,'--key','owner','--key-file',fixture.key]);assert.equal(landed.status,0,landed.stderr);
  await underRootAuthority(store,'revoked native Root',()=>{
   const proof=rootAuthorityProtection(store),next=currentNativeRoot(store,process.pid,proof);
   assert.notDeepEqual(next.context,original!.context);assert.ok(!next.root.live.some(line=>fieldOf(line,'scope')==='keys/lane'&&fieldOf(line,'measure')==='class'));
   assert.throws(()=>inheritedNativeRoot({store,parent:process.pid,expected:original!.context},proof),/authority cursor or dependencies changed/);
  });
  const journal=join(store,'ledger/owner.bound'),bytes=readFileSync(journal),stamp=statSync(journal),rows=bytes.toString().split('\n');
  const index=rows.findIndex(line=>fieldOf(line,'scope')==='region/catalog');assert.ok(index>=0);
  const got=parse(rows[index]!);assert.equal(got.kind,'fact');if(got.kind!=='fact')assert.fail('fixture record missing');
  rows[index]=canonical({...got.value.fields,value:'catalog/zz'});const changed=Buffer.from(rows.join('\n'));assert.equal(changed.length,bytes.length);
  writeFileSync(journal,changed);utimesSync(journal,stamp.atime,stamp.mtime);
  try{await underRootAuthority(store,'tampered native Root',()=>assert.throws(()=>currentNativeRoot(store,process.pid,rootAuthorityProtection(store)),/authenticated|signature|admission|checkpoint/));}
  finally{writeFileSync(journal,bytes);utimesSync(journal,stamp.atime,stamp.mtime);}
  await underRootAuthority(store,'restored native Root',()=>{assert.equal(currentNativeRoot(store,process.pid,rootAuthorityProtection(store)).root.epoch,2);});
 }finally{fixture.close()}
});
