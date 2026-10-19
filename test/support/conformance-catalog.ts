/** Receiver-owned test adapter. Requests contain opaque operation IDs, never
 * local paths, keys or a candidate-selected verifier. All refusals come from
 * actual exported operations. This is a focused suite, not all-catalog proof. */
export const catalogProducerCases = [
 ['c01','catalog/invalid'],['c02','reference/format'],['c03','authenticated-reference/context'],
 ['p01','host-port/budget'],['p02','host-port/cancelled'],
 ['p03','host-port/timeout'],['p04','host-port/failed'],
 ['p05','host-port/integrity'],['p06','host-port/response'],
] as const;
export interface CatalogProducerAPI {
 readRefusalCatalog:(text:string)=>unknown;
 decodeReference:(text:string)=>unknown;
 inspectAuthenticatedReference:(text:string,trust:any)=>Promise<unknown>;
 readContent:(source:string,digest:string,ports:any,limits:any,signal?:AbortSignal)=>Promise<Uint8Array>;
}
export function catalogProducerAdapter(api:CatalogProducerAPI,digest:(b:Uint8Array)=>string){
 return async(input:Uint8Array):Promise<Uint8Array>=>{
  const request=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input));
  if(!Array.isArray(request)||request.length!==2||request[0]!=='catalog-producer@1'||!catalogProducerCases.some(([id])=>id===request[1]))throw Error('Unknown receiver operation');
  const id=request[1],content=new TextEncoder().encode('owned-content'),pin=digest(content),limits={maxBytes:64,timeoutMs:50};
  if(id==='c01')api.readRefusalCatalog('malformed');
  else if(id==='c02')api.decodeReference('#unsupported');
  else if(id==='c03')await api.inspectAuthenticatedReference('#unsupported',{signers:[{id:'duplicate'},{id:'duplicate'}]});
  else{
   const controller=new AbortController();if(id==='p02')controller.abort();
   const read=async()=>{
    if(id==='p03')return new Promise<Uint8Array>(()=>{});
    if(id==='p04')throw Error('receiver content unavailable');
    if(id==='p06')return new Uint8Array(new SharedArrayBuffer(1));
    return content;
   };
   await api.readContent('fixture:opaque-content',id==='p05'?'sha256:'+'0'.repeat(64):pin,{read,digestBytes:digest},id==='p01'?{...limits,maxBytes:1}:limits,controller.signal);
  }
  return new TextEncoder().encode('["fact",null]\n');
 };
}
export function catalogProducerSuite(contract:string){return{
 profile:'bound-conformance@1' as const,contract,cases:catalogProducerCases.map(([id,code])=>({id,covers:['refusal/'+code],request:JSON.stringify(['catalog-producer@1',id])+'\n',expected:JSON.stringify(['refuse',code])+'\n'})),
};}
