import type {Signer} from '@lapxo/topos/wire';
import {parse} from '@lapxo/topos/wire';
import {readingIdentity,readingReceiptIdentity} from '@lapxo/topos/contract';
import type {ReadingIdentityContext} from '@lapxo/topos/contract';
import {readContent} from '../engine/ports.ts';
import type {ContentReadPort,PortLimits} from '../engine/ports.ts';
import {sha256,isSha256} from './hash.ts';
import {BoundRefusal} from './refusals.ts';
import {refuseHost as refuse} from './host-controls.ts';
import {assertStandingView,publicStandingProjection} from './standing-projection.ts';

/** Initial read-only host slice. The receiver supplies the original anchor and
 * verified implementation/policy references; the offered bytes choose none of them.
 * Context references commit identity, not authority or conformance certification.
 */
export interface RootStandingHostContext {
 readonly place:string;
 readonly source:string;
 readonly snapshot:string;
 readonly anchor:Signer;
 readonly reading:ReadingIdentityContext;
 readonly limits:PortLimits & {readonly records:number};
 readonly signal?:AbortSignal;
}
export type RootStandingHostResult=
 | {readonly kind:'fact';readonly value:{readonly place:string;readonly rootStanding:readonly string[];readonly reading:string;readonly result:string;readonly commitment:string}}
 | {readonly kind:'refuse';readonly code:string;readonly diagnostic:string};

/** Uses the existing bounded content port, authority evaluator and projection.
 * It projects the Root component of a complete signed Root wire snapshot; it has no persistence callback,
 * current-root global, console output, process entry point or CLI subprocess.
 * Contextual places and their carriers are not this Root-only projection.
 * The returned commitment is unsigned and is not a paid native receipt.
 */
export async function readRootStandingInProcess(context:RootStandingHostContext,ports:{readonly read:ContentReadPort}):Promise<RootStandingHostResult>{
 try{
  if(!context||typeof context.place!=='string'||!context.place||typeof context.source!=='string'||!context.source||!isSha256(context.snapshot))refuse('context');
  if(context.signal?.aborted)refuse('cancelled');
  const {place,source,snapshot,signal}=context,limits={...context.limits};
  if(!Number.isSafeInteger(limits.records)||limits.records<1)refuse('budget');
  const anchor=structuredClone(context.anchor),reading=structuredClone(context.reading);
  if(!anchor||anchor.keyClass!=='authorize'||!anchor.id||!anchor.publicKey||!Array.isArray(anchor.coverage)||!anchor.coverage.length)refuse('context');
  // Validate the complete declared environment before invoking a host port.
  readingIdentity(reading,sha256);
  const identity=readingIdentity({...reading,inputs:[...reading.inputs,['host/place',sha256(place)],['host/anchor',sha256(JSON.stringify(anchor))],['host/snapshot',snapshot]]},sha256);
  const bytes=await readContent(source,snapshot,{read:ports.read,digestBytes:sha256},limits,signal);
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return refuse('snapshot-format')}
  const history=text.split('\n').filter(line=>line.length>0);
  if(history.length>limits.records)refuse('budget');
  if(!history.length||history.some(line=>parse(line).kind!=='fact'))refuse('snapshot-format');
  if(signal?.aborted)refuse('cancelled');
  const standing=publicStandingProjection(history,anchor);assertStandingView(standing);
  if(signal?.aborted)refuse('cancelled');
  const result=sha256(standing.join('\n')+(standing.length?'\n':''));
  return {kind:'fact',value:{place,rootStanding:standing,reading:identity,result,commitment:readingReceiptIdentity(identity,result,sha256)}};
 }catch(error){return {kind:'refuse',code:error instanceof BoundRefusal?error.code:'host/failed',diagnostic:error instanceof Error?error.message:'REFUSE·host/failed'}};
}
