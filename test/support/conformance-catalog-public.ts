/** Opaque requests are receiver-owned cases. They invoke the actual exported
 * producers, never synthesize a refusal or trust a candidate's coverage list. */
export const additionalProducerCases=[
 ['e01','engine/input'],['e02','engine/context'],
 ['m01','computation/context'],['m02','computation/budget'],['m03','computation/signature'],
 ['s01','conformance/context'],['s02','conformance/budget'],['s03','conformance/coverage'],['s04','conformance/integrity'],['s05','conformance/suite'],
]as const;
export function additionalProducerAdapter(api:{objectFoldBytes:any;executeComputation:any;verifyComputation:any;runConformance:any},digest:(bytes:Uint8Array|string)=>string){
 const encode=(s:string)=>new TextEncoder().encode(s),contract=digest('receiver contract'),limits={timeoutMs:1000,maxBytes:65536,maxCases:1};
 const nested=encode(JSON.stringify({profile:'bound-conformance@1',contract,cases:[{id:'selected',covers:['rule/identity'],request:'opaque',expected:'["fact",null]\n'}]})+'\n'),receiver={suite:digest(nested),contract,implementation:digest('candidate'),rules:['identity'],refusals:[]};
 return async(input:Uint8Array)=>{
  const request=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input));if(!Array.isArray(request)||request.length!==2||request[0]!=='public-producer@1'||!additionalProducerCases.some(([id])=>id===request[1]))throw Error('Unknown receiver operation');
  const id=request[1],ports={digest,evaluate:async()=>encode('["fact",null]\n')};
  if(id==='e01')api.objectFoldBytes(encode('not-json'),{});
  else if(id==='e02')api.objectFoldBytes(encode('["bound-object-request@1",[{}]]'),{});
  else if(id==='m01')await api.executeComputation(null,encode('opaque'),ports,limits);
  else if(id==='m02')await api.executeComputation(null,encode('opaque'),ports,{...limits,maxBytes:1});
  else if(id==='m03')await api.verifyComputation(null,encode('opaque'),encode('opaque'),{},ports,limits);
  else if(id==='s01')await api.runConformance(nested,{...receiver,implementation:'not-a-digest'},ports,limits);
  else if(id==='s02')await api.runConformance(nested,receiver,ports,{...limits,maxCases:0});
  else if(id==='s03')await api.runConformance(nested,{...receiver,refusals:['missing/refusal']},ports,limits);
  else if(id==='s04')await api.runConformance(encode(new TextDecoder().decode(nested)+' '),receiver,ports,limits);
  else if(id==='s05'){const malformed=encode('{}');await api.runConformance(malformed,{...receiver,suite:digest(malformed)},ports,limits)}
  return encode('["fact",null]\n');
 };
}
export function additionalProducerSuite(contract:string){return{profile:'bound-conformance@1' as const,contract,cases:additionalProducerCases.map(([id,code])=>({id,covers:['refusal/'+code],request:JSON.stringify(['public-producer@1',id])+'\n',expected:JSON.stringify(['refuse',code])+'\n'}))};}
