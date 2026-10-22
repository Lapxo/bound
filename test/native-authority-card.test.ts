import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {canonical,parse,signedBytes,formatSignature} from '@lapxo/topos/wire';
import {sign} from 'node:crypto';
import {spawn} from 'node:child_process';
import {underTheLock,underRootAuthority} from '../src/land/act.ts';
import {storeOf} from '../src/land/ledger.ts';
import {withHostCall} from '../src/host/call-context.ts';
import {accept,admissionEvidenceResult} from '../src/cli/accept.ts';
import {tellOwn,ownLockOf,withOwnPreview} from '../src/fold/signed.ts';
import {projectAuthenticatedStanding} from '../src/host/standing-projection.ts';
import {admissionAnchor} from '../src/fold/admission-history.ts';
import {nativeHostInstrument} from '@lapxo/bound/host';
import {actingRootFixture} from './support/acting-root.ts';
import {prepareNativeAuthorityCard,answerNativeAuthorityCard,nativeAuthorityRequestIdentity,parseNativeAuthorityCardRequest} from '../src/host/native/authority-card.ts';
import type {NativeAuthorityCardContext,NativeAuthorityAction} from '../src/host/native/authority-card.ts';
import {admissionHistoryAt} from '../src/fold/admission-history.ts';
import {sha256} from '../src/host/hash.ts';
import {epochOf,localActLines} from '../src/cli/owner.ts';
const entry=process.env.BOUND_TEST_READER??new URL('../dist/cli/verb.js',import.meta.url).pathname,instrument=nativeHostInstrument(resolve(entry,'../../..'),entry);
const inventory=(root:string):unknown=>readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>[e.name,e.isDirectory()?inventory(join(root,e.name)):sha256(readFileSync(join(root,e.name)))]);
const row=(scope:string,value:string,role='writes',form='alphabet')=>canonical({scope,measure:form==='interval'?'count':'id',value,role,form,by:'target',at:'policy:fixture'});
const witness=JSON.parse(readFileSync(new URL('../samples/authority-preflight/yes.json',import.meta.url),'utf8'));
const negative=JSON.parse(readFileSync(new URL('../samples/authority-preflight/no.json',import.meta.url),'utf8'));
const captures:unknown[]=[];
const stateWords=readFileSync(join(instrument.runtime.root,'TARGET.bound'),'utf8').split('\n').flatMap(line=>{const p=parse(line);return p.kind==='fact'&&['wire/states','audit/wire/states'].includes(p.value.fields.scope)?[p.value.fields.value]:[]})[0]!;
const fixtures=new Map((witness.places as string[]).map(name=>[name,actingRootFixture(name,[],{entry,fields:'scope|role|form|measure|value|by|at|epoch|sig|about|needs',extraBootstrapRows:[row('wire/states',stateWords),row('sample/limit','0..1','reads','interval'),canonical({scope:'sample/required',measure:'id',value:'present',role:'demands',form:'alphabet',by:'target',at:'policy:fixture',needs:'missing.txt'})]})]));
for(const name of witness.places as string[])test('native authority card checks admission and rechecks current grants: '+name,async()=>{
 const fixture=fixtures.get(name)!;
 try{
  const childSeed=join(fixture.temp,'child-ceiling.bound');writeFileSync(childSeed,row('items','0..1','reads','interval')+'\n');const seeded=fixture.run(['land',childSeed,'--place','catalog','--key','owner','--key-file',fixture.key]);assert.equal(seeded.status,0,seeded.stderr);
  const now=witness.clock.now,actions:NativeAuthorityAction[]=[{kind:'record-coverage',records:[row('items','seen')]},{kind:'admission',records:[row('items','seen')]}];
  const context:NativeAuthorityCardContext={root:fixture.root,place:'catalog',key:'lane',instrument,authorityEpoch:epochOf(admissionHistoryAt(fixture.root,Number.MAX_SAFE_INTEGER)),clock:{...witness.clock,now},horizon:witness.horizon,limits:witness.limits,actions};
  const publicRefusals:{code:string;diagnostic:string}[]=[];
  const recordError=(error:unknown)=>{if(typeof error!=='object'||error===null||!('code' in error))return false;publicRefusals.push({code:String(error.code),diagnostic:error instanceof Error?error.message:String(error)});return true};
  const persistedBefore=inventory(fixture.root);
  const prepared=await prepareNativeAuthorityCard(context);assert.equal(prepared.kind,'fact',JSON.stringify(prepared));if(prepared.kind!=='fact')return;
  const request=nativeAuthorityRequestIdentity(actions[0]!);assert.equal(prepared.value.judgments[0]!.decision,'allow');assert.equal(prepared.value.judgments[1]!.decision,'ask');assert.ok(prepared.value.needs.includes('signature:items'));
  assert.deepEqual(await answerNativeAuthorityCard(prepared.value.card,request,context),{status:'observed',decision:'allow',source:'consumer-verified-judgment'});
  assert.deepEqual(await answerNativeAuthorityCard(prepared.value.card,negative.unknownRequest,context),{status:'refused',code:'not-in-card',next:'request-card-entry'});
  assert.deepEqual(await answerNativeAuthorityCard(prepared.value.card,request,{...context,clock:{...context.clock,now:negative.staleNow}}),{status:'refused',code:'card-stale',next:'refresh-card'});
  const forged={...prepared.value.card,actions:[{request,decision:'deny' as const}]};assert.deepEqual(await answerNativeAuthorityCard(forged,request,context),{status:'open',needs:['authority-card/verified-judgment']});
  const denied=await prepareNativeAuthorityCard({...context,place:'.',actions:[{kind:'record-coverage',records:[row(negative.outsideScope,'seen')]}]});assert.equal(denied.kind,'fact');if(denied.kind==='fact')assert.equal(denied.value.judgments[0]!.decision,'deny');
  const ask=await prepareNativeAuthorityCard({...context,place:'.',key:'owner',actions:[{kind:'record-coverage',records:[row('sample/limit',negative.widened,'reads','interval')]}]});assert.equal(ask.kind,'fact',JSON.stringify(ask));if(ask.kind==='fact')assert.equal(ask.value.judgments[0]!.decision,'ask');
  const stamp=(line:string)=>{const got=parse(line);assert.equal(got.kind,'fact');if(got.kind!=='fact')throw Error('invalid fixture');const fields={...got.value.fields,by:'owner',epoch:String(epochOf(localActLines(fixture.root,[]))+1)};return canonical({...fields,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(fields)),fixture.owner.privateKey).toString('base64'))})};
  const childWidening=await prepareNativeAuthorityCard({...context,actions:[{kind:'record-coverage',records:[row('items',negative.widened,'reads','interval')]}]});assert.equal(childWidening.kind,'fact',JSON.stringify(childWidening));if(childWidening.kind==='fact'){assert.equal(childWidening.value.judgments[0]!.decision,'ask');assert.ok(childWidening.value.needs.includes('witness:items'))}
  const admittedLot=stamp(row('sample/prospective','seen'));
  const fullContext={...context,place:'.',key:'owner',actions:[{kind:'admission' as const,records:[admittedLot]}]};
  const full=await prepareNativeAuthorityCard(fullContext);assert.equal(full.kind,'fact',JSON.stringify(full));if(full.kind==='fact'){assert.equal(full.value.judgments[0]!.decision,'allow',JSON.stringify(full.value.judgments));assert.equal((await answerNativeAuthorityCard(full.value.card,nativeAuthorityRequestIdentity(fullContext.actions[0]!),fullContext)).status,'observed')}
  const childDraft=parse(row('items/new','seen'));assert.equal(childDraft.kind,'fact');if(childDraft.kind!=='fact')throw Error('bad child fixture');const childFields={...childDraft.value.fields,by:'owner',epoch:String(epochOf(localActLines(fixture.root,['catalog']))+1)};const childSigned=canonical({...childFields,sig:formatSignature('ed25519:sample',sign(null,Buffer.from(signedBytes(childFields)),fixture.owner.privateKey).toString('base64'))});
  const childAdmission=await prepareNativeAuthorityCard({...context,key:'owner',actions:[{kind:'admission',records:[childSigned]}]});assert.equal(childAdmission.kind,'fact',JSON.stringify(childAdmission));if(childAdmission.kind==='fact')assert.equal(childAdmission.value.judgments[0]!.decision,'allow',JSON.stringify(childAdmission.value.judgments));
  const demand=stamp(row('sample/new-demand','present','demands'));
  const demandResult=await prepareNativeAuthorityCard({...fullContext,actions:[{kind:'admission',records:[demand]}]});assert.equal(demandResult.kind,'fact',JSON.stringify(demandResult));if(demandResult.kind==='fact'){assert.equal(demandResult.value.judgments[0]!.decision,'ask',JSON.stringify(demandResult.value.judgments));assert.ok(demandResult.value.needs.includes('demand:sample/new-demand'))}
  const existingDemand=admissionHistoryAt(fixture.root,Number.MAX_SAFE_INTEGER).find(line=>line.includes('scope=sample/required'))!;
  const refusedDemand=await prepareNativeAuthorityCard({...fullContext,actions:[{kind:'admission',records:[existingDemand]}]});assert.equal(refusedDemand.kind,'fact',JSON.stringify(refusedDemand));if(refusedDemand.kind==='fact')assert.equal(refusedDemand.value.judgments[0]!.decision,'deny',JSON.stringify(refusedDemand.value.judgments));
  const withdrawn=stamp(row('sample/prospective','withdraw'));
  const conflict=await prepareNativeAuthorityCard({...fullContext,actions:[{kind:'admission',records:[admittedLot,withdrawn]}]});assert.equal(conflict.kind,'fact');if(conflict.kind==='fact')assert.equal(conflict.value.judgments[0]!.decision,'deny');
  await withHostCall({instrumentName:instrument.name,runtime:instrument.runtime,output:()=>{}},()=>underRootAuthority(storeOf(fixture.root),'nested authority card',async()=>{const nested=await prepareNativeAuthorityCard(fullContext);assert.equal(nested.kind,'fact',JSON.stringify(nested));}));
  tellOwn('catalog',[row('items/preexisting','kept')]);
  const callerPreview=ownLockOf(fixture.root,'catalog');
  const preserved=await prepareNativeAuthorityCard({...context,key:'owner',actions:[{kind:'admission',records:[childSigned]}]});assert.equal(preserved.kind,'fact');
  assert.deepEqual(ownLockOf(fixture.root,'catalog'),callerPreview,'native card restores the caller preview exactly');tellOwn('catalog',[]);
  if(name===witness.places[0]){const other=fixtures.get(witness.places[1])!;withOwnPreview(fixture.root,()=>{
   tellOwn('catalog',[row('items/scoped-only','kept')]);const outer=ownLockOf(fixture.root,'catalog');assert.ok(outer.some(line=>line.includes('scope=items/scoped-only')));
   withOwnPreview(other.root,()=>{assert.equal(ownLockOf(other.root,'catalog').some(line=>line.includes('scope=items/scoped-only')),false,'another Root cannot see the outer preview');});
   assert.deepEqual(ownLockOf(fixture.root,'catalog'),outer,'nested different Root restores outer preview');
   assert.throws(()=>withOwnPreview(fixture.root,()=>Promise.resolve()),/synchronous work/);
  });}
  const sharedStanding=projectAuthenticatedStanding(admissionHistoryAt(fixture.root,Number.MAX_SAFE_INTEGER),admissionAnchor(fixture.root));
  const directCodes=await withHostCall({instrumentName:instrument.name,runtime:instrument.runtime,output:()=>{}},()=>underRootAuthority(storeOf(fixture.root),'structured native evidence',()=>{
   const clock=admissionEvidenceResult(fixture.root,[],sharedStanding,NaN);assert.equal(clock.kind,'refuse');if(clock.kind==='refuse')assert.equal(clock.code,'admission/clock');
   const takes=admissionEvidenceResult(fixture.root,[existingDemand],sharedStanding,now);assert.equal(takes.kind,'refuse');if(takes.kind==='refuse')assert.equal(takes.code,'admission/takes');
   const source=admissionHistoryAt(fixture.root,Number.MAX_SAFE_INTEGER).find(line=>line.includes('scope=wire/place-act-context-source'))!;const parsedSource=parse(source);assert.equal(parsedSource.kind,'fact');if(parsedSource.kind!=='fact')throw Error('source fixture absent');
   const {sig:_signature,...sourceFields}=parsedSource.value.fields;const invalidSource=stamp(canonical({...sourceFields,about:'invalid-json',by:'target'}));
   const evidence=admissionEvidenceResult(fixture.root,[invalidSource],sharedStanding,now);assert.equal(evidence.kind,'refuse');if(evidence.kind==='refuse')assert.equal(evidence.code,'admission/evidence');
   const inert=admissionEvidenceResult(fixture.root,[stamp(row('sample/no-reading','0..1','reads','interval'))],sharedStanding,now);assert.equal(inert.kind,'refuse',JSON.stringify(inert));if(inert.kind==='refuse')assert.equal(inert.code,'admission/inert',JSON.stringify(inert));
   return [clock,takes,evidence,inert];
  }));
  const originalTarget=readFileSync(join(fixture.root,'TARGET.bound'));let reads=0;
  const changingClock={name:context.clock.name,unit:context.clock.unit,get now(){if(++reads===2)writeFileSync(join(fixture.root,'TARGET.bound'),Buffer.concat([originalTarget,Buffer.from('\n# concurrent change\n')]));return now}};
  try{const changed=await prepareNativeAuthorityCard({...fullContext,clock:changingClock});assert.equal(changed.kind,'refuse',JSON.stringify(changed));if(changed.kind==='refuse'){assert.equal(changed.code,'authority-preflight/context-changed');publicRefusals.push(changed);}}finally{writeFileSync(join(fixture.root,'TARGET.bound'),originalTarget);}
  const requestText=JSON.stringify({profile:'native-authority-card-request/1',place:context.place,key:context.key,authorityEpoch:context.authorityEpoch,clock:context.clock,horizon:context.horizon,limits:context.limits,actions:context.actions});
  assert.equal(parseNativeAuthorityCardRequest(requestText,sha256(requestText),context.limits).authorityEpoch,context.authorityEpoch);
  assert.throws(()=>parseNativeAuthorityCardRequest(requestText,negative.unknownRequest,context.limits),(error:unknown)=>recordError(error)&&typeof error==='object'&&error!==null&&'code' in error&&error.code==='authority-preflight/request-integrity');
  const overBudget=await prepareNativeAuthorityCard({...fullContext,limits:{bytes:1,items:512}});assert.equal(overBudget.kind,'refuse');if(overBudget.kind==='refuse'){assert.equal(overBudget.code,'authority-preflight/budget');publicRefusals.push(overBudget);}
  const expectRefusal=async(ctx:NativeAuthorityCardContext,code:string)=>{const result=await prepareNativeAuthorityCard(ctx);assert.equal(result.kind,'refuse',JSON.stringify(result));if(result.kind==='refuse'){assert.equal(result.code,code);publicRefusals.push(result)}};
  await expectRefusal({...fullContext,place:'../outside'},'authority-preflight/place');
  await expectRefusal({...fullContext,clock:{...fullContext.clock,now:NaN}},'authority-preflight/context');
  await expectRefusal({...fullContext,authorityEpoch:context.authorityEpoch+10},'authority-preflight/stale-epoch');
  await expectRefusal({...fullContext,root:join(fixture.temp,'absent-root')},'authority-preflight/failed');
  const expectRequestRefusal=(extra:object,code:string)=>{const text=JSON.stringify({...JSON.parse(requestText),...extra});assert.throws(()=>parseNativeAuthorityCardRequest(text,sha256(text),context.limits),(error:unknown)=>recordError(error)&&typeof error==='object'&&error!==null&&'code' in error&&error.code===code)};
  expectRequestRefusal({root:'/tmp/offered-root'},'authority-preflight/request-format');
  expectRequestRefusal({instrument:{}},'authority-preflight/request-format');
  expectRequestRefusal({actions:[{kind:'execution',records:[]}]},'authority-preflight/request-action');
  expectRequestRefusal({clock:{...context.clock,extra:true}},'authority-preflight/request-context');
  expectRequestRefusal({limits:{bytes:0,items:512}},'authority-preflight/request-budget');
  expectRequestRefusal({clock:{...context.clock,name:'another-clock'}},'authority-preflight/request-clock');

  assert.deepEqual(inventory(fixture.root),persistedBefore,'all native card judgments preserve every persisted byte');
  const before=readFileSync(join(fixture.root,'catalog/TARGET.bound'));
  const lot=join(fixture.temp,'withdraw.bound');writeFileSync(lot,canonical({scope:'keys/lane',measure:'coverage',value:'withdraw',role:'writes',form:'alphabet',by:'target',at:'policy:fixture'})+'\n');const retired=fixture.run(['land',lot,'--key','owner','--key-file',fixture.key]);assert.equal(retired.status,0,retired.stderr);
  const current={...context,authorityEpoch:epochOf(admissionHistoryAt(fixture.root,Number.MAX_SAFE_INTEGER))};
  assert.deepEqual(readFileSync(join(fixture.root,'catalog/TARGET.bound')),before);
  const afterRetirement=await prepareNativeAuthorityCard(current);assert.equal(afterRetirement.kind,'fact',JSON.stringify(afterRetirement));if(afterRetirement.kind==='fact')assert.equal(afterRetirement.value.judgments[0]!.decision,'deny','the actual coverage grant is no longer current');
  assert.deepEqual(await answerNativeAuthorityCard(prepared.value.card,request,current),{status:'refused',code:'card-stale',next:'refresh-card'});
  const worker=join(fixture.temp,'pending-card.mjs'),currentCandidate={...current};
  writeFileSync(worker,`import {prepareNativeAuthorityCard} from ${JSON.stringify(new URL('../src/host/native/authority-card.ts',import.meta.url).href)};console.log('candidate-started');console.log(JSON.stringify(await prepareNativeAuthorityCard(${JSON.stringify(currentCandidate)})));`);
  let candidateOutput='',candidateError='',finished:Promise<number|null>|undefined;
  await withHostCall({instrumentName:instrument.name,runtime:instrument.runtime,output:()=>{}},()=>underTheLock(storeOf(fixture.root),'candidate snapshot change',async()=>{
   const child=spawn(process.execPath,['--experimental-strip-types',worker],{cwd:fixture.root,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},timeout:10000});
   finished=new Promise((done,reject)=>{child.once('error',reject);child.once('exit',done)});
   const started=new Promise<void>(done=>child.stdout.on('data',chunk=>{candidateOutput+=chunk.toString();if(candidateOutput.includes('candidate-started'))done()}));
   child.stderr.on('data',chunk=>candidateError+=chunk.toString());
   await started;
   const changed=join(fixture.temp,'changed-root.bound');writeFileSync(changed,row('sample/concurrent','changed')+'\n');
   assert.equal(await accept(fixture.root,[changed,'--key','owner','--key-file',fixture.key]),0,'actual native Root mutation while candidate waits');
  }));
  assert.equal(await finished,0,candidateError+candidateOutput);
  const obsolete=JSON.parse(candidateOutput.trim().split('\n').at(-1)!);assert.equal(obsolete.kind,'refuse');assert.equal(obsolete.code,'authority-preflight/stale-epoch');
  assert.equal(readdirSync(join(fixture.root,'.bound/locks')).some(name=>name.startsWith('@authority-')),false,'every candidate and nested authority lease is released');
  if(captures.length){const prior=captures[0] as {coverage:string};assert.notEqual(prepared.value.card.coverage,prior.coverage,'the same child lock is bound to its actual Root location');}
  captures.push({place:name,cardIdentity:prepared.value.identity,snapshot:prepared.value.card.snapshot,coverage:prepared.value.card.coverage,decisions:['allow','ask','deny'],fullAdmission:full,demandAdmission:demandResult,childAdmission,childWidening,withdrawalConflict:conflict,notInCard:true,expired:true,forgedShape:'open',retiredGrant:'card-stale',freshAfterRetirement:afterRetirement,childLockUnchanged:true,allPreflightsPersistedZeroBytes:true,previewPreserved:true,scopedPreviewNoCrossRootLeak:name===witness.places[0],contextChangedGuard:true,publicRefusals,directAdmissionCodes:directCodes,nestedLeaseReentrant:true,rootChangedPendingCandidate:true,authorityLeaseReleased:true,openNeeds:prepared.value.needs,evidence:prepared.value.judgments});
 }finally{fixture.close()}
});
process.on('exit',()=>{if(process.env.BOUND_TEST_CAPTURE)writeFileSync(process.env.BOUND_TEST_CAPTURE,JSON.stringify(captures,null,2)+'\n')});
