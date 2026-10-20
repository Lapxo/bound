import {encodeUTF8} from './encoding.ts';
import {invokeByteComputationPort} from './ports.ts';
import type {ByteComputationPort,DigestPort,PortLimits} from './ports.ts';
import {BoundRefusal} from '../host/refusals.ts';

export interface ConformanceReceiver {
 readonly suite:string;
 readonly implementation:string;
 readonly contract:string;
 readonly rules:readonly string[];
 readonly refusals:readonly string[];
}
export interface ConformanceCase {
 readonly id:string;
 readonly covers:readonly string[];
 readonly request:string;
 readonly expected:string;
}
export interface ConformanceSuite {
 readonly profile:'bound-conformance@1';
 readonly contract:string;
 readonly cases:readonly ConformanceCase[];
}
export interface ConformanceReport {
 readonly profile:'bound-conformance-report@1';
 readonly suite:string;
 readonly implementation:string;
 readonly contract:string;
 readonly met:boolean;
 readonly cases:readonly {readonly id:string;readonly met:boolean;readonly response:string}[];
 readonly commitment:string;
}
const fail=(code:string):never=>{throw new BoundRefusal('conformance/'+code,'REFUSE·conformance/'+code)};
const pin=(value:unknown)=>{if(typeof value!=='string'||!/^sha256:[a-f0-9]{64}$/.test(value))fail('context')};
const equal=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const unique=(names:readonly string[])=>Array.isArray(names)&&names.every(n=>typeof n==='string'&&n.length>0)&&new Set(names).size===names.length;
/** A pinned suite is data. Only the receiver chooses its contract, required
 * coverage and candidate; a candidate's own list cannot certify completeness. */
export async function runConformance(bytes:Uint8Array,receiver:ConformanceReceiver,ports:{readonly digest:DigestPort;readonly evaluate:ByteComputationPort},limits:PortLimits&{readonly maxCases:number},signal?:AbortSignal):Promise<ConformanceReport>{
 if(!(bytes instanceof Uint8Array)||!limits||!Number.isSafeInteger(limits.maxCases)||limits.maxCases<1||bytes.byteLength>limits.maxBytes)fail('budget');
 if(!receiver||typeof receiver!=='object')fail('context');
 let trusted:ConformanceReceiver;try{trusted=structuredClone(receiver)}catch{return fail('context')}
 for(const value of [trusted.suite,trusted.implementation,trusted.contract])pin(value);
 if(!unique(trusted.rules)||!unique(trusted.refusals))fail('coverage');
 const hash=async(input:Uint8Array)=>{const result=await ports.digest(new Uint8Array(input));pin(result);return result};
 const supplied=new Uint8Array(bytes);if(await hash(supplied)!==trusted.suite)fail('integrity');
 let suite:ConformanceSuite;try{suite=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(supplied))}catch{return fail('suite')}
 if(!suite||Object.keys(suite).sort().join(',')!=='cases,contract,profile'||suite.profile!=='bound-conformance@1'||suite.contract!==trusted.contract||!Array.isArray(suite.cases)||!suite.cases.length||suite.cases.length>limits.maxCases)fail('suite');
 const ids=new Set<string>(),coverage=new Set<string>(),required=[...trusted.rules.map(n=>'rule/'+n),...trusted.refusals.map(n=>'refusal/'+n)];
 for(const vector of suite.cases){
  if(!vector||Object.keys(vector).sort().join(',')!=='covers,expected,id,request'||typeof vector.id!=='string'||!vector.id||ids.has(vector.id)||!unique(vector.covers)||!vector.covers.length||typeof vector.request!=='string'||typeof vector.expected!=='string')fail('suite');
  ids.add(vector.id);let answer:unknown;try{answer=JSON.parse(vector.expected)}catch{return fail('suite')}
  if(!Array.isArray(answer)||answer.length!==2||!['fact','refuse'].includes(answer[0]))return fail('suite');
  for(const name of vector.covers){if(!required.includes(name))fail('coverage');if(name.startsWith('refusal/')&&(answer[0]!=='refuse'||answer[1]!==name.slice('refusal/'.length)))fail('coverage');coverage.add(name)}
 }
 if(required.some(name=>!coverage.has(name)))fail('coverage');
 const results:{id:string;met:boolean;response:string}[]=[];
 for(const vector of suite.cases){
  if(signal?.aborted)throw new BoundRefusal('host-port/cancelled','REFUSE·host-port/cancelled');
  let response:Uint8Array;
  try{response=await invokeByteComputationPort(encodeUTF8(vector.request),async(input,s)=>{
   try{return await ports.evaluate(input,s)}catch(error){if(error instanceof BoundRefusal)return encodeUTF8(JSON.stringify(['refuse',error.code])+'\n');throw error}
  },limits,signal)}catch(error){
   if(signal?.aborted||error instanceof BoundRefusal&&['host-port/cancelled','host-port/timeout','host-port/budget'].includes(error.code))throw error;
   response=encodeUTF8(JSON.stringify(['refuse',error instanceof BoundRefusal?error.code:'operation/failed'])+'\n');
  }
  results.push({id:vector.id,met:equal(response,encodeUTF8(vector.expected)),response:await hash(response)});
 }
 const report={profile:'bound-conformance-report@1' as const,suite:trusted.suite,implementation:trusted.implementation,contract:trusted.contract,met:results.every(row=>row.met),cases:results};
 return Object.freeze({...report,commitment:await hash(encodeUTF8(JSON.stringify(report)+'\n'))});
}
