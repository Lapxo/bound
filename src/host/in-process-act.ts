import {authorityAtEpoch} from '@lapxo/topos/wire';
import {placeReceiptBytes,readPlaceActContext} from '@lapxo/topos/core';
import {readingIdentity,readingReceiptIdentity,type ReadingIdentityContext} from '@lapxo/topos/contract';
import {readContent,invokeFrameSigningPort,type ContentReadPort,type SigningPort,type PortLimits} from '../engine/ports.ts';
import {transactPlaceAct,PlaceActCommitUnknown,type PlaceActPersistence} from './place-act-transaction.ts';
import type {PlaceActTrust,PlaceActBudget} from './ports/place-act.ts';
import {withActHost} from '../land/act.ts';
import {sha256,isSha256} from './hash.ts';
import {BoundRefusal} from './refusals.ts';
import {refuseHost as fail} from './host-controls.ts';
import {withHostInstrument} from './call-context.ts';
import {requireEffects} from './read-only.ts';

export interface PlaceActHostContext {
 readonly place:string;
 readonly source:string;
 readonly identity:string;
 readonly rootSnapshot:string;
 readonly reading:ReadingIdentityContext;
 readonly algorithm:string;
 readonly contentLimits:PortLimits;
 readonly signingLimits:PortLimits;
 readonly storageLimits:PlaceActBudget;
 readonly signal?:AbortSignal;
}
/** These are receiver-selected host ports, not carrier fields or an offered
 * verifier. Trust must be constructed from the authenticated receiver snapshot. */
export interface PlaceActHostPorts {
 readonly instrumentName:string;
 readonly read:ContentReadPort;
 readonly sign:SigningPort;
 readonly trust:()=>PlaceActTrust;
 readonly persistence:PlaceActPersistence;
 readonly limits:{readonly storage:PlaceActBudget;readonly signing:PortLimits;readonly content:PortLimits};
}
/** Signs receiver receipts through the bounded existing signer protocol. Exact
 * original declarations/proofs remain unchanged. Replay is historical recovery,
 * never a new permission. A refusal after visibility is not a rollback claim. */
export async function landPlaceActInProcess(context:PlaceActHostContext,ports:PlaceActHostPorts){
 return withHostInstrument(ports.instrumentName,()=>withActHost({name:ports.instrumentName,report:()=>{},signal:context.signal},async()=>{
  try{
   requireEffects('contextual host admission');
   const {place,source,identity,rootSnapshot,algorithm,signal}=context,reading=structuredClone(context.reading),contentLimits={...context.contentLimits},signingLimits={...context.signingLimits},storageLimits={...context.storageLimits};
   if(typeof ports.instrumentName!=='string'||!ports.instrumentName||!/[a-zA-Z0-9]/.test(ports.instrumentName)||!/^[a-zA-Z0-9._-]+$/.test(ports.instrumentName)||typeof place!=='string'||!place||typeof source!=='string'||!source||typeof algorithm!=='string'||!algorithm)fail('context');
   if(storageLimits.acts>ports.limits.storage.acts||storageLimits.bytes>ports.limits.storage.bytes||signingLimits.timeoutMs>ports.limits.signing.timeoutMs||signingLimits.maxBytes>ports.limits.signing.maxBytes||contentLimits.timeoutMs>ports.limits.content.timeoutMs||contentLimits.maxBytes>ports.limits.content.maxBytes)fail('budget');
   const key=readingIdentity({...reading,inputs:[...reading.inputs,['host/place',sha256(place)],['host/snapshot',rootSnapshot],['host/act',identity],['host/operation',sha256(JSON.stringify([algorithm,contentLimits,signingLimits,storageLimits]))]]},sha256);
   const trust=ports.trust();
   if(trust.contract.root.snapshot!==rootSnapshot)fail('stale');
   if(contentLimits.maxBytes>trust.contract.budget.bytes)fail('budget');
   const bytes=await readContent(source,identity,{read:ports.read,digestBytes:sha256},contentLimits,signal);
   let encoded:string;try{encoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return fail('snapshot-format')}
   const decoded=readPlaceActContext(encoded,trust.contract.budget);
   if(trust.contract.digest(encoded)!==identity)fail('integrity');
   const acquire=async()=>{
    const by=trust.contract.receiptSigner,signer=trust.contract.signers.find(s=>s.id===by);
    if(!signer||authorityAtEpoch({scope:trust.contract.receiptScope,by},signer,Number(trust.contract.root.epoch),trust.contract.receiptScope,'authority').kind!=='admitted')fail('receiver-authority');
    const signed=await invokeFrameSigningPort({keyId:by,algorithm,bytes:decoded.places.map(p=>placeReceiptBytes(identity,p,decoded.root,by,trust.contract.receiptScope,trust.contract.budget))},ports.sign,signingLimits,signal);
    return decoded.places.map((p,i)=>({place:p.place,by,signature:signed[i]!.signature}));
   };
   const act=await transactPlaceAct(encoded,acquire,trust,storageLimits,ports.persistence,signal);
   const result=sha256(JSON.stringify(act)+'\n');
   return {kind:'fact' as const,value:{place,act,reading:key,result,commitment:readingReceiptIdentity(key,result,sha256)}};
  }catch(error){
   if(error instanceof PlaceActCommitUnknown)return {kind:'uncertain' as const,identity:error.identity,code:error.code,diagnostic:error.message};
   return {kind:'refuse' as const,code:error instanceof BoundRefusal?error.code:'host/failed',diagnostic:error instanceof Error?error.message:'REFUSE·host/failed'};
  };
 }));
}

/** Historical recovery after a lost response. No signer, current authorization
 * or publication callback is invoked and the result grants no new act. */
export function recoverPlaceActInProcess(context:Pick<PlaceActHostContext,'place'|'identity'|'reading'|'storageLimits'|'signal'>,ports:Pick<PlaceActHostPorts,'instrumentName'|'trust'|'persistence'|'limits'>){
 return withHostInstrument(ports.instrumentName,()=>withActHost({name:ports.instrumentName,report:()=>{},signal:context.signal},()=>{
  try{
   if(context.signal?.aborted)fail('cancelled');
   if(!context.place||!isSha256(context.identity))fail('context');
   const limits={...context.storageLimits};
   if(limits.acts>ports.limits.storage.acts||limits.bytes>ports.limits.storage.bytes)fail('budget');
   const reading=readingIdentity({...structuredClone(context.reading),inputs:[...context.reading.inputs,['host/place',sha256(context.place)],['host/act',context.identity],['host/operation',sha256('historical-recovery')]]},sha256);
   const act=ports.persistence.result(context.identity,ports.trust(),limits);if(!act)fail('act-unavailable');
   const result=sha256(JSON.stringify(act)+'\n');
   return {kind:'fact' as const,value:{place:context.place,identity:context.identity,act,historical:true as const,reading,result,commitment:readingReceiptIdentity(reading,result,sha256)}};
  }catch(error){return {kind:'refuse' as const,code:error instanceof BoundRefusal?error.code:'host/failed',diagnostic:error instanceof Error?error.message:'REFUSE·host/failed'}};
 }));
}
