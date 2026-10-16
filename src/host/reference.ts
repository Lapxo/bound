/** Host composition. Location supplies bytes, never identity or authority. No store writes. */
import {createHash} from 'node:crypto';
import {readSemanticStanding,semanticStandingBytes} from '@lapxo/topos/core';
import {parse,transportSelection} from '@lapxo/topos/wire';
import {transportBytes} from './ports/transport.ts';
import {decodeReference,inspectReferenceBytes} from './reference-profile.ts';
export async function inspectReference(fragment:string,policy:readonly string[]) {
 const reference=decodeReference(fragment),scheme=new URL(reference.source).protocol.slice(0,-1);
 const fields=policy.flatMap(line=>{const got=parse(line);return got.kind==='fact'?[got.value.fields]:[]});
 const selected=transportSelection(fields,scheme);
 if(selected===undefined)throw Error(`REFUSE·transport ${scheme} no admitted content-request/1 policy`);
 let bytes: Uint8Array;
 try { bytes=await transportBytes(reference.source,reference.blob,policy); }
 catch(error) {
  const cause=error instanceof Error?error.message:'transport failed';
  if(cause.startsWith('REFUSE·'))throw error;
  throw Error(`REFUSE·transport ${scheme} ${cause}`);
 }
 return inspectReferenceBytes(reference,bytes,{maxBytes:selected.responseBytes,readSemanticStanding,semanticStandingBytes,digestBytes:value=>createHash('sha256').update(value).digest('hex')});
}
