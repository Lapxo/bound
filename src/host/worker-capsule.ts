import {readStanding,capsuleOffers,capsuleDescriptor,assertCapsuleDescriptor,providerInputs} from '@lapxo/topos/standing';
import {parse,wireAt} from '@lapxo/topos/wire';
import {readContent} from '../engine/ports.ts';
import type {ContentReadPort,PortLimits} from '../engine/ports.ts';
import {capsuleEntry} from './capsule-selection.ts';
import {fullDigest} from './digest.ts';
import {readFileSync} from 'node:fs';
import type {Request,Response} from '@lapxo/topos/contract';
import type {WasmLimits,WasmRequest,WasmResult} from '../wasm/adapter.ts';
import {moduleSnapshot,moduleClosures} from './native/module-closure.ts';
import {Worker} from 'node:worker_threads';
import {evaluateWasm} from '../wasm/adapter.ts';
import {validResponse} from './capsule-response.ts';
import {sha256} from './hash.ts';
import {refuseBound as refuse} from './refusals.ts';

export interface PublishedCapsuleSelection {
 readonly digest:string;
 readonly entry:string;
 readonly descriptor?:readonly string[];
 readonly limits:WasmLimits & {
  readonly lifetimeMs:number;
  readonly archiveBytes:number;
  readonly expandedBytes:number;
  readonly members:number;
  readonly moduleBytes:number;
  readonly batch:number;
  readonly inputBytes:number;
  readonly outputBytes:number;
  readonly hostBytes:number;
  readonly hostCalls:number;
 };
}

const runtime='sha256:78daa39ad957affb2423846cf0e6754c4ed9e729829db84e58b25b3b241336e7';
const wasm='sha256:105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232';
const guest='sha256:4a8cef02c4027ca2bd35aa2810f3c56ddd9884e8f245ede48d01f020f70e00f3';
const contract='sha256:4d782bc2f3cf6d20f195a8a89161e2b1356840851d964a34c61b9b0375e2bce6';
const asset=(name:string)=>readFileSync(new URL('../../assets/wasm/'+name,import.meta.url));

/** Executes an exact archive selected by the receiver. The archive and the
 * request can neither choose host permissions nor install a provider. */
export async function dispatchPublishedCapsuleInWorker(
 selection:PublishedCapsuleSelection, archive:Uint8Array, requests:readonly Request[], signal?:AbortSignal,
):Promise<readonly Response[]> {
 return dispatchCapsuleWithEvaluation(selection,archive,requests,(request,lifetimeMs,budget)=>evaluateWasm(request,{
  lifetimeMs,signal,workerFactory:()=>new Worker(new URL('./capsule-worker.js',import.meta.url),{
   execArgv:[],env:{},workerData:budget,
  }),
 }),signal);
}

