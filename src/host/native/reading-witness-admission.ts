import {join} from 'node:path';
import {canonical,authorityAtEpoch} from '@lapxo/topos/wire';
import {decodeReadingWitness,readingWitnessStatementBytes,readingIdentityBytes} from '@lapxo/topos/contract';
import {fieldOf,fieldsOf} from '../../fold/claims.ts';
import {isCeiling} from '../../fold/configures.ts';
import {lockLines} from '../../fold/keys.ts';
import {authorityFor,rootSigner} from '../../fold/signers.ts';
import {signaturesOf} from '../../fold/digests.ts';
import {storeOf} from '../../land/ledger.ts';
import {widenedWithoutWitness} from '../../judge/widening.ts';
import {sha256,isSha256} from '../hash.ts';
import {readPlacePhysicalLines,authenticatePhysicalLinesWitness} from '../physical-lines.ts';
import {verifiedReadingReceipts} from '../reading-closures.ts';
import {canonicalJson,authenticateNativeProfile,type RootStanding} from './reading.ts';
import {readBoundedFile} from './bounded-file.ts';

export const READING_WITNESS_ADMISSION_PROFILE='bound-reading-witness-admission@1' as const;
export interface ReadingWitnessPolicy {
 readonly profile:'bound-reading-witness-policy@1'; readonly scope:string;readonly place:string;
 readonly unit:'physical-lines/utf8-lf@1';readonly inventory:readonly string[];readonly selectors:readonly string[];
 readonly producer:string;readonly port:string;readonly readerMapping:string;
 readonly byteBudget:string;readonly rowBudget:string;readonly entryBudget:number;
 readonly evidenceBytes:number;readonly receiptRows:number;readonly authorityBytes:number;readonly authorityLines:number;
}
export interface ReadingWitnessProof {
 readonly profile:'bound-reading-witness-proof@1';readonly witness:string;
 /** Native signed configuration record over the statement digest; evidence names these exact bytes plus LF. */
 readonly authorization:string;readonly receipts:readonly string[];
}
export type ReadingWitnessAdmission=
 | {readonly kind:'allow';readonly evidence:readonly string[]}
 | {readonly kind:'ask';readonly code:'reading-witness';readonly needs:readonly string[];readonly evidence:readonly string[]}
 | {readonly kind:'refuse';readonly code:'reading-witness';readonly why:string;readonly evidence:readonly string[]};
