/** Host composition. Location supplies bytes, never identity or authority. No store writes. */
import {createHash} from 'node:crypto';
import {topos_core_readSemanticStanding as readSemanticStanding,topos_core_semanticStandingBytes as semanticStandingBytes} from "../../vendor/library.js";
import {topos_wire_parse as parse,topos_wire_transportSelection as transportSelection} from "../../vendor/library.js";
import {topos_contract_decodeLocatedReference as decodeLocatedReference,topos_contract_locatedReferenceIdentity as locatedReferenceIdentity,topos_contract_inspectLocatedReference as inspectLocatedReference} from "../../vendor/library.js";
import {ContentUnavailable,type HTTPOptions} from './adapters/transport/http.ts';
import {topos_contract_decodeReferenceProjection as decodeReferenceProjection,topos_contract_inspectReferenceProjection as inspectReferenceProjection,type topos_contract_RecordBudget as RecordBudget} from "../../vendor/library.js";
import {BoundRefusal} from './refusals.ts';
import {transportBytes} from './ports/transport.ts';
import {decodeReference,inspectReferenceBytes} from './reference-profile.ts';
export async function inspectReference(fragment:string,policy:readonly string[],options:HTTPOptions={}) {
 if(fragment.startsWith('#topos-reference:')){
  let reference;
  try{reference=decodeLocatedReference(fragment)}catch(error){throw new BoundRefusal('reference/format',String(error))}
  const identity=locatedReferenceIdentity(reference);
  const needs=()=>({kind:'needs' as const,reference,identity,needs:'needs/bytes/'+reference.blob,authentication:'not demonstrated; inspect only' as const});
  if(!reference.location||reference['location-class']==='viewer')return needs();
  const scheme=new URL(reference.location).protocol.slice(0,-1),fields=policy.flatMap(line=>{const got=parse(line);return got.kind==='fact'?[got.value.fields]:[]}),selected=transportSelection(fields,scheme);
  if(!selected)throw new BoundRefusal('reference/transport',`REFUSE·transport ${scheme} no admitted content-request/1 policy`);
  let bytes:Uint8Array;
  try{bytes=await transportBytes(reference.location,reference.blob,policy,options)}catch(error){if(error instanceof ContentUnavailable)return needs();throw error}
  try{return {...inspectLocatedReference(reference,bytes,{maxBytes:selected.responseBytes,digestBytes:value=>createHash('sha256').update(value).digest('hex')}),reference,authentication:'not demonstrated; inspect only' as const}}catch(error){throw new BoundRefusal('reference/format',String(error))}
 }
 const reference=decodeReference(fragment),scheme=new URL(reference.source).protocol.slice(0,-1);
 const fields=policy.flatMap(line=>{const got=parse(line);return got.kind==='fact'?[got.value.fields]:[]});
 const selected=transportSelection(fields,scheme);
 if(selected===undefined)throw new BoundRefusal('reference/transport',`REFUSE·transport ${scheme} no admitted content-request/1 policy`);
 let bytes: Uint8Array;
 try { bytes=await transportBytes(reference.source,reference.blob,policy,options); }
 catch(error) {
  const cause=error instanceof Error?error.message:'transport failed';
  if(cause.startsWith('REFUSE·'))throw error;
  throw Error(`REFUSE·transport ${scheme} ${cause}`);
 }
 return inspectReferenceBytes(reference,bytes,{maxBytes:selected.responseBytes,readSemanticStanding,semanticStandingBytes,digestBytes:value=>createHash('sha256').update(value).digest('hex')});
}

/** A declared preview is inspected independently of content and authority; never fetched or substituted. */
export function inspectReferencePreview(line:string,budget:RecordBudget,maxInlineBytes:number){
 try{return inspectReferenceProjection(decodeReferenceProjection(line,budget,maxInlineBytes),bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex'),budget,maxInlineBytes);}
 catch(error){throw new BoundRefusal('reference/format',String(error));}
}
