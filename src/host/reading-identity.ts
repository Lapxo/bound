import {resolve} from 'node:path';
import {fieldOf} from '../fold/claims.ts';
import {storeOf} from '../land/ledger.ts';
import {underRootAuthority} from '../land/act.ts';
import {prepareObservedReadings} from '../fold/observed.ts';
import {authenticatedStanding} from './admitted-place.ts';
import {withHostCall} from './call-context.ts';
import {withContentStore} from './content-store.ts';
import {BoundRefusal} from './refusals.ts';
import type {NativeHostInstrument} from './native-receiver.ts';
import type {ReadingPreparationLimits,ReadingPreparationResult} from './reading-identity-types.ts';
export type {ReadingPreparationLimits,ReadingPreparationResult,PreparedReading} from './reading-identity-types.ts';
export interface NativeReadingIdentityContext {readonly place:string;readonly instrument:NativeHostInstrument;readonly limits:ReadingPreparationLimits;readonly reader?:string}
export type NativeReadingIdentityResult={readonly kind:'fact';readonly preparations:readonly ReadingPreparationResult[]}|{readonly kind:'refuse';readonly code:string;readonly diagnostic:string};
/** Receiver-selected instrument and admitted Root; no consumer-owned verifier or directory fingerprint. */
export async function prepareNativeReadingIdentity(context:NativeReadingIdentityContext):Promise<NativeReadingIdentityResult>{
 try{
  if(!context||typeof context.place!=='string'||!context.place||!context.instrument?.runtime)throw new BoundRefusal('host/context','REFUSE·host/context');
  const limits={...context.limits};
  for(const n of [limits.bytes,limits.files,limits.readings,limits.probes])if(!Number.isSafeInteger(n)||n<1)throw new BoundRefusal('host/budget','REFUSE·host/budget');
  if(limits.signal?.aborted)throw new BoundRefusal('host/cancelled','REFUSE·host/cancelled');
  const root=resolve(context.place),store=storeOf(root),instrument=structuredClone(context.instrument),reader=context.reader;
  return await withHostCall({instrumentName:instrument.name,runtime:instrument.runtime,output:()=>{}},()=>withContentStore(store,()=>underRootAuthority(store,'prepare reading identity',()=>{
   const declared=declaredReadingIdentityLimits(authenticatedStanding(root));
   for(const key of ['bytes','files','readings','probes'] as const)limits[key]=Math.min(limits[key],declared[key]);
   const preparations=prepareObservedReadings(root,store,limits,reader);
   return {kind:'fact' as const,preparations};
  }),()=>authenticatedStanding(root)));
 }catch(error){return {kind:'refuse',code:error instanceof BoundRefusal?error.code:'reading-identity/failed',diagnostic:error instanceof Error?error.message:'REFUSE·reading identity failed'};}
}

/** Resource values come from the admitted place, not a default chosen by the consumer. */
export function declaredReadingIdentityLimits(standing:readonly string[]):Omit<ReadingPreparationLimits,'signal'>{
 const limit=(key:string)=>{const rows=standing.filter(l=>fieldOf(l,'scope')==='reading-identity/'+key&&fieldOf(l,'role')==='writes'&&fieldOf(l,'value')!=='withdraw');
  if(rows.length!==1)throw new BoundRefusal('reading-identity/budget','REFUSE·reading identity requires one declared '+key+' limit');
  const span=/^0\.\.([1-9][0-9]*)$/.exec(fieldOf(rows[0]!,'value')),n=Number(span?.[1]);
  if(!span||!Number.isSafeInteger(n))throw new BoundRefusal('reading-identity/budget','REFUSE·invalid reading identity '+key+' limit');return n;};
 return {bytes:limit('bytes'),files:limit('files'),readings:limit('readings'),probes:limit('probes')};
}