const fail=(why:string):never=>{throw Error('REFUSE·reading-witness/'+why)};
const path=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&!/[\\\u0000-\u0020\u007f]/.test(value)&&value.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');
function policyOf(line:string):ReadingWitnessPolicy{
 let value:ReadingWitnessPolicy;try{value=JSON.parse(fieldOf(line,'about'))}catch{return fail('policy-json')}
 if(!value||value.profile!=='bound-reading-witness-policy@1'||value.unit!=='physical-lines/utf8-lf@1'||!path(value.scope)||!(value.place==='.'||path(value.place))||!path(value.producer)||!path(value.port)||!path(value.readerMapping)||!Array.isArray(value.inventory)||!value.inventory.length||!value.inventory.every(path)||!Array.isArray(value.selectors)||!value.selectors.length||!value.selectors.every(path))return fail('policy-fields');
 if(!/^(0|[1-9][0-9]*)$/.test(value.byteBudget)||!/^(0|[1-9][0-9]*)$/.test(value.rowBudget)||[value.entryBudget,value.evidenceBytes,value.receiptRows,value.authorityBytes,value.authorityLines].some(n=>!Number.isSafeInteger(n)||n<1))return fail('policy-budgets');
 if(canonicalJson(value)!==fieldOf(line,'about'))return fail('policy-canonical');
 return value;
}
/** Explicitly selected witness policy only. Ordinary legacy witnessing remains the caller's existing rule. */
export function readingWitnessAdmission(root:string,proposed:readonly string[],standing:readonly string[],vocabulary:readonly string[]=standing,place:string='.'):ReadingWitnessAdmission{
 const evidence:string[]=[];
 try{
  const selectors=vocabulary.filter(line=>fieldOf(line,'scope')==='wire/reading-witness-admission'&&fieldOf(line,'value')!=='withdraw');
  if(!selectors.length)return {kind:'allow',evidence};
  if(selectors.length!==1||fieldOf(selectors[0]!,'value')!==READING_WITNESS_ADMISSION_PROFILE)return fail('profile-selection');
  const widening=widenedWithoutWitness(proposed.map(line=>canonical({...fieldsOf(line),at:'policy:unverified'})),standing,isCeiling,'witness');
  if(!widening.length)return {kind:'allow',evidence};
  const rows=vocabulary.filter(line=>fieldOf(line,'role')==='writes'&&fieldOf(line,'measure')==='reading-witness'&&fieldOf(line,'value')==='lock');
  const policies=rows.map(line=>({line,policy:policyOf(line)}));
  for(const bare of widening){
   const scope=fieldOf(bare,'scope'),selected=policies.filter(row=>row.policy.scope===scope&&row.policy.place===place);
   if(!selected.length)continue;
   if(selected.length!==1)return fail('policy-ambiguous/'+scope);
   const {line:policyLine,policy}=selected[0]!,now=proposed.find(line=>canonical({...fieldsOf(line),at:'policy:unverified'})===bare)!;
   const at=fieldOf(now,'at'),id=at.startsWith('witness:')?at.slice('witness:'.length):'';
   if(!isSha256(id))return {kind:'ask',code:'reading-witness',needs:['reading-witness/'+scope],evidence};
   const store=storeOf(root),bytes=readBoundedFile(join(store,'cas','blobs',id.slice(7)),policy.evidenceBytes,id);
   if(sha256(bytes)!==id)return fail('evidence-integrity');
   const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),proof=JSON.parse(text) as ReadingWitnessProof;
   if(!proof||proof.profile!=='bound-reading-witness-proof@1'||canonicalJson(proof)+'\n'!==text||typeof proof.witness!=='string'||typeof proof.authorization!=='string'||!Array.isArray(proof.receipts)||proof.receipts.length>policy.receiptRows||!proof.receipts.every(line=>typeof line==='string'))return fail('evidence-profile');
   const witness=decodeReadingWitness(proof.witness);
   if(witness.authentication!=='key-covered'||witness.key!==policy.producer||witness.unit!==policy.unit)return fail('producer-policy');
   const history=lockLines(store);if(history.length>policy.authorityLines||history.reduce((total,line)=>total+Buffer.byteLength(line),0)>policy.authorityBytes)return fail('authority-budget');
   const algorithms=signaturesOf(store).admitted,signer=rootSigner(root),authority=authorityFor(history,signer,algorithms),epoch=history.reduce((latest,line)=>Math.max(latest,Number(fieldOf(line,'epoch'))||0),0);
   if(authority.of(policyLine).kind!=='admitted'||authority.of(selectors[0]!).kind!=='admitted')return fail('policy-not-admitted');
   const auth=fieldsOf(proof.authorization),admitted=authority.of(proof.authorization),producer=authority.admitted.find(signer=>signer.id===policy.producer);
   if(admitted.kind!=='admitted'||admitted.signer!==policy.producer||!producer||authorityAtEpoch(auth,producer,epoch,policy.scope,'authority').kind!=='admitted')return fail('producer-not-current');
   if(auth.scope!==policy.scope||auth.role!=='writes'||auth.form!=='alphabet'||auth.measure!=='reading-witness'||auth.value!==sha256(readingWitnessStatementBytes(witness))||auth.restsOn!==sha256(canonicalJson(policy)+'\n')||witness.evidence!==sha256(proof.authorization+'\n')||witness.coverage!==sha256(JSON.stringify(producer.coverage)))return fail('authorization-binding');
   const nativeRoot:RootStanding={history,live:vocabulary,signer,eras:algorithms,epoch,budget:{lines:policy.authorityLines,bytes:policy.authorityBytes}};
   const current=authenticateNativeProfile(nativeRoot,policy.port);
   const mappings=vocabulary.filter(line=>fieldOf(line,'scope')===policy.readerMapping&&fieldOf(line,'value')===policy.port);
   if(mappings.length!==1||witness.implementation!==current.profile.selection.archive||witness.reader!==current.profile.selection.archive)return fail('current-native-reader');
   const mappingAuthority=authority.of(mappings[0]!),mappingSigner=mappingAuthority.kind==='admitted'?authority.admitted.find(one=>one.id===mappingAuthority.signer):undefined;
   if(mappingAuthority.kind!=='admitted'||mappingAuthority.signer!==signer.id||!mappingSigner||authorityAtEpoch(fieldsOf(mappings[0]!),mappingSigner,epoch,policy.readerMapping,'authority').kind!=='admitted')return fail('current-native-mapping-authority');
   const units=proof.receipts.filter(line=>fieldOf(line,'measure')==='bytes'&&fieldOf(line,'value')===witness.context&&fieldOf(line,'scope').startsWith('receipts/readings/'));
   if(units.length!==1||!fieldOf(units[0]!,'about'))return fail('native-context-required');
   const input=fieldOf(units[0]!,'about'),context=JSON.parse(input);
   if(!Array.isArray(context)||context.length!==6||context[0]!=='reading-context@1'||sha256(input)!==witness.context||context[2]!==witness.implementation)return fail('native-context-binding');
   if(new TextDecoder().decode(readingIdentityBytes({instrument:context[1],implementation:context[2],policy:context[3],inputs:context[4],environment:context[5]}))!==input)return fail('native-context-canonical');
   // All carrier bytes are inline: verification never reads a caller-named foreign file.
   for(const unit of proof.receipts.filter(line=>fieldOf(line,'measure')==='bytes'&&fieldOf(line,'scope').startsWith('receipts/readings/'))){const counts=proof.receipts.filter(line=>fieldOf(line,'scope')===fieldOf(unit,'scope')&&fieldOf(line,'measure')==='count');if(!fieldOf(unit,'about')||counts.length!==1||!fieldOf(counts[0]!,'about'))return fail('native-carrier-inline');}
   const verified=verifiedReadingReceipts(store,proof.receipts,sha256,undefined,true);if(!verified)return fail('native-receipt');
   const references=new Map<string,string>(context[4]);
   for(const member of current.profile.selection.members)if(references.get(JSON.stringify(['context','native/'+member.coordinate]))!==member.digest)return fail('current-native-members');
   if(references.get(JSON.stringify(['context','native/reader-mapping']))!==sha256(mappings[0]!))return fail('current-native-mapping');
   const reading=readPlacePhysicalLines({root:policy.place==='.'?root:join(root,policy.place),inventory:policy.inventory,regions:[{scope:policy.scope,selectors:policy.selectors}],policy:{entryBudget:policy.entryBudget,byteBudget:policy.byteBudget,rowBudget:policy.rowBudget},context:witness.context,reader:witness.reader,implementation:witness.implementation,run:witness.run});
   if(reading.status!=='read'||reading.stray.length||reading.reading.regions.some(region=>region.selections.some(selection=>selection.status!=='selected')))return fail('actual-reading-unmeasured');
   for(const file of reading.reading.inputFiles)if(references.get(JSON.stringify(['file',file.name]))!==file.digest)return fail('native-input-binding');
   const inputs=[...references.keys()].filter(name=>{try{return JSON.parse(name)[0]==='file'}catch{return false}});if(inputs.length!==reading.reading.inputFiles.length)return fail('native-input-inventory');
   authenticatePhysicalLinesWitness(reading,proof.witness,{producers:[{authentication:'key-covered',key:policy.producer,coverage:witness.coverage}],verify:()=>true});
   const unitScope=fieldOf(units[0]!,'scope');if(witness.run!==unitScope)return fail('native-run-binding');
   const counts=proof.receipts.filter(line=>fieldOf(line,'scope')===unitScope&&fieldOf(line,'measure')==='count'),output=fieldOf(counts[0]!,'about');
   const region=reading.reading.regions[0];if(!region||region.status!=='measured'||!output.split('\n').some(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')==='lines'&&fieldOf(line,'value')===region.value.numerator+'..'+region.value.numerator))return fail('native-result-binding');
   evidence.push(id,witness.context,witness.reading);
  }
  return {kind:'allow',evidence};
 }catch(error){return {kind:'refuse',code:'reading-witness',why:error instanceof Error?error.message:'REFUSE·reading-witness/invalid',evidence};}
}
