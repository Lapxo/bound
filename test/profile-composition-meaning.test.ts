import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sign} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {installedConsumer,consumerPlace,hash} from './support/installed-consumer.mjs';
const yes=JSON.parse(readFileSync(new URL('../samples/profile-composition/yes.json',import.meta.url),'utf8')),no=JSON.parse(readFileSync(new URL('../samples/profile-composition/no.json',import.meta.url),'utf8'));
for(const name of yes.places)test('installed profile preparation preserves exact meet and distinguishes native land: '+name,async()=>{
 const candidate=await installedConsumer(),api=await import(candidate.require.resolve('@lapxo/bound/profiles'));
 const {composePolicy,encodeProfileComposition}=candidate.contract,{configurationValues}=candidate.forms;
 const {canonical,signedBytes,formatSignature,parse}=candidate.wire;
 const actRows=[['wire/act-result','local-act@1'],['wire/act-result-scope','receipts'],['wire/act-result-context','receipt:local-act']].map(([scope,value])=>canonical({scope,value,role:'writes',form:'alphabet',measure:'id',by:'target',at:'policy:consumer'}));
 const f=consumerPlace(candidate,name,actRows),budget={bytes:65536,items:128},captures=f.captures;
 const stamp=fields=>{let top=0;for(const line of readFileSync(join(f.root,'TARGET.bound'),'utf8').split('\n')){const got=parse(line);if(got.kind==='fact')top=Math.max(top,Number(got.value.fields.epoch)||0)}const signed={...fields,by:'device',epoch:String(top+1)};return canonical({...signed,sig:formatSignature('ed25519:consumer',sign(null,Buffer.from(signedBytes(signed)),f.pair.privateKey).toString('base64'))})};
 try{for(const form of ['interval','alphabet']){
  const coordinate='policy/'+form,contract=hash(coordinate),value=form==='interval'?yes.interval.parent:yes.alphabet.parent,narrow=form==='interval'?yes.interval.narrow:yes.alphabet.narrow,wide=form==='interval'?no.intervalWidening:no.alphabetWidening;
  const decode=v=>configurationValues([{form,value:v}]).spans[0],lattice=configurationValues([{form,value}]).L,field={coordinate,mode:'meet',decode,lattice,inhabited:v=>form==='interval'?v.lo<=v.hi:true};
  const parent={name:'foundation',parents:[],fields:[{coordinate,contract,value}],pins:[],witnesses:[]},bytes=encodeProfileComposition(parent,budget),id=api.profileDigest(bytes),profiles=new Map([[id,bytes]]);
  const binding={contract,field,scope:'sample/'+form,role:'writes',form,measure:'policy'};

  for(const [kind,next] of [['narrowing',narrow],['widening',wide]]){
   const active={...binding,scope:binding.scope+'/'+kind},inherited=stamp({scope:active.scope,role:active.role,form,measure:active.measure,value,restsOn:id,at:'policy:profile'});
   const profile={name:'local',parents:[id],fields:[{coordinate,contract,value:next}],pins:[],witnesses:[]},digest=api.profileDigest(encodeProfileComposition(profile,budget));
   const local=stamp({scope:active.scope,role:active.role,form,measure:active.measure,value:next,restsOn:digest,at:kind==='widening'?'witness:declared-case':'policy:profile'});
   const before=readFileSync(join(f.root,'TARGET.bound'));
   const prepared=api.composeProfile({root:f.root,place:'',profile,profiles,fields:[active],statements:[inherited,local],budget,categories:[]});
   assert.equal(prepared.status,'prepared');assert.deepEqual(readFileSync(join(f.root,'TARGET.bound')),before,'preparation does not land');
   const composed=composePolicy(field,[{source:id,value,own:false},{source:digest,value:next,own:true}]);
   const expected=lattice.meet(decode(value),decode(next));assert.equal(composed.kind,'compatible');assert.ok(lattice.leq(composed.value,expected)&&lattice.leq(expected,composed.value),'composition equals the selected Topos meet');
   if(kind==='widening')assert.ok(lattice.leq(composed.value,decode(value))&&lattice.leq(decode(value),composed.value),'witness preparation never removes ancestor constraint');
   captures.push({profile:form,transition:kind,prepared:prepared.status,inspection:prepared.inspection.fields,composition:composed.value,explicitMeet:expected,landedByPreparation:false});
   const rawLot=prepared.lines.map(line=>{const got=parse(line);const {sig,epoch,by,...semantic}=got.value.fields;return canonical({...semantic,by:'target'})});
   const rawLand=f.land(rawLot,form+'-'+kind+'-raw-preparation');assert.equal(rawLand.status,0,rawLand.stderr+rawLand.stdout);assert.match(rawLand.stdout,/ACT\s+sha256:/);
   const nativeRows=readFileSync(join(f.root,'TARGET.bound'),'utf8').split('\n').map(line=>parse(line)).filter(got=>got.kind==='fact'&&got.value.fields.scope===active.scope&&got.value.fields.role===active.role&&got.value.fields.measure===active.measure).map(got=>got.value.fields);
   assert.ok(nativeRows.length,'native standing contains the actual admitted field');const native=configurationValues(nativeRows),nativeMeet=native.spans.reduce((a,b)=>native.L.meet(a,b));
   assert.ok(lattice.leq(nativeMeet,expected)&&lattice.leq(expected,nativeMeet),'actual native standing has exactly Topos meet, not the local widening alone');
   captures.push({profile:form,transition:kind,nativeRawLotStatus:rawLand.status,nativeValues:nativeRows.map(row=>row.value),nativeMeet,expected,meaning:'real land preserves inherited meet constraint'});
  }
  // Addition is a separate signed lot and has no ancestor to silently replace.
  const addition={name:'addition',parents:[],fields:[{coordinate,contract,value:narrow}],pins:[],witnesses:[]},digest=api.profileDigest(encodeProfileComposition(addition,budget));
  const local=stamp({scope:binding.scope,role:binding.role,form,measure:binding.measure,value:narrow,restsOn:digest,at:'policy:profile'});
  const prepared=api.composeProfile({root:f.root,place:'',profile:addition,profiles:new Map(),fields:[binding],statements:[local],budget,categories:[]});assert.equal(prepared.status,'prepared');
  // Use unsigned exact prepared content through ordinary CLI; real signature and receipt belong to this act.
  const lot=prepared.lines.map(line=>{const got=parse(line);assert.equal(got.kind,'fact');const {sig,epoch,by,...semantic}=got.value.fields;return canonical({...semantic,by:'target'})});
  const landed=f.land(lot,'addition-'+form);assert.equal(landed.status,0,landed.stderr+landed.stdout);assert.match(landed.stdout,/ACT\s+sha256:/,'a prepared status is insufficient: real native act receipt is required');
  captures.push({profile:form,addition:'native-landed',receipt:landed.stdout.split('\n').filter(line=>line.startsWith('bound-lock/1')&&line.includes('scope=receipts'))});
 }}finally{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE+'.profiles.'+name+'.json',JSON.stringify(captures,null,2)+'\n');f.close()}
});
