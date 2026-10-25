import {topos_core_readPlaceActContext as readPlaceActContext,topos_core_verifyPlaceActContext as verifyPlaceActContext,topos_core_placeActReceiptsOf as placeActReceiptsOf,type topos_core_PlaceReceipt as PlaceReceipt,type topos_core_RootContext as RootContext} from "../../vendor/library.js";
import type {PlaceActTrust,PlaceActBudget,PlaceActBundle,PlaceActHead} from './ports/place-act.ts';
import {requireEffects} from './read-only.ts';
import {BoundRefusal} from './refusals.ts';
import {ActCommitUnknown} from './commit-result.ts';
import {assertHostNotCancelled as cancelled,receiverClock,placeRegionOf} from './host-controls.ts';
export {ActCommitUnknown as PlaceActCommitUnknown} from './commit-result.ts';

/** Host-selected persistence, never supplied by offered content. exclusive must
 * share the CLI's region/authority/projection protocol. publish is synchronous
 * with exactly one atomic visibility point; a thrown reply may follow commit. */
export interface PlaceActPersistence {
 readonly exclusive:<T>(regions:readonly string[],run:()=>Promise<T>)=>Promise<T>;
 readonly result:(identity:string,trust:PlaceActTrust,limits:PlaceActBudget)=>PlaceActBundle|undefined;
 readonly inventory:(limits:PlaceActBudget)=>{readonly names:readonly string[];readonly bytes:number};
 readonly heads:(trust:PlaceActTrust,limits:PlaceActBudget)=>readonly PlaceActHead[];
 readonly publish:(identity:string,files:Readonly<Record<string,string>>)=>void;
}
export type PlaceActReceiptSource=readonly PlaceReceipt[]|(()=>Promise<readonly PlaceReceipt[]>);
/** The visibility point may have happened. Only an authenticated result query
 * or replay can resolve this; the error never asserts rollback. */
const fail=(why:string):never=>{throw new BoundRefusal('host/act','REFUSE·place act '+why)};
const rootBytes=(r:RootContext)=>JSON.stringify([r.namespace,r.snapshot,r.epoch,r.prefix,r.head,r.policies]);

/** Shared transaction, including historical replay, current authorization and
 * atomic publication. Signing may await; current Root and receiver heads are
 * checked again afterwards while the same exclusion remains held. */
export async function transactPlaceAct(encoded:string,source:PlaceActReceiptSource,trust:PlaceActTrust,limits:PlaceActBudget,persistence:PlaceActPersistence,signal?:AbortSignal):Promise<PlaceActBundle&{readonly kind:'landed'|'once';readonly identity:string}>{
 requireEffects('place act commitment');cancelled(signal);
 if(!limits||!Number.isSafeInteger(limits.acts)||limits.acts<1||!Number.isSafeInteger(limits.bytes)||limits.bytes<1)fail('missing storage budget');
 const decoded=readPlaceActContext(encoded,trust.contract.budget),id=trust.contract.digest(encoded);
 const regions=decoded.places.map(p=>placeRegionOf(p.place));
 return persistence.exclusive(regions,async()=>{
  cancelled(signal);
  const prior=persistence.result(id,trust,limits);
  if(prior){
   if(prior.context!==encoded)fail('replay bytes differ');
   // A signing callback is never invoked for a historically authenticated replay.
   if(typeof source!=='function')placeActReceiptsOf(encoded,source,trust.historical(encoded));
   return {...prior,identity:id,kind:'once'};
  }
  const verified=verifyPlaceActContext(encoded,trust.contract);
  const originals=decoded.places.map(p=>p.records);
  const capacity=(size:number)=>{
   const inventory=persistence.inventory(limits);
   if(inventory.bytes+size>limits.bytes)fail('publication byte budget');
   if(inventory.names.length>=limits.acts)fail('publication act budget');
  };
  const sizeOf=(files:Readonly<Record<string,string>>)=>Object.values(files).reduce((n,v)=>n+new TextEncoder().encode(v).length,0);
  capacity(sizeOf({'context.json':encoded,'originals.json':JSON.stringify(originals)+'\n'}));
  const assertCurrent=()=>{
   const current=trust.current();if(rootBytes(current.root)!==rootBytes(verified.dependencies))fail('authority changed before publication');
   if(new Set(current.heads.map(h=>h.place)).size!==current.heads.length)fail('ambiguous receiver heads');
   const stored=persistence.heads(trust,limits);
   for(const p of decoded.places){
    const actual=stored.find(h=>h.place===p.place),selected=current.heads.find(h=>h.place===p.place);
    if(!actual||!selected||actual.identity!==selected.identity||actual.epoch!==selected.epoch)fail('receiver snapshot is not committed head '+p.place);
    if(selected!.identity!==p.previous)fail('receiver head moved '+p.place);
    const next=receiverClock(selected!.epoch,fail)+1;if(!Number.isSafeInteger(next)||receiverClock(p.epoch,fail)!==next)fail('receiver epoch not next '+p.place);
   }
  };
  assertCurrent();cancelled(signal);
  const receipts=structuredClone(typeof source==='function'?await source():source);
  cancelled(signal);placeActReceiptsOf(encoded,receipts,trust.contract);
  const files={'context.json':encoded,'receipts.json':JSON.stringify(receipts)+'\n','originals.json':JSON.stringify(originals)+'\n'};
  capacity(sizeOf(files));
  assertCurrent();cancelled(signal);
  try{persistence.publish(id,files)}catch(error){throw new ActCommitUnknown(id,error)}
  return {context:encoded,receipts,originals,identity:id,kind:'landed'};
 });
}
