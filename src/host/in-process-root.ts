import {canonical,parse} from '@lapxo/topos/wire';
import {readingIdentity,readingReceiptIdentity,type ReadingIdentityContext} from '@lapxo/topos/contract';
import {readContent,type ContentReadPort,type SigningPort,type PortLimits} from '../engine/ports.ts';
import {acceptRootRecords} from '../cli/accept.ts';
import {verifiedLegacyActResult} from '../cli/act-result.ts';
import {admissionHistoryAt,admissionAnchor} from '../fold/admission-history.ts';
import {isConfig} from '../fold/claims.ts';
import {sha256,isSha256} from './hash.ts';
import {BoundRefusal} from './refusals.ts';
import {refuseHost as fail} from './host-controls.ts';
import {ActCommitUnknown} from './commit-result.ts';
import {requireEffects} from './read-only.ts';
import {withHostCall,type HostInstrumentRuntime} from './call-context.ts';
import {withActHost} from '../land/act.ts';
import type {LocalActBundle} from './ports/local-act.ts';
import type {PublicationStorage} from './ports/publication.ts';

export interface RootLotContext {
 readonly place:string;
 readonly snapshot:string;
 readonly source:string;
 readonly digest:string;
 readonly reading:ReadingIdentityContext;
 readonly limits:PortLimits&{readonly records:number};
 readonly signal?:AbortSignal;
}
/** The receiver selects the actual native place, instrument and signer. The lot
 * supplies only canonical unsigned Root configuration, never host capabilities. */
export interface RootLotPorts {
 readonly root:string;
 readonly instrumentName:string;
 readonly runtime:HostInstrumentRuntime;
 readonly read:ContentReadPort;
 readonly signer:{readonly keyId:string;readonly name:string;readonly sign:SigningPort};
 readonly storage?:PublicationStorage;
 readonly prepared?:(identity:string)=>void;
 readonly limits:RootLotContext['limits']&{readonly diagnostics:number};
}
/** Snapshot identity, not a new wire, authority algorithm or current permit. */
export const rootLotSnapshot=(root:string):string=>sha256(admissionHistoryAt(root,Number.MAX_SAFE_INTEGER).join('\n')+'\n');

export async function landRootLotInProcess(context:RootLotContext,ports:RootLotPorts){
 const diagnostics:{stream:'out'|'error';text:string}[]=[];let size=0;
 let committed:{identity:string;bundle:LocalActBundle;status:'landed'|'once'}|undefined;
 const runtime=structuredClone(ports.runtime),limits={...context.limits};
 return withHostCall({instrumentName:ports.instrumentName,runtime,output:(stream,text)=>{size+=new TextEncoder().encode(text).length;if(size>ports.limits.diagnostics)fail('budget');diagnostics.push({stream,text})}},()=>withActHost({name:ports.instrumentName,report:text=>{size+=new TextEncoder().encode(text).length;if(size>ports.limits.diagnostics)fail('budget');diagnostics.push({stream:'error',text})},signal:context.signal},async()=>{
  try{
   requireEffects('Root lot admission');
   if(!context.place||!ports.root||!ports.instrumentName||!runtime.root||!runtime.entry||!runtime.directory||!['.ts','.js'].includes(runtime.extension)||!Array.isArray(runtime.lock)||!runtime.lock.length)fail('context');
   if(limits.records>ports.limits.records||limits.maxBytes>ports.limits.maxBytes||limits.timeoutMs>ports.limits.timeoutMs||!Number.isSafeInteger(limits.records)||limits.records<1||!Number.isSafeInteger(ports.limits.diagnostics)||ports.limits.diagnostics<1)fail('budget');
   const {place,snapshot,source,digest,signal}=context,reading=structuredClone(context.reading);
   if(!isSha256(snapshot)||rootLotSnapshot(ports.root)!==snapshot)fail('stale');
   const anchor=admissionAnchor(ports.root);
   const identity=readingIdentity({...reading,inputs:[...reading.inputs,['host/place',sha256(place)],['host/snapshot',snapshot],['host/anchor',sha256(JSON.stringify(anchor))],['host/draft',digest],['host/principal',sha256(ports.signer.keyId)],['host/operation',sha256(JSON.stringify(['root-lot',limits]))]]},sha256);
   const bytes=await readContent(source,digest,{read:ports.read,digestBytes:sha256},limits,signal);
   let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return fail('snapshot-format')}
   const records=text.endsWith('\n')?text.slice(0,-1).split('\n'):[];
   if(!records.length||records.length>limits.records)fail('budget');
   for(const line of records){const parsed=parse(line);if(parsed.kind!=='fact'||canonical(parsed.value.fields,parsed.value.version)!==line||!isConfig(line)||parsed.value.fields.by!=='target'||parsed.value.fields.epoch!==undefined||parsed.value.fields.sig!==undefined)fail('root-lot-format');}
   if(rootLotSnapshot(ports.root)!==snapshot)fail('stale');
   const code=await acceptRootRecords(ports.root,{records,keyId:ports.signer.keyId,signer:{name:ports.signer.name,sign:ports.signer.sign,signal},signal,storage:ports.storage,prepared:ports.prepared,committed:(identity,bundle,status)=>{committed={identity,bundle,status}}});
   if(code!==0&&!committed)return {kind:'refuse' as const,code:'host/act',diagnostics};
   const value={place,status:committed?.status??'already-held' as const,...(committed?{identity:committed.identity,act:verifiedLegacyActResult(ports.root,committed.identity).result}:{}),conformance:code===0?'complete' as const:'refused' as const,reading:identity};
   const result=sha256(JSON.stringify(value)+'\n');return {kind:'fact' as const,value:{...value,result,commitment:readingReceiptIdentity(identity,result,sha256)},diagnostics};
  }catch(error){
   if(error instanceof ActCommitUnknown)return {kind:'uncertain' as const,identity:error.identity,code:error.code,diagnostic:error.message,diagnostics};
   if(committed)return {kind:'fact' as const,value:{place:context.place,status:committed.status,identity:committed.identity,conformance:'incomplete' as const},diagnostic:error instanceof Error?error.message:'post-commit failure',diagnostics};
   return {kind:'refuse' as const,code:error instanceof BoundRefusal?error.code:'host/failed',diagnostic:error instanceof Error?error.message:'REFUSE·host/failed',diagnostics};
  }
 }));
}

/** Authenticated historical query only; never revives authority or signs. */
export function recoverRootActInProcess(identity:string,ports:Pick<RootLotPorts,'root'|'instrumentName'|'runtime'>){
 return withHostCall({instrumentName:ports.instrumentName,runtime:structuredClone(ports.runtime),output:()=>{}},()=>{
  try{if(!isSha256(identity))fail('context');const recovered=verifiedLegacyActResult(ports.root,identity);return {kind:'fact' as const,value:{historical:true as const,act:recovered.result,bundle:recovered.bundle}}}
  catch(error){return {kind:'refuse' as const,code:error instanceof BoundRefusal?error.code:'host/failed',diagnostic:error instanceof Error?error.message:'REFUSE·host/failed'}};
 });
}
