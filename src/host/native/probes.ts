import {prepareNativeViewIdentity,declaredReadingIdentityLimits} from '../reading-identity.ts';
import type {NativeViewIdentityContext} from '../reading-identity.ts';
import {authenticatedStanding} from '../admitted-place.ts';
import {withoutEffects} from '../read-only.ts';
import {BoundRefusal} from '../refusals.ts';

export type NativeProbeForm='lines'|'evidence';
/** This meter belongs to the consumer's operation. Keep it across calls and
 * share it between requests using the same port. It is never persisted by Bound. */
export interface NativeProbeCounter {readonly used:Map<string,number>}
export interface NativeProbePort {readonly coordinate:string;readonly probes:number;readonly responseBytes:number}
export interface NativeProbeContext extends NativeViewIdentityContext {
 readonly port:NativeProbePort;
 readonly counter:NativeProbeCounter;
 readonly signal?:AbortSignal;
}
export type NativeProbeResult=
 |{readonly kind:'fact';readonly form:NativeProbeForm;readonly port:string;readonly identity:string;readonly text:string;readonly probes:1}
 |{readonly kind:'refuse';readonly code:string;readonly diagnostic:string};
const refuse=(code:string,detail=code):never=>{throw new BoundRefusal(code,'REFUSE·'+detail);};
/** A recognized public reading of the existing captured native projection.
 * No fold, evaluator, retained-result cache or persistent receipt is entered.
 * A charged attempt stays charged even if the selected projection refuses. */
export function prepareNativeProbe(context:NativeProbeContext):NativeProbeResult {
 try{
  if(!context||typeof context.place!=='string'||!context.place||!context.instrument?.runtime)refuse('host/context');
  if(context.view!=='lines'&&context.view!=='evidence')refuse('reading-identity/selection','reading-identity/selection unsupported probe form '+String(context.view)+'; supports lines and evidence');
  const {port,counter,signal}=context;
  if(!port||!/^port\/[^\s]+$/.test(port.coordinate)||!counter||!(counter.used instanceof Map))refuse('host/context');
  for(const limit of [port.probes,port.responseBytes])if(!Number.isSafeInteger(limit)||limit<1)refuse('host/budget');
  if(signal?.aborted)refuse('host/cancelled');
  const used=counter.used.get(port.coordinate)??0;
  if(!Number.isSafeInteger(used)||used<0)refuse('host/budget');
  const declared=withoutEffects(()=>declaredReadingIdentityLimits(authenticatedStanding(context.place)));
  if(used>=Math.min(port.probes,declared.probes))refuse('host/budget');
  counter.used.set(port.coordinate,used+1);
  const result=prepareNativeViewIdentity(context);
  if(signal?.aborted)refuse('host/cancelled');
  if(result.kind==='refuse')return result;
  const response={kind:'fact' as const,form:result.view,port:port.coordinate,identity:result.identity,text:result.text,probes:1 as const};
  if(Buffer.byteLength(JSON.stringify(response),'utf8')>port.responseBytes)refuse('host/budget');
  return response;
 }catch(error){return {kind:'refuse',code:error instanceof BoundRefusal?error.code:'reading-identity/failed',diagnostic:error instanceof Error?error.message:'REFUSE·native probe failed'};}
}
