import {readFileSync} from 'node:fs';
import {sha256} from './hash.ts';
import {captureViewInputs,viewInput,readingEnvironment,withViewInputObservation,sharedViewInputs} from './reading-context.ts';
import {withoutEffects} from './read-only.ts';
import {committedInventoryFingerprint,committedLocalActs,withCommittedLocalActObservation} from './ports/local-act.ts';
import {ingressBundles} from './ports/ingress.ts';
import {instrumentCoordinates} from '../fold/digests.ts';
import {viewsOf} from '../fold/views.ts';
import {standingOf} from '../cli/place.ts';
import {evidenceLines} from '../render/view.ts';
import {resolve,join} from 'node:path';
import {LOCK} from '@lapxo/topos/wire';
import {fieldOf,isWire} from '../fold/claims.ts';
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

export interface NativeViewIdentityContext {readonly place:string;readonly instrument:NativeHostInstrument;readonly view:string;readonly expectedIdentity?:string}
export type NativeViewIdentityResult={readonly kind:'fact';readonly view:'lines'|'evidence';readonly identity:string;readonly text:string}|{readonly kind:'refuse';readonly code:string;readonly diagnostic:string};
/** Prepare only native configuration projections. No foldPlace, observation,
 * executable reader, resolver, persistence, lease or Root exclusion is entered.
 * The returned text and identity share one immutable committed observation. */
export function prepareNativeViewIdentity(context:NativeViewIdentityContext):NativeViewIdentityResult{
 const result=prepareNativeViewIdentities(context&&{place:context.place,instrument:context.instrument,views:[context.view],...(context.expectedIdentity===undefined?{}:{expectedIdentities:{[context.view]:context.expectedIdentity}})});
 if(result.kind==='refuse')return result;
 return result.views[0]!;
}
export interface NativeViewIdentitiesContext {
 readonly place:string;readonly instrument:NativeHostInstrument;readonly views:readonly string[];
 readonly expectedIdentities?:Readonly<Record<string,string>>;
}
export type NativeViewIdentitiesResult={readonly kind:'fact';readonly views:readonly Extract<NativeViewIdentityResult,{kind:'fact'}>[]}|Extract<NativeViewIdentityResult,{kind:'refuse'}>;
/** Each view retains its own input identity. A batch shares one fresh observation,
 * never a persistent cache, and returns nothing if any selection or check fails. */
export function prepareNativeViewIdentities(context:NativeViewIdentitiesContext):NativeViewIdentitiesResult{
 try{
  if(!context||!context.instrument?.runtime||typeof context.place!=='string'||!context.place)throw new BoundRefusal('host/context','REFUSE·host/context');
  if(!Array.isArray(context.views)||!context.views.length||new Set(context.views).size!==context.views.length||context.views.some(view=>view!=='lines'&&view!=='evidence'))throw new BoundRefusal('reading-identity/selection','REFUSE·reading-identity/selection requires distinct supported native views');
  if(context.expectedIdentities&&Object.keys(context.expectedIdentities).some(view=>!context.views.includes(view)))throw new BoundRefusal('reading-identity/selection','REFUSE·reading-identity/selection expected identity names an unselected view');
  const views=[...context.views] as ('lines'|'evidence')[],expected={...context.expectedIdentities},root=resolve(context.place),store=storeOf(root),instrument=structuredClone(context.instrument);
  return withHostCall({instrumentName:instrument.name,runtime:instrument.runtime,output:()=>{}},()=>withoutEffects(()=>{
   const before=committedInventoryFingerprint(committedLocalActs(store));
   const limits=declaredReadingIdentityLimits(authenticatedStanding(root)),day=new Date().toISOString().slice(0,10),environment=readingEnvironment(sha256);
   if(views.length>limits.readings)throw new BoundRefusal('reading-identity/budget','REFUSE·reading-identity/budget selected views exceed admitted readings');
   const common=sharedViewInputs(()=>{
    const standing=standingOf(root).standing;
    const implementation=[...instrumentCoordinates(store,instrument.runtime.entry,[],instrument.runtime.root,[],true)].map(([name,digest])=>[name,digest]);
    if(!implementation.length)throw new BoundRefusal('reading-identity/failed','REFUSE·reading-identity/failed is unavailable');
    const instrumentLock=sha256(viewInput('instrument-lock:'+instrument.runtime.root,()=>readFileSync(join(instrument.runtime.root,LOCK),'utf8')));
    return {standing,implementation,instrumentLock};
   });
   const prepared=withViewInputObservation(()=>withCommittedLocalActObservation(store,()=>views.map(view=>{
    const captured=captureViewInputs(limits,()=>{
     const current=declaredReadingIdentityLimits(viewInput('authenticated-configuration:'+root,()=>authenticatedStanding(root)));
     if(JSON.stringify(current)!==JSON.stringify(limits))throw new BoundRefusal('reading-identity/context','REFUSE·reading-identity/context identity budget changed');
     if(view==='evidence'&&viewInput('foreign-ingress:'+store,()=>ingressBundles(store)).length)throw new BoundRefusal('reading-identity/selection','REFUSE·reading-identity/selection foreign view identity requires a transport snapshot');
     const {standing,implementation,instrumentLock}=common();
     if(view==='evidence'){
      const declared=viewsOf(standing).get(view);
      if(!declared||declared.shape||declared.regions.length!==1||declared.regions[0]?.name!=='evidence')throw new BoundRefusal('reading-identity/selection','REFUSE·reading-identity/selection requires the native evidence projection');
     }
     const lines=view==='lines'?standing.filter(isWire):evidenceLines(root,store);
     return {text:lines.length?lines.join('\n')+'\n':'',implementation,instrumentLock};
    });
    return {view,captured};
   })));
   const after=committedInventoryFingerprint(committedLocalActs(store));
   if(before!==after||day!==new Date().toISOString().slice(0,10)||JSON.stringify(environment)!==JSON.stringify(readingEnvironment(sha256)))throw new BoundRefusal('reading-identity/context','REFUSE·reading-identity/context committed inputs changed during preparation');
   const results=prepared.map(({view,captured})=>{
    const identity=sha256(JSON.stringify(['native-view-inputs@1',root,view,before,captured.inputs,captured.value.implementation,captured.value.instrumentLock,environment,day]));
    if(expected[view]!==undefined&&expected[view]!==identity)throw new BoundRefusal('reading-identity/context','REFUSE·reading-identity/context view identity differs from the expected snapshot');
    return {kind:'fact' as const,view,identity,text:captured.value.text};
   });
   return {kind:'fact' as const,views:results};
  }));
 }catch(error){return {kind:'refuse',code:error instanceof BoundRefusal?error.code:'reading-identity/failed',diagnostic:error instanceof Error?error.message:'REFUSE·view identity failed'};}
}
