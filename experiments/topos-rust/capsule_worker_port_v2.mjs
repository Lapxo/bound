// Candidate closed-ESM batch executor. All selectors/resources are fixed by embedding.
import {evaluateWasm} from '../../dist/wasm/adapter.js';
import {digestModuleGraph} from './digest_module_graph.mjs';
import {validResponse} from './capsule_response.ts';
const enc=new TextEncoder(),dec=new TextDecoder('utf8',{fatal:true}),fail=code=>{throw Object.assign(Error(code),{code})},pin=s=>typeof s==='string'&&/^sha256:[a-f0-9]{64}$/.test(s),cancel=s=>{if(s?.aborted)fail('capsule-worker/cancelled')};
export function createCapsuleWorkerPort({selection,readArtifact,assets,bootstrap,contract,workerFactory,subtle=globalThis.crypto?.subtle}){
 const fixed=structuredClone(selection),held=structuredClone(assets),support={bootstrap:String(bootstrap),contract:String(contract)},b=fixed?.limits;
 if(!fixed||fixed.profile!=='bound-capsule-worker@1'||!pin(fixed.entry)||!pin(fixed.closure)||!Array.isArray(fixed.members)||!fixed.members.length||fixed.members.some(p=>!pin(p))||new Set(fixed.members).size!==fixed.members.length||!fixed.members.includes(fixed.entry)||typeof fixed.self!=='string'||!b||Object.keys(b).sort().join(',')!=='batch,codeBytes,executionMs,inputBytes,jobs,lifetimeMs,members,memoryBytes,outputBytes,stackBytes'||Object.values(b).some(n=>!Number.isSafeInteger(n)||n<1)||b.batch>64||b.inputBytes>65536||b.outputBytes>65536||typeof readArtifact!=='function'||typeof workerFactory!=='function'||typeof subtle?.digest!=='function')fail('capsule-worker/selection');
 for(const name of ['runtime','wasm','bootstrap','contract']){const a=fixed[name];if(!a||Object.keys(a).sort().join(',')!=='bytes,digest'||!pin(a.digest)||!Number.isSafeInteger(a.bytes)||a.bytes<1)fail('capsule-worker/selection')}
 const hash=async bytes=>'sha256:'+Array.from(new Uint8Array(await subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');let busy=false;
 async function closure(signal){cancel(signal);const pins=[...fixed.members].sort();if(pins.length>b.members||await hash(enc.encode(JSON.stringify(pins)))!==fixed.closure)fail('capsule-worker/closure-selection');
  const members=new Map();let bytes=0;for(const id of pins){cancel(signal);let raw;try{raw=await readArtifact(id,signal)}catch{cancel(signal);fail('capsule-worker/member-unavailable')}
   if(!(raw instanceof Uint8Array)||typeof SharedArrayBuffer!=='undefined'&&raw.buffer instanceof SharedArrayBuffer||raw.length>b.codeBytes-bytes)fail('capsule-worker/code-budget');raw=new Uint8Array(raw);bytes+=raw.length;if(await hash(raw)!==id)fail('capsule-worker/member-integrity');members.set(id.slice(7),{digest:id,source:(()=>{try{return dec.decode(raw)}catch{fail('capsule-worker/module-encoding')}})()})}
  try{digestModuleGraph(members,fixed.entry.slice(7))}catch{fail('capsule-worker/module-closure')}cancel(signal);return Object.fromEntries([...members].map(([id,m])=>['/capsule/'+id,m.source]));
 }
 async function assertCurrent(signal){await closure(signal);cancel(signal);for(const name of ['bootstrap','contract']){const bytes=enc.encode(support[name]);if(bytes.length!==fixed[name].bytes||await hash(bytes)!==fixed[name].digest)fail('capsule-worker/support-integrity')}
  for(const [name,descriptor]of [['runtime',fixed.runtime],['wasm',fixed.wasm]]){const raw=held[name];if(!(raw instanceof Uint8Array||raw instanceof ArrayBuffer)||typeof SharedArrayBuffer!=='undefined'&&(raw instanceof SharedArrayBuffer||ArrayBuffer.isView(raw)&&raw.buffer instanceof SharedArrayBuffer))fail('capsule-worker/asset-integrity');const bytes=raw instanceof Uint8Array?new Uint8Array(raw):new Uint8Array(raw.slice(0));if(bytes.length!==descriptor.bytes||await hash(bytes)!==descriptor.digest)fail('capsule-worker/asset-integrity')}cancel(signal);
 }
 return Object.freeze({descriptor:()=>structuredClone(fixed),assertCurrent,async run(input,{signal}={}){if(busy)fail('capsule-worker/busy');cancel(signal);if(!(input instanceof Uint8Array)||input.length>b.inputBytes||typeof SharedArrayBuffer!=='undefined'&&input.buffer instanceof SharedArrayBuffer)fail('capsule-worker/input-budget');
  let requests;try{requests=JSON.parse(dec.decode(new Uint8Array(input)))}catch{fail('capsule-worker/input')}
  if(!Array.isArray(requests)||requests.length>b.batch||requests.some(r=>!r||typeof r!=='object'||Array.isArray(r)||!['read','render'].includes(r.verb)))fail('capsule-worker/request');
  busy=true;try{const modules=await closure(signal),entry='/bound/capsule-batch.js',guestName='/bound/guest.js',contractName='/bound/capsule-contract.js';
   if(await hash(enc.encode(support.bootstrap))!==fixed.bootstrap.digest||enc.encode(support.bootstrap).length!==fixed.bootstrap.bytes||await hash(enc.encode(support.contract))!==fixed.contract.digest||enc.encode(support.contract).length!==fixed.contract.bytes)fail('capsule-worker/support-integrity');
   const source=`import ${JSON.stringify(guestName)};import{respond}from${JSON.stringify(contractName)};import*as loaded from${JSON.stringify('/capsule/'+fixed.entry.slice(7))};globalThis.__capsuleDone=false;(async()=>{try{const target=typeof loaded.load==='function'?await loaded.load():loaded;globalThis.result=respond(target,${JSON.stringify(JSON.stringify(requests))},${JSON.stringify(fixed.self)})}catch{globalThis.__capsuleFailure=true}finally{globalThis.__capsuleDone=true}})();`;
   modules[guestName]=support.bootstrap;modules[contractName]=support.contract;modules[entry]=source;
   const hashes={},sizes={};for(const [name,text]of Object.entries(modules)){const bytes=enc.encode(text);sizes[name]=bytes.length;hashes[name]=name===guestName?fixed.bootstrap.digest:name===contractName?fixed.contract.digest:name===entry?await hash(bytes):'sha256:'+name.slice('/capsule/'.length)}
   const limits={memoryBytes:b.memoryBytes,stackBytes:b.stackBytes,executionMs:b.executionMs},request={trusted:{runtime:fixed.runtime.digest,wasm:fixed.wasm.digest,modules:hashes,entry,aliases:{},limits,byteLengths:{runtime:fixed.runtime.bytes,wasm:fixed.wasm.bytes,modules:sizes}},assets:held,modules,entry,aliases:{},limits};
   let result;try{result=await evaluateWasm(request,{workerFactory:()=>workerFactory(Object.freeze({maxJobs:b.jobs})),lifetimeMs:b.lifetimeMs,signal})}catch{cancel(signal);fail('capsule-worker/execution-refused')}
   cancel(signal);if(enc.encode(result.output).length>b.outputBytes)fail('capsule-worker/output-budget');let responses;try{responses=JSON.parse(result.output)}catch{fail('capsule-worker/response')}
   if(!Array.isArray(responses)||responses.length!==requests.length||!responses.every((r,i)=>validResponse(r,requests[i])))fail('capsule-worker/response');
   const fresh=await closure(signal);if(JSON.stringify(fresh)!==JSON.stringify(Object.fromEntries(Object.entries(modules).filter(([n])=>n.startsWith('/capsule/')))))fail('capsule-worker/closure-moved');
   return Object.freeze(responses);
  }finally{busy=false}
 }});
}