/** Shared archive, guest and response preparation for both Worker entry points. */
export async function dispatchCapsuleWithEvaluation(
 selection:PublishedCapsuleSelection,archive:Uint8Array,requests:readonly Request[],
 evaluate:(request:WasmRequest,lifetimeMs:number,budget:{bytes:number;calls:number})=>Promise<WasmResult>,
 signal?:AbortSignal,
):Promise<readonly Response[]> {
 const {digest,entry,descriptor,limits:b}=structuredClone(selection);
 if(signal?.aborted)refuse('capsule-worker/cancelled');
 const caps=[b.archiveBytes,b.expandedBytes,b.members,b.moduleBytes,b.batch,b.inputBytes,b.outputBytes,
  b.hostBytes,b.hostCalls,b.lifetimeMs,b.memoryBytes,b.stackBytes,b.executionMs];
 if(caps.some(n=>!Number.isSafeInteger(n)||n<1)||b.lifetimeMs>2147483647)refuse('capsule-worker/budget');
 if(!(archive instanceof Uint8Array)||!(archive.buffer instanceof ArrayBuffer)||
  archive.byteLength>b.archiveBytes)refuse('capsule-worker/archive-budget');
 if(!Array.isArray(requests)||requests.length>b.batch||
  requests.some(r=>!r||!['render','read'].includes(r.verb)||!Array.isArray(r.files)))refuse('capsule-worker/request');
 const text=JSON.stringify(requests);
 if(Buffer.byteLength(text)>b.inputBytes)refuse('capsule-worker/input-budget');
 const held:Request[]=JSON.parse(text);
 if(held.some(r=>r.provider&&r.provider.artifact!==digest))refuse('capsule-worker/provider-artifact');
 const start=performance.now();
 const snapshot=moduleSnapshot(Uint8Array.from(archive),digest,entry,b.expandedBytes);
 if(descriptor){
  if(snapshot.capsule===undefined)return refuse('capsule-worker/descriptor');
  assertCapsuleDescriptor(descriptor,new TextDecoder('utf-8',{fatal:true}).decode(snapshot.capsule).trimEnd().split('\n'));
 }
 const closure=moduleClosures([snapshot],()=>undefined,{members:b.members,bytes:b.moduleBytes,portableESM:true,portableBuiltins:new Set(['node:crypto']),signal});
 const modules:Record<string,string>=Object.create(null),hashes:Record<string,string>=Object.create(null),sizes:Record<string,number>=Object.create(null);
 const add=(name:string,source:string,pin:string)=>{modules[name]=source;hashes[name]=pin;sizes[name]=Buffer.byteLength(source)};
 for(const one of closure){
  if(!one.coordinate.endsWith('.js'))refuse('capsule-worker/module-kind');
  add('/capsule/'+one.coordinate,snapshot.members.get(one.coordinate)!.source,one.digest);
 }
 const boot='/bound/guest.js',respond='/bound/capsule-contract.js',batch='/bound/dispatch.js';
 add(boot,asset('guest.js').toString('utf8'),guest);
 add(respond,asset('capsule-contract.js').toString('utf8'),contract);
 const source=`import ${JSON.stringify(boot)};import '/bound/sha256.js';import{respond}from${JSON.stringify(respond)};import*as target from${JSON.stringify('/capsule/'+entry)};globalThis.result=respond(target,${JSON.stringify(text)},${JSON.stringify(entry)});`;
 add(batch,source,sha256(source));
 const crypto='/bound/sha256.js';
 const shim=`const sha=globalThis.__boundSha256,url=globalThis.__boundUrlOrigin;
 delete globalThis.__boundSha256;delete globalThis.__boundUrlOrigin;
 globalThis.URL=class URL{static canParse(text){return JSON.parse(url(text))!==null}
 constructor(text){const origin=JSON.parse(url(text));if(origin===null)throw TypeError('Invalid URL');this.origin=origin}};
 export function createHash(name){if(name!=='sha256')throw Error('hash algorithm');let input;
 return {update(value){if(input!==undefined||!(typeof value==='string'||value instanceof Uint8Array))throw Error('hash input');
 input=typeof value==='string'?value:Array.from(value);return this},
 digest(format){if(format!=='hex'||input===undefined)throw Error('hash format');return sha(JSON.stringify(input))}}}`;
 add(crypto,shim,sha256(shim));
 const aliases={'node:crypto':crypto};
 const limits={memoryBytes:b.memoryBytes,stackBytes:b.stackBytes,executionMs:b.executionMs};
 const lifetimeMs=Math.floor(b.lifetimeMs-(performance.now()-start));
 if(lifetimeMs<1)refuse('capsule-worker/lifetime');
 const {output}=await evaluate({
  trusted:{runtime,wasm,modules:hashes,entry:batch,aliases,limits,
   byteLengths:{runtime:51308,wasm:503134,modules:sizes}},
  assets:{runtime:asset('runtime.js'),wasm:asset('runtime.wasm')},modules,entry:batch,aliases,limits,
 },lifetimeMs,{bytes:b.hostBytes,calls:b.hostCalls});
 if(Buffer.byteLength(output)>b.outputBytes)refuse('capsule-worker/output-budget');
 const result:unknown=JSON.parse(output);
 if(!Array.isArray(result)||result.length!==held.length||!result.every((one,i)=>validResponse(one,held[i]!)))refuse('capsule-worker/response');
 return result;
}


export interface SelectedWorkerCapsuleContext {
 readonly standing:string;
 readonly offer:string;
 readonly host:readonly string[];
 readonly instrument:readonly string[];
 readonly standingSource:string;
 readonly archiveSource:string;
 readonly standingLimits:PortLimits;
 readonly limits:PublishedCapsuleSelection['limits'];
}

/** The receiver supplies its authenticated host projection, instrument and
 * selected standing pin. Offered content cannot add a dep or change that pin. */
export async function dispatchSelectedCapsuleInWorker(
 context:SelectedWorkerCapsuleContext,
 requests:readonly Request[],
 ports:{readonly read:ContentReadPort},
 signal?:AbortSignal,
):Promise<readonly Response[]>{
 const held=structuredClone(context);
 if(!Array.isArray(requests)||requests.length>held.limits.batch)refuse('capsule-worker/request');
 // Discard caller provider inputs before retaining the batch across host reads.
 const offered=JSON.stringify(requests.map(({provider:ignored,...asked}:Request)=>asked));
 if(Buffer.byteLength(offered)>held.limits.inputBytes)refuse('capsule-worker/input-budget');
 const batch:Request[]=JSON.parse(offered);
 const bytes=await readContent(held.standingSource,held.standing,{read:ports.read,digestBytes:sha256},held.standingLimits,signal);
 const topos=readStanding(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 const offers=capsuleOffers(topos).filter(one=>one.scope===held.offer);
 const digest=offers[0]?.value;
 if(offers.length!==1||!digest)return refuse('capsule-worker/offer');
 const entry=capsuleEntry(held.host,held.standing,digest);
 const fields=held.instrument.flatMap(line=>{const p=parse(line);return p.kind==='fact'?[p.value.fields]:[]});
 const wire=wireAt(fields,Number.MAX_SAFE_INTEGER),algorithm=wire&&[...wire.digests][0];
 if(!algorithm||!wire.digests.has('sha256'))return refuse('capsule-worker/digest-selection');
 const projected=batch.map(asked=>{
  const provider=providerInputs(topos,held.standing,held.offer,digest,asked.region??'',text=>fullDigest(text,algorithm));
  return provider?{...asked,provider}:asked;
 });
 const archive=await readContent(held.archiveSource,digest,{read:ports.read,digestBytes:sha256},
  {timeoutMs:held.limits.lifetimeMs,maxBytes:held.limits.archiveBytes},signal);
 return dispatchPublishedCapsuleInWorker({digest,entry,descriptor:capsuleDescriptor(topos,held.offer)?.lines,limits:held.limits},archive,projected,signal);
}
