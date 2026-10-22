import{createHash}from'node:crypto';
import{receiptProjection}from'@lapxo/topos/receipts';

// Only pure projection results live here. Callers still acquire current receipt
// bytes and perform all materialized-output and file-seal checks on every call.
const retained=new Map<string,{readonly value:ReturnType<typeof receiptProjection>;readonly bytes:number}>();
let bytes=0;
const LIMIT=16*1024*1024,ENTRIES=64;
export function projectedReceipts(...args:Parameters<typeof receiptProjection>):ReturnType<typeof receiptProjection>{
 const[observed,fields,hash,heads]=args;
 const stream=createHash('sha256').update(JSON.stringify([fields,heads,hash('')]));for(const line of observed)stream.update(':'+Buffer.byteLength(line)+':').update(line);const key=stream.digest('hex');
 const prior=retained.get(key);if(prior)return prior.value;
 const value=receiptProjection(...args),cost=Buffer.byteLength(JSON.stringify(value));
 const freeze=(data:unknown):void=>{if(data&&typeof data==='object'&&!Object.isFrozen(data)){for(const item of Object.values(data))freeze(item);Object.freeze(data)}};freeze(value);
 if(cost<=LIMIT){while(retained.size>=ENTRIES||bytes+cost>LIMIT){const first=retained.keys().next().value!;bytes-=retained.get(first)!.bytes;retained.delete(first)}retained.set(key,{value,bytes:cost});bytes+=cost;}
 return value;
}
