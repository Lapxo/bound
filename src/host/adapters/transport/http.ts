/** Reference HTTP adapter. Location and budgets are already selected by admitted host policy. */
export async function fetchBytes(location:string,limits:{readonly timeoutMs:number;readonly responseBytes:number}):Promise<Uint8Array> {
 const signal=AbortSignal.timeout(limits.timeoutMs),response=await fetch(location,{signal});
 if(!response.ok)throw Error(`HTTP ${response.status}`);
 const reader=response.body?.getReader();if(!reader)return new Uint8Array();
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limits.responseBytes){await reader.cancel();throw Error('response exceeds declared byte bound');}chunks.push(part.value);}
 }finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}
