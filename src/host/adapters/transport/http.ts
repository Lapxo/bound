/** Receiver-selected location, budgets and cancellation; a carrier grants no origin permission. */
import{BoundRefusal}from'../../refusals.ts';
export class ContentUnavailable extends Error {}
export interface HTTPOptions{readonly signal?:AbortSignal;readonly allowedOrigins?:readonly string[]}
export async function fetchBytes(location:string,limits:{readonly timeoutMs:number;readonly responseBytes:number},options:HTTPOptions={}):Promise<Uint8Array>{
 if(options.signal?.aborted)throw new BoundRefusal('reference/cancelled','REFUSE·reference cancelled');
 const timeout=AbortSignal.timeout(limits.timeoutMs),signal=options.signal?AbortSignal.any([timeout,options.signal]):timeout;
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 const cancel=()=>{void reader?.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{
  const response=await fetch(location,{signal,redirect:'manual'});
  if(response.status>=300&&response.status<400)throw new BoundRefusal('reference/transport','REFUSE·transport redirect is not admitted');
  if(!response.ok)throw new ContentUnavailable(`HTTP ${response.status}`);
  reader=response.body?.getReader();if(!reader)return new Uint8Array();
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const part=await reader.read();if(signal.aborted)throw signal.reason;if(part.done)break;size+=part.value.length;if(size>limits.responseBytes){await reader.cancel();throw new BoundRefusal('host-port/budget','REFUSE·transport response exceeds declared byte bound');}chunks.push(part.value);}
  return Buffer.concat(chunks);
 }catch(error){
  if(signal.aborted)throw new BoundRefusal(options.signal?.aborted?'reference/cancelled':'host-port/timeout','REFUSE·reference transport interrupted');
  if(error instanceof TypeError)throw new ContentUnavailable(error.message);throw error;
 }finally{signal.removeEventListener('abort',cancel);reader?.releaseLock();}
}
