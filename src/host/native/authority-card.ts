import {readFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {authorityAtEpoch,parse,LOCK} from '@lapxo/topos/wire';
import {encodeAuthorityCard,authorityCardStatement,authorityCardAnswer} from '@lapxo/topos/contract';
import type {AuthorityCard,RecordBudget,RegistryHorizon} from '@lapxo/topos/contract';
import {admissionHistoryAt,admissionAnchor} from '../../fold/admission-history.ts';
import {projectAuthenticatedStanding} from '../standing-projection.ts';
import {authorityFor} from '../../fold/signers.ts';
import {ownRecordAdmitted,appliedHistoryIn} from '../../fold/signed.ts';
import {signatureEraOf} from '../signature-era.ts';
import {epochOf,localActLines} from '../../cli/owner.ts';
import {fieldOf,foldClaims,isConfig,sayingOf} from '../../fold/claims.ts';
import {admissionChecks,admissionWideningChecks,configurationAdmissionGuards,configurationEpochCheck,admissionEvidenceResult} from '../../cli/accept.ts';
import {wordOf} from '../../fold/wire.ts';
import {isCeiling} from '../../fold/configures.ts';
import {installedReferenceContracts} from '../reference-contracts.ts';
import {placesIn} from '../../fold/places.ts';
import {sha256} from '../hash.ts';
import {underRootAuthority} from '../../land/act.ts';
import {storeOf} from '../../land/ledger.ts';
import {withContentStore} from '../content-store.ts';
import {withoutEffects} from '../read-only.ts';
import {BoundRefusal} from '../refusals.ts';
import {withHostCall} from '../call-context.ts';
import type {NativeHostInstrument} from '../native-receiver.ts';

export interface NativeAuthorityAction {readonly kind:'record-coverage'|'admission';readonly records:readonly string[]}
export interface NativeAuthorityCardContext {
 readonly root:string;readonly place:string;readonly key:string;readonly instrument:NativeHostInstrument;
 readonly authorityEpoch?:number;readonly clock:{readonly name:string;readonly unit:string;readonly now:number};
 readonly horizon:RegistryHorizon;readonly limits:RecordBudget;readonly actions:readonly NativeAuthorityAction[];
}
export interface NativeAuthorityJudgment {readonly request:string;readonly decision:'allow'|'ask'|'deny'|'open';readonly evidence:readonly unknown[];readonly needs:readonly string[]}
export interface NativeAuthorityCardValue {readonly card:AuthorityCard;readonly line:string;readonly identity:string;readonly judgments:readonly NativeAuthorityJudgment[];readonly needs:readonly string[]}
const hash=(value:unknown)=>sha256(JSON.stringify(value));
const fail=(why:string):never=>{throw new BoundRefusal('authority-preflight/'+why,'REFUSE·authority-preflight/'+why)};
export const nativeAuthorityRequestIdentity=(action:NativeAuthorityAction):string=>hash(['native-authority-request/1',action.kind,action.records]);
/** Fresh native receiver selection when no expected epoch is supplied. Explicit
 * epochs remain stale-state conditions; wire requests still require their epoch.
 * Read-only preflight never grants a later act. */
export async function prepareNativeAuthorityCard(context:NativeAuthorityCardContext,issuedAt?:number):Promise<{kind:'fact';value:NativeAuthorityCardValue}|{kind:'refuse';code:string;diagnostic:string}>{
 try{const selectedRoot=realpathSync(context.root);return await withHostCall({instrumentName:context.instrument.name,runtime:context.instrument.runtime,output:()=>{}},()=>withContentStore(storeOf(selectedRoot),()=>underRootAuthority(storeOf(selectedRoot),'authority card preflight',()=>withoutEffects(()=>{
  const {place,key,clock,limits}=context,root=realpathSync(context.root);
  if(place!=='.'&&(!place||place.startsWith('/')||place.includes('\\')||place.split('/').some(p=>!p||p==='.'||p==='..')))fail('place');
  if(place!=='.'&&!placesIn(root).includes(place))fail('place');
  if(!Number.isSafeInteger(clock.now)||(context.authorityEpoch!==undefined&&!Number.isSafeInteger(context.authorityEpoch))||!Number.isSafeInteger(limits.bytes)||limits.bytes<1||!Number.isSafeInteger(limits.items)||limits.items<1)fail('context');
  if(context.actions.length>limits.items)fail('budget');
  const history=admissionHistoryAt(root,Number.MAX_SAFE_INTEGER),anchor=admissionAnchor(root);
  if(history.length+context.actions.reduce((n,a)=>n+a.records.length,0)>limits.items||Buffer.byteLength(JSON.stringify([history,context.actions]))>limits.bytes)fail('budget');
  const authorityEpoch=epochOf(history);
  if(context.authorityEpoch!==undefined&&authorityEpoch!==context.authorityEpoch)fail('stale-epoch');
  const standing=projectAuthenticatedStanding(history,anchor),algorithms=signatureEraOf(standing).admitted;
  const authority=authorityFor(history,anchor,algorithms),signer=authority.admitted.find(s=>s.id===key);
  const snapshot=sha256(readFileSync(join(root,place==='.'?'':place,LOCK)));
  const judgments:NativeAuthorityJudgment[]=context.actions.map(action=>{
   const request=nativeAuthorityRequestIdentity(action),evidence:unknown[]=[],needs:string[]=[];
   if(action.kind!=='record-coverage'&&action.kind!=='admission')return {request,decision:'deny',evidence:[{check:'unsupported-action',kind:action.kind}],needs:[]};
   if(!action.records.length)return {request,decision:'ask',evidence:[],needs:['authority-preflight/records']};
   let denied=false;
   for(const line of action.records){
    const got=parse(line);if(got.kind!=='fact'){denied=true;evidence.push({check:'wire-parse',line,result:got});continue;}
    const scope=place==='.'?got.value.fields.scope??'':`${wordOf(standing,'families','region')}/${place}/${got.value.fields.scope??''}`;
    const current=signer?authorityAtEpoch({...got.value.fields,by:key},signer,authorityEpoch,scope,'authority'):{kind:'refuse',why:'requested key is not admitted'};
    evidence.push({check:'authorityAtEpoch',line,scope,result:current});if(current.kind!=='admitted')denied=true;
    if(got.value.fields.sig){const admitted=place==='.'?authority.of(line).kind==='admitted':ownRecordAdmitted(line,place,wordOf(standing,'families','region'),authority.admitted,algorithms);evidence.push({check:'authenticated-record',line,admitted});if(!admitted||got.value.fields.by!==key)denied=true;}
   }
   if(denied)return {request,decision:'deny',evidence,needs};
   const selectedStanding=place==='.'?standing:foldClaims(appliedHistoryIn(root,place)).standing;
   const widening=admissionWideningChecks(root,action.records,selectedStanding,standing,place);
   evidence.push({check:'admissionWideningChecks',result:widening,standing:hash(selectedStanding)});
   if(widening.kind==='ask')return {request,decision:'ask',evidence,needs:widening.needs};
   if(widening.kind==='refuse')return {request,decision:'deny',evidence,needs:[]};
   if(action.kind==='record-coverage')return {request,decision:'allow',evidence,needs};
   if(action.records.some(line=>!isConfig(line)))return {request,decision:'deny',evidence:[...evidence,{check:'configuration-only',result:'unsupported-object-action'}],needs:[]};
   const unsigned=action.records.filter(line=>!fieldOf(line,'sig'));
   if(unsigned.length)return {request,decision:'ask',evidence:[...evidence,{check:'signature',records:unsigned}],needs:unsigned.map(line=>'signature:'+fieldOf(line,'scope'))};
   const heldRecords=new Set((place==='.'?history:appliedHistoryIn(root,place)).map(sayingOf));
   const prospectiveEpoch=epochOf(localActLines(root,place==='.'?[]:[place]))+1;
   const stale=configurationEpochCheck(action.records,prospectiveEpoch,line=>heldRecords.has(sayingOf(line)));
   if(stale.length)return {request,decision:'deny',evidence:[...evidence,{check:'prospective-epoch',records:stale,expected:prospectiveEpoch}],needs:[]};
   const guarded=configurationAdmissionGuards(root,action.records,place==='.'?[]:[place]);
   evidence.push({check:'configurationAdmissionGuards',result:guarded});
   if(guarded.kind==='refuse')return {request,decision:'deny',evidence,needs:[]};
   const checks=admissionChecks(root,guarded.ownership.ledger,standing);evidence.push({check:'admissionChecks',result:checks});
   if(checks.kind==='ask')return {request,decision:'ask',evidence,needs:checks.needs};
   if(checks.kind==='refuse')return {request,decision:'deny',evidence,needs:[]};
   const checked=admissionEvidenceResult(root,place==='.'?guarded.ownership.ledger:action.records,selectedStanding,clock.now);
   if(checked.kind==='refuse'){
    evidence.push({check:'admissionEvidence',result:checked});
    const missing=checked.code==='admission/inert'||checked.code==='admission/evidence';
    return {request,decision:missing?'ask':'deny',evidence,needs:missing?(action.records.filter(isCeiling).length?action.records.filter(isCeiling).map(line=>'reading:'+fieldOf(line,'scope')):['admission-evidence:'+request]):[]};
   }
   const {coordinates,judged,fold}=checked.evidence;
   // Timing and transient caches are not proof material. Keep exact native
   // judgment/reading evidence while omitting operational elapsed timestamps.
   const stableJudged=judged.map(one=>one.kind==='judged'?{...one,started:undefined}:one);
   evidence.push({check:'admissionEvidence',coordinates,judged:stableJudged,fold:{standing:fold.standing,observed:fold.observed,own:fold.own}});
   const unpaid=judged.filter(one=>one.kind==='owed');
   return {request,decision:unpaid.length?'ask':'allow',evidence,needs:unpaid.map(one=>'demand:'+one.scope)};

  });
  const serialJudgments=JSON.parse(JSON.stringify(judgments,(_key,value)=>value instanceof Map?[...value]:value)) as NativeAuthorityJudgment[];
  const authorityDigest=hash([anchor,authority.admitted,history]);
  const coverage=hash(['native-authority-coverage/1',root,place,key,signer??null,judgments.map(j=>j.request)]);
  const grants=standing.filter(line=>fieldOf(line,'scope').startsWith('keys/'));
  const retirements=history.filter(line=>fieldOf(line,'scope').startsWith('keys/')&&fieldOf(line,'value')==='withdraw');
  const contracts=installedReferenceContracts();
  const card:AuthorityCard={place,snapshot,key,authority:authorityDigest,coverage,policy:hash(standing),budget:hash(limits),catalog:contracts.refusals,standingContract:contracts.standing,grants:grants.map(sha256),retirements:retirements.map(sha256),demands:standing.filter(line=>fieldOf(line,'role')==='demands').map(sha256),horizon:context.horizon,issuedAt:issuedAt??clock.now,actions:judgments.filter(j=>j.decision!=='open').map(j=>({request:j.request,decision:j.decision as 'allow'|'ask'|'deny'})),evidence:hash(serialJudgments)};
  if(hash(admissionHistoryAt(root,Number.MAX_SAFE_INTEGER))!==hash(history)||sha256(readFileSync(join(root,place==='.'?'':place,LOCK)))!==snapshot)fail('context-changed');
  const line=encodeAuthorityCard(card,limits),needs=[...new Set(judgments.flatMap(j=>j.needs))];
  const value={card,line,identity:hash([root,place,coverage,line]),judgments:serialJudgments,needs};
  if(Buffer.byteLength(JSON.stringify(value))>limits.bytes)fail('budget');
  return {kind:'fact' as const,value};
 }))));}catch(error){return {kind:'refuse',code:error instanceof BoundRefusal?error.code:'authority-preflight/failed',diagnostic:error instanceof Error?error.message:'REFUSE·authority preflight failed'};}
}
/** The verifier is the actual rerun above, never a callback from card bytes. */
export async function answerNativeAuthorityCard(card:AuthorityCard,request:string,context:NativeAuthorityCardContext){
 const current=await prepareNativeAuthorityCard(context,card.issuedAt);
 if(current.kind==='refuse'){if(current.code==='authority-preflight/stale-epoch'||current.code==='authority-preflight/context-changed')return {status:'refused' as const,code:'card-stale' as const,next:'refresh-card' as const};return current;}
 const value=current.value,c=value.card;
 return authorityCardAnswer(card,request,{place:c.place,snapshot:c.snapshot,key:c.key,authority:c.authority,coverage:c.coverage,policy:c.policy,budget:c.budget,catalog:c.catalog,standingContract:c.standingContract,clock:context.clock,verifiesJudgment:(statement,evidence)=>statement===authorityCardStatement(c,context.limits)&&evidence===c.evidence},context.limits);
}

export type NativeAuthorityCardRequest=Omit<NativeAuthorityCardContext,'root'|'instrument'> & {readonly profile:'native-authority-card-request/1';readonly authorityEpoch:number};
export function parseNativeAuthorityCardRequest(text:string,expectedDigest:string,limits:RecordBudget):NativeAuthorityCardRequest {
 if(!Number.isSafeInteger(limits.bytes)||limits.bytes<1||Buffer.byteLength(text)>limits.bytes||sha256(text)!==expectedDigest)fail('request-integrity');
 const value=JSON.parse(text) as NativeAuthorityCardRequest;
 if(!value||Object.keys(value).sort().join(',')!=='actions,authorityEpoch,clock,horizon,key,limits,place,profile'||value.profile!=='native-authority-card-request/1'||!Array.isArray(value.actions)||value.actions.length>limits.items)fail('request-format');
 const exact=(input:unknown,names:string)=>input!==null&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).sort().join(',')===names;
 if(!exact(value.clock,'name,now,unit')||!exact(value.horizon,'clock,from,through,unit')||!exact(value.limits,'bytes,items'))fail('request-context');
 for(const item of [limits.items,value.limits.bytes,value.limits.items])if(!Number.isSafeInteger(item)||item<1)fail('request-budget');
 if(value.limits.bytes>limits.bytes||value.limits.items>limits.items||!Number.isSafeInteger(value.authorityEpoch)||value.authorityEpoch<0||!Number.isSafeInteger(value.clock.now)||!Number.isSafeInteger(value.horizon.from)||!Number.isSafeInteger(value.horizon.through)||value.horizon.from>value.horizon.through)fail('request-context');
 for(const item of [value.place,value.key,value.clock.name,value.clock.unit,value.horizon.clock,value.horizon.unit])if(typeof item!=='string'||!item||/[\u0000-\u0020\u007f]/.test(item))fail('request-context');
 if(value.clock.name!==value.horizon.clock||value.clock.unit!==value.horizon.unit||value.clock.now<value.horizon.from||value.clock.now>value.horizon.through)fail('request-clock');
 if(value.actions.some(action=>!action||Object.keys(action).sort().join(',')!=='kind,records'||!['record-coverage','admission'].includes(action.kind)||!Array.isArray(action.records)||action.records.some(line=>typeof line!=='string')))fail('request-action');
 if(value.actions.reduce((n,a)=>n+a.records.length,0)>value.limits.items)fail('request-budget');
 return structuredClone(value);
}
