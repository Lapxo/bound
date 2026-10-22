import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {sign} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {installedConsumer,hash} from './support/installed-consumer.mjs';
import {nativePhysicalProof} from './support/physical-witness-proof.mjs';
import {nativePhysicalPlace} from './support/native-physical-place.mjs';
const yes=JSON.parse(readFileSync(new URL('../samples/physical-lines/yes.json',import.meta.url),'utf8')),no=JSON.parse(readFileSync(new URL('../samples/physical-lines/no.json',import.meta.url),'utf8'));
for(const name of yes.places)test('installed actual physical reading authenticates current producer before native widening: '+name,{timeout:90000},async()=>{
 const candidate=await installedConsumer(),api=await import(candidate.require.resolve('@lapxo/bound/physical-lines'));
 const {canonical,parse,signedBytes,formatSignature}=candidate.wire,{encodeReadingWitness,readingWitnessStatementBytes}=candidate.contract;
 const {canonicalJson}=await import(pathToFileURL(join(candidate.root,'dist/host/native/reading.js')).href);
 const {carriedFrom}=await import(pathToFileURL(join(candidate.root,'dist/fold/resolved.js')).href);
 const scope='core/lines';
 const policy={profile:'bound-reading-witness-policy@1',scope,place:'.',unit:'physical-lines/utf8-lf@1',inventory:['src'],selectors:['src/*.txt'],producer:'device',port:'port/physical',readerMapping:'reader/capsule/physical/port',byteBudget:'65536',rowBudget:'65536',entryBudget:32,evidenceBytes:4194304,receiptRows:512,authorityBytes:1048576,authorityLines:2048};
 const row=(scope,measure,value,extra={})=>canonical({scope,measure,value,form:'alphabet',role:'writes',by:'target',at:'policy:consumer',...extra});
 const selected=[row('wire/reading-witness-admission','id','bound-reading-witness-admission@1'),row('physical/reading-policy','reading-witness','lock',{about:canonicalJson(policy)}),row('region/core','coordinates','src/*.txt'),row(scope,'lines',yes.within,{role:'reads',form:'interval'}),row('release/blocks','id','physical'),row('release/category/physical','id',scope)];
 const f=await nativePhysicalPlace(candidate,name,selected.slice(2),yes.coreSource);
 const ceiling=(value,at='policy:consumer')=>f.row(scope,'lines',value,{role:'reads',form:'interval',at});
 try{
  const migration=f.land(selected.slice(0,2),'enable-reading-witness-policy');f.captures.push({case:'enable-policy-on-existing-native-place',status:migration.status});assert.equal(migration.status,0,migration.stderr+migration.stdout);f.ok(['fold']);f.ok(['fold','--check']);
  const beforeOver=readFileSync(join(f.root,'TARGET.bound'));const initial=beforeOver.toString().split('\n').map(line=>parse(line)).find(got=>got.kind==='fact'&&got.value.fields.scope===scope&&got.value.fields.measure==='lines'&&got.value.fields.value===yes.within);assert.ok(initial);const {sig:initialSig,epoch:initialEpoch,by:initialBy,...initialSemantic}=initial.value.fields;const withdrawInitial=canonical({...initialSemantic,value:'withdraw',by:'target'});
  const narrowed=f.land([withdrawInitial,ceiling(no.over,'policy:over-vector')],'admit-measured-narrowing');assert.equal(narrowed.status,0,narrowed.stderr+narrowed.stdout);const initialOver=f.run(['fold']);assert.match(initialOver.stdout,/RELEASE\s+policy blocked/,'native release policy must report the actual physical reading above its declared ceiling');assert.match(initialOver.stdout,/BLOCK\s+physical.*core\/lines.*outside.*over core\/lines 3/);f.captures.push({case:'actual-reading-forces-expansion',ceiling:no.over,status:initialOver.status});
  const original=readFileSync(join(f.root,'TARGET.bound'));
  const old=original.toString().split('\n').map(line=>parse(line)).find(got=>got.kind==='fact'&&got.value.fields.scope===scope&&got.value.fields.measure==='lines'&&got.value.fields.value===no.over);assert.ok(old);const {sig,epoch,by,...oldSemantic}=old.value.fields;const withdraw=canonical({...oldSemantic,value:'withdraw',by:'target'});
  const without=f.land([withdraw,ceiling('0..4')],'widen-without-witness');assert.notEqual(without.status,0);assert.match(without.stderr,/widening|witness/);assert.deepEqual(readFileSync(join(f.root,'TARGET.bound')),original);
  const forged=f.land([withdraw,ceiling('0..4','witness:'+hash('forged-reading'))],'widen-prefix-without-evidence');f.captures.push({case:'forged-prefix',status:forged.status,authenticatedEvidence:false});assert.notEqual(forged.status,0,'a selected native reading witness policy cannot accept a prefix alone');assert.match(forged.stdout+forged.stderr,/reading-witness/,'the selected witness policy must refuse; an unrelated lease error does not prove authentication');assert.deepEqual(readFileSync(join(f.root,'TARGET.bound')),original);
  const {id,context,proof}=await nativePhysicalProof(candidate,f,policy,api);
  const witnessed=f.land([withdraw,ceiling('0..4','witness:'+id)],'widen-actual-native-reading');f.captures.push({case:'actual-reading-land',proof:id,context,witness:proof.witness,status:witnessed.status});assert.equal(witnessed.status,0,witnessed.stderr+witnessed.stdout);assert.match(witnessed.stdout,/ACT\s+sha256:/,'native commit receipt, not local judge success');const effective=readFileSync(join(f.root,'TARGET.bound'),'utf8').split('\n').map(line=>parse(line)).filter(got=>got.kind==='fact'&&got.value.fields.scope===scope&&got.value.fields.measure==='lines'&&got.value.fields.value!=='withdraw').map(got=>got.value.fields.value);assert.deepEqual(effective,['0..4'],'the actual native widening withdraws the prior inscription and retains exactly the authorized new ceiling');
  writeFileSync(join(f.root,'src/input.txt'),'one\ntwo\nthree\nfour\nfive\n');const exceeded=f.run(['fold']);assert.match(exceeded.stdout,/RELEASE\s+policy blocked/);assert.match(exceeded.stdout,/BLOCK\s+physical.*core\/lines.*outside.*over core\/lines 5/,'actual retained physical observation over its admitted ceiling blocks');f.captures.push({case:'actual-exceeded',status:exceeded.status});writeFileSync(join(f.root,'src/input.txt'),yes.coreSource);f.ok(['fold']);
  // Retiring the actual signed reader mapping leaves its old cryptographic signature intact but removes today's grant.
  const mappingRetired=f.land([f.row(f.mapping,'id','withdraw')],'retire-reader-mapping');assert.equal(mappingRetired.status,0,mappingRetired.stderr+mappingRetired.stdout);const retired=f.land([ceiling('0..5','witness:'+id)],'widen-after-mapping-retirement');assert.notEqual(retired.status,0);assert.match(retired.stdout+retired.stderr,/reading-witness/);f.captures.push({case:'current-mapping-retired',status:retired.status,signedProofRetained:true});
  const renewed=f.land([f.row(f.mapping,'id',f.port,{at:'policy:mapping-renewal'})],'renew-reader-mapping');assert.equal(renewed.status,0,renewed.stderr+renewed.stdout);f.ok(['fold']);const renewedProof=await nativePhysicalProof(candidate,f,policy,api);
  // Current producer/port policy is required even after a new genuine reading renews the mapping context.
  const withdrawn=f.land([f.row(f.port,'text','withdraw')],'withdraw-physical-port');assert.equal(withdrawn.status,0,withdrawn.stderr+withdrawn.stdout);
  const stale=f.land([ceiling('0..5','witness:'+renewedProof.id)],'widen-after-port-withdrawal');assert.notEqual(stale.status,0,'historical reading proof cannot revive a withdrawn current producer port');assert.match(stale.stdout+stale.stderr,/reading-witness/);
  f.captures.push({case:'current-port-withdrawn',status:stale.status,proofRetained:true});
 }finally{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.physical.'+name+'.json',JSON.stringify(f.captures,null,2)+'\n');f.close()}
});
