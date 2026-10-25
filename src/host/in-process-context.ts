import {topos_wire_parse as parse,type topos_wire_Signer as Signer} from "../../vendor/library.js";
import {topos_contract_readingIdentity as readingIdentity,topos_contract_readingReceiptIdentity as readingReceiptIdentity} from "../../vendor/library.js";
import {readContent} from '../engine/ports.ts';
import type {ContentReadPort} from '../engine/ports.ts';
import {sha256} from './hash.ts';
import {BoundRefusal} from './refusals.ts';
import {refuseHost as fail,isPlaceLockCoordinate,placeRegionOf} from './host-controls.ts';
import type {RootStandingHostContext} from './in-process.ts';
import {publicStandingProjection,assertStandingView} from './standing-projection.ts';
import {rootClockSelectionOf,inspectPortablePlaceContexts} from './root-clock-source.ts';
import {projectContextualStanding,type ContextualStandingSnapshot} from './standing-carrier.ts';
import {authorityFor} from '../fold/signers.ts';
import {ownRecordAdmitted} from '../fold/signed.ts';
import {wordsOf} from '../fold/wire.ts';
import {fieldOf,isConfig} from '../fold/claims.ts';
import {signatureEraOf} from './signature-era.ts';

function authenticatedCarrier(snapshot:ContextualStandingSnapshot,anchor:Signer,records:number){
 if(!snapshot||Object.keys(snapshot).sort().join(',')!=='contexts,legacyPlaces,rootHistory'||!Array.isArray(snapshot.rootHistory)||!Array.isArray(snapshot.legacyPlaces)||!Array.isArray(snapshot.contexts))fail('snapshot-format');
 let count=snapshot.rootHistory.length;if(count>records)fail('budget');
 const validLine=(line:string)=>typeof line==='string'&&parse(line).kind==='fact';
 if(!snapshot.rootHistory.length||snapshot.rootHistory.some(l=>!validLine(l)))fail('snapshot-format');
 const root=publicStandingProjection(snapshot.rootHistory,anchor),families=wordsOf(root,'families');
 // Unsupported vocabulary resolution must not discover a provider in the CLI host.
 if(families.length&&!families.includes('view'))fail('vocabulary-unavailable');
 assertStandingView(root);
 const selection=rootClockSelectionOf(root,anchor),algorithms=signatureEraOf(root).admitted;
 if(snapshot.legacyPlaces.length>selection.resources.places||snapshot.contexts.length>selection.resources.acts)fail('budget');
 const signers=authorityFor(snapshot.rootHistory,anchor,algorithms).admitted;
 if(signers.some(s=>!s.coverage.includes('*'))&&!families.includes('region'))fail('vocabulary-unavailable');
 const names=new Set<string>();
 for(const place of snapshot.legacyPlaces){
  if(!place||!isPlaceLockCoordinate(place.place)||names.has(place.place)||!Array.isArray(place.history))fail('snapshot-format');names.add(place.place);
  count+=place.history.length;if(count>records)fail('budget');
  const path=placeRegionOf(place.place);
  if(place.history.some((l:string)=>!validLine(l)||!ownRecordAdmitted(l,path,'region',signers,algorithms)))fail('legacy-authority');
 }
 for(const row of snapshot.contexts){
  if(!row||!row.authority||!Array.isArray(row.authority.history))fail('snapshot-format');
  count+=row.authority.history.length;if(count>records)fail('budget');
  // Historical authority must belong to this exact Root history, not a second
  // signed Root fork silently substituted in the carrier.
  const epoch=fieldOf(row.authority.checkpoint,'epoch');
  const expected=snapshot.rootHistory.filter(l=>!isConfig(l)||Number(fieldOf(l,'epoch'))<=Number(epoch));
  if(JSON.stringify(expected)!==JSON.stringify(row.authority.history))fail('historical-snapshot');
 }
 const decoded=inspectPortablePlaceContexts(JSON.stringify(snapshot.contexts),anchor,selection);
 return projectContextualStanding(root,snapshot.legacyPlaces,snapshot.contexts,decoded);
}

/** Full contextual carrier, authenticated against receiver inputs only. It is a
 * data projection, not a current admission permit or a signed receipt. */
export async function readContextualStandingInProcess(context:RootStandingHostContext,ports:{readonly read:ContentReadPort}){
 try{
  const {place,source,snapshot,signal}=context,anchor=structuredClone(context.anchor),reading=structuredClone(context.reading),limits={...context.limits};
  if(!place||typeof place!=='string'||!source||typeof source!=='string'||!Number.isSafeInteger(limits.records)||limits.records<1)fail('context');
  const identity=readingIdentity({...reading,inputs:[...reading.inputs,['host/place',sha256(place)],['host/anchor',sha256(JSON.stringify(anchor))],['host/snapshot',snapshot]]},sha256);
  const bytes=await readContent(source,snapshot,{read:ports.read,digestBytes:sha256},limits,signal);
  let text:string,value:ContextualStandingSnapshot;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);value=JSON.parse(text)}catch{return fail('snapshot-format')}
  if(JSON.stringify(value)+'\n'!==text)fail('snapshot-format');
  if(signal?.aborted)fail('cancelled');
  const standing=authenticatedCarrier(value,anchor,limits.records),result=sha256(JSON.stringify(standing)+'\n');
  return {kind:'fact' as const,value:{place,standing,reading:identity,result,commitment:readingReceiptIdentity(identity,result,sha256)}};
 }catch(error){return {kind:'refuse' as const,code:error instanceof BoundRefusal?error.code:'host/failed',diagnostic:error instanceof Error?error.message:'REFUSE·host/failed'}};
}
