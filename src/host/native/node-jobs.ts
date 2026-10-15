import {sha256 as digest} from '../hash.ts';
/** Host-only controlled Node adapter; pure planning remains in planner.ts. */
import{realpathSync}from'node:fs';import{isAbsolute}from'node:path';import{readBoundedFile}from'./bounded-file.ts';
import type{CommandPort}from'@lapxo/topos/contract';
import type{Declaration}from'./loader.ts';
import{executeLot,type Invocation}from'./command.ts';
import{moduleClosure,type ModuleClosureSnapshot}from'./module-closure.ts';
import{planJobs,type Handoff,type Launch}from'./jobs.ts';
const refuse=(why:string):never=>{throw Error('REFUSE·job adapter '+why)};
const fileDigest=(path:string,limit:number):string=>{try{return digest(readBoundedFile(path,limit,path))}catch{return refuse('image member absent '+path)}};
export interface Location {member:string;path:string;kind:'binary'|'module'|'data'}
export interface NodeImage {cwd:string;condition:string;runtime:string;preload?:string;nativePreloadMembers:readonly string[];commandPort?:CommandPort;hostLoader?:{declaration:Declaration;entries:readonly string[];preload:string};locations:readonly Location[]}
/** Observation of a completed inner command. A nonzero exit is data, never
 * silently converted into effect success; its meaning belongs to the reader. */
export interface CapturedCommand {exitStatus:number;stdout:string;stderr:string}
const capturedCommand=(value:unknown):value is CapturedCommand=>{if(!value||typeof value!=='object'||Array.isArray(value))return false;const v=value as Record<string,unknown>;return Object.keys(v).sort().join(',')==='exitStatus,stderr,stdout'&&Number.isSafeInteger(v.exitStatus)&&(v.exitStatus as number)>=0&&typeof v.stdout==='string'&&typeof v.stderr==='string'};
export interface PreparedNodeImage {readonly identity:string}
const admittedImages=new WeakMap<PreparedNodeImage,Ready>();
interface Ready {handoff:Handoff;image:NodeImage;proofs:ReadonlyMap<string,string>;locations:ReadonlyMap<string,Location>;snapshot:ModuleClosureSnapshot}
/** Image/runtime condition and locations are instrument-admitted inputs, selected
 * before requests. Condition includes trusted Node builtins/platform libraries;
 * a binary's file digest alone does not seal every dynamic platform library. */
export function prepareNodeImage(input:Handoff,inputImage:NodeImage):PreparedNodeImage{
 if(!inputImage?.commandPort)refuse('missing admitted command port');
 if(!inputImage||!isAbsolute(inputImage.cwd)||!inputImage.condition)refuse('missing admitted Node image condition');
 const host:Handoff={...input,budget:{...input.budget},members:input.members.map(m=>({...m,bytes:new Uint8Array(m.bytes)})),loads:input.loads.map(e=>({...e,target:typeof e.target==='string'?e.target:{...e.target}})),bindings:input.bindings.map(b=>({...b,places:[...b.places],args:[...b.args],inputs:[...b.inputs],environment:b.environment.map(p=>[...p] as [string,string]),limits:{...b.limits}}))};
 // Validate all declarations and member bytes without any world proposal/launch.
 planJobs(host,new TextEncoder().encode('[]'),digest);
 const members=new Map(host.members.map(m=>[m.coordinate,m])),locations=new Map<string,Location>();
 let actualBytes=0;for(const member of host.members){actualBytes+=member.bytes.length;if(actualBytes>host.budget.bytes)refuse('image byte resources')}const runtimeLocation=inputImage.locations.find(l=>l.member===inputImage.runtime);if(!runtimeLocation||realpathSync(runtimeLocation.path)!==realpathSync(process.execPath))refuse('runtime differs from executing interpreter');
 for(const location of inputImage.locations){if(locations.has(location.member)||!members.has(location.member)||!isAbsolute(location.path)||!['binary','module','data'].includes(location.kind))refuse('unknown/duplicate image location '+location.member);if(fileDigest(location.path,host.budget.bytes)!==members.get(location.member)!.digest)refuse('image bytes differ '+location.member);locations.set(location.member,{...location})}
 if(locations.size!==members.size)refuse('image omitted handed member');
 const texts=new Map([...members].filter(([c])=>locations.get(c)!.kind==='module'||c.endsWith('.json')).map(([c,m])=>{let source:string;try{source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(m.bytes)}catch{return refuse('invalid text member '+c)}return[c,{source,digest:m.digest}] as const}));
 const snapshot:ModuleClosureSnapshot={identity:digest(new TextEncoder().encode(JSON.stringify([...members].map(([c,m])=>[c,m.digest]).sort())+'\n')),entry:'',members:texts};
 if(!inputImage.runtime||locations.get(inputImage.runtime)?.kind!=='binary')refuse('selected Node runtime absent');
 if(inputImage.preload!==undefined&&locations.get(inputImage.preload)?.kind!=='module')refuse('selected Node preloader absent');
 if(!Array.isArray(inputImage.nativePreloadMembers)||(inputImage.preload!==undefined&&!inputImage.nativePreloadMembers.includes(inputImage.preload))||new Set(inputImage.nativePreloadMembers).size!==inputImage.nativePreloadMembers.length||inputImage.nativePreloadMembers.some(c=>!members.has(c)))refuse('native preloader members not handed');
 const nativePreloadMembers=[...inputImage.nativePreloadMembers];
 const proofs=new Map<string,string>();
 for(const binding of host.bindings){if(locations.get(binding.program)?.kind!=='module'||binding.interpreter!==inputImage.runtime)refuse('unsupported raw binary profile '+binding.id);if(binding.kind==='process'&&binding.entry!==undefined)refuse('process entry unsupported '+binding.id);const roots=[binding.program,...(binding.entry?[binding.entry]:[])].filter(c=>locations.get(c)!.kind==='module');if(!roots.length&&locations.get(binding.program)!.kind!=='binary')refuse('unsupported program member '+binding.program);if(binding.interpreter&&locations.get(binding.interpreter)!.kind!=='binary')refuse('interpreter is not a selected binary');if(binding.kind==='worker'&&(!binding.entry||locations.get(binding.entry)!.kind!=='module'))refuse('worker entry is not a selected module');
 const reached=roots.flatMap(entry=>moduleClosure({...snapshot,entry},()=>undefined));
 const declaredTargets=new Set([inputImage.preload,binding.program,binding.interpreter,binding.entry,...binding.inputs,...host.loads.map(e=>typeof e.target==='string'?e.target:'')].filter(Boolean));
 for(const reading of reached)if(!declaredTargets.has(reading.coordinate))refuse('literal module dependency not declared '+reading.coordinate);
 proofs.set(binding.id,JSON.stringify(reached));
 }
 host.policy=digest(new TextEncoder().encode(JSON.stringify([host.policy,'captured-command/1',inputImage.condition,inputImage.runtime,inputImage.preload,nativePreloadMembers.map(c=>[c,members.get(c)!.digest]),snapshot.identity,inputImage.commandPort??null,[...proofs]])+'\n'));
 const handle=Object.freeze({identity:digest(new TextEncoder().encode(JSON.stringify([host.place,host.policy,snapshot.identity]))) });admittedImages.set(handle,{handoff:host,image:{cwd:inputImage.cwd,condition:inputImage.condition,runtime:inputImage.runtime,preload:inputImage.preload,nativePreloadMembers,...(inputImage.hostLoader?{hostLoader:inputImage.hostLoader}:{}),...(inputImage.commandPort?{commandPort:{...inputImage.commandPort,closure:[...inputImage.commandPort.closure],environment:[...inputImage.commandPort.environment]}}:{}),locations:[...locations.values()]},locations,proofs,snapshot});return handle;
}
/** Exact expectations from the same opaque host image used by execution. */
export function plannedJobs(handle:PreparedNodeImage,request:Uint8Array):readonly {id:string;identity:string}[]{const ready=admittedImages.get(handle);if(!ready)return refuse('unknown prepared host image');return planJobs(ready.handoff,request,digest).map(({id,identity})=>({id,identity}));}
/** Instrument-only producer lineage from the SAME private planned job used by
 * executeJobs. No fixture may invent an identity or reset shared custody. */
export interface ParentExecution {identity:string;port:string;binding:string;implementation:string;instrument:string;policy:string;authority:string;inputs:readonly (readonly[string,string])[];environment:readonly (readonly[string,string])[];argv:readonly string[];cwd:string;runtime:string;timeoutMs:number;responseBytes:number}
function parentExecution(ready:Ready,job:Launch):ParentExecution{const port=ready.image.commandPort;if(!port)return refuse('producer requires declared parent port');return{identity:job.identity,port:port.coordinate,binding:job.id,implementation:job.program[1],instrument:ready.handoff.instrument,policy:ready.handoff.policy,authority:ready.handoff.authoritySnapshot,inputs:job.edges.map(e=>[e.target,e.digest] as const).filter((p,i,all)=>all.findIndex(q=>q[0]===p[0])===i),environment:job.environment,argv:invocation(ready,job).args,cwd:ready.image.cwd,runtime:ready.locations.get(ready.image.runtime)!.path,timeoutMs:Math.min(port.timeoutMs,job.limits.timeMs),responseBytes:Math.min(port.responseBytes,job.limits.responseBytes)};}
export function plannedParentExecutions(handle:PreparedNodeImage,request:Uint8Array):readonly ParentExecution[]{const ready=admittedImages.get(handle);if(!ready)return refuse('unknown prepared host image');return planJobs(ready.handoff,request,digest).map(job=>parentExecution(ready,job));}
/** Root-owned execution resource, constructed from authenticated producer selection
 * under the authority guard. This is not a packet verifier or world callback. */
export interface RootJobCustody {open(parent:ParentExecution):Promise<{assertClosed():void;close():Promise<void>;descendant?:unknown}>}
const invocation=(ready:Ready,job:Launch):Invocation=>{
 const program=ready.locations.get(job.program[0])!,interpreter=job.interpreter&&ready.locations.get(job.interpreter[0]);
 if(!interpreter)return{command:program.path,args:[...job.args],cwd:ready.image.cwd};
 const host=ready.image.hostLoader;if(!host)return refuse('fixed loader envelope absent');
 const url=new URL(host.preload);url.searchParams.set('bytes',String(ready.handoff.budget.bytes));
 const envelope=Buffer.from(JSON.stringify({format:'native-image-envelope/1',entries:host.entries,declaration:host.declaration,execution:{runtime:ready.locations.get(ready.image.runtime)!.path,cwd:ready.image.cwd,mounts:ready.image.locations.map(location=>({coordinate:location.member,path:location.path,kind:location.kind}))}}));
 return{command:interpreter.path,args:['--import',url.href,...(ready.image.preload?['--import',ready.locations.get(ready.image.preload)!.path]:[]),program.path,...(job.kind==='worker'?[ready.locations.get(job.entry![0])!.path]:[]),...job.args],cwd:ready.image.cwd,hostEnvelope:envelope,envelopeBytes:ready.handoff.budget.bytes};
};
/** No partial member escapes a failed batch. Uses the existing bounded async
 * child-group executor; worker launcher is itself an exact selected module. */
export async function executeJobs(handle:PreparedNodeImage,request:Uint8Array,options:{phase:'act'|'selection'|'help'|'check'|'preview'|'sign';signal?:AbortSignal;trace?:(event:{id:string;phase:'start'|'end'})=>void;custody?:RootJobCustody}):Promise<readonly {id:string;identity:string;responses:readonly CapturedCommand[]}[]>{
 const ready=admittedImages.get(handle);if(!ready)return refuse('unknown prepared host image');const {phase,signal,trace}=options;if(phase!=='act')refuse('invocation forbidden during '+phase);if(signal?.aborted)refuse('interrupted before batch');
 const jobs=planJobs(ready.handoff,request,digest);
 // Complete batch and all locations are verified before invoking any program.
 for(const member of ready.handoff.members){const loc=ready.locations.get(member.coordinate)!;if(fileDigest(loc.path,ready.handoff.budget.bytes)!==member.digest)refuse('image bytes differ '+member.coordinate)}
 if(!jobs.length)return[];const slots=Math.min(...jobs.map(j=>j.limits.slots)),controller=new AbortController(),abort=controller.abort.bind(controller,undefined);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const results=new Array<{id:string;identity:string;responses:readonly CapturedCommand[]}>(jobs.length);let next=0;let primary:unknown;
 const work=async()=>{while(!controller.signal.aborted){const index=next++;if(index>=jobs.length)return;const job=jobs[index]!,fixed=invocation(ready,job),implementation=job.program[1],port={...ready.image.commandPort!,timeoutMs:Math.min(ready.image.commandPort!.timeoutMs,job.limits.timeMs),responseBytes:Math.min(ready.image.commandPort!.responseBytes,job.limits.responseBytes)};
 const proofFor=()=>{for(const edge of job.edges){const loc=ready.locations.get(edge.target);if(!loc||fileDigest(loc.path,ready.handoff.budget.bytes)!==edge.digest)return'unmeasured' as const}const roots=[job.program[0],...(job.entry?[job.entry[0]]:[])].filter(c=>ready.locations.get(c)!.kind==='module');const actual=JSON.stringify(roots.flatMap(entry=>moduleClosure({...ready.snapshot,entry},()=>undefined)));return actual===ready.proofs.get(job.id)?'verified' as const:'unmeasured' as const};
 trace?.({id:job.id,phase:'start'});let custody:Awaited<ReturnType<RootJobCustody['open']>>|undefined;try{if(options.custody)custody=await options.custody.open(parentExecution(ready,job));if(!custody)return refuse('native descendant custody missing '+job.id);const envelope=JSON.parse(Buffer.from(fixed.hostEnvelope!).toString('utf8'));envelope.descendant=custody.descendant;if(!envelope.descendant)return refuse('fixed descendant envelope absent '+job.id);const guarded={...fixed,hostEnvelope:Buffer.from(JSON.stringify(envelope))};const result=await executeLot({port,lot:{identity:job.identity,requests:[new TextDecoder().decode(job.payload)]},phase,signal:controller.signal,environment:Object.fromEntries(job.environment),host:{admitsDeclaration:p=>JSON.stringify(p)===JSON.stringify(port),covers:c=>c===port.coordinate&&ready.handoff.bindings.find(b=>b.id===job.id)!.places.includes(ready.handoff.place),verifies:d=>ready.handoff.members.some(m=>m.digest===d&&fileDigest(ready.locations.get(m.coordinate)!.path,ready.handoff.budget.bytes)===d),resolve:()=>guarded,loaderClosure:(_p,actual)=>JSON.stringify(actual)===JSON.stringify(guarded)?proofFor():'unmeasured'},accepts:(response:unknown,index)=>index===0&&capturedCommand(response)});custody?.assertClosed();results[index]={id:job.id,identity:job.identity,responses:result.members as readonly CapturedCommand[]}}catch(error){if(primary===undefined)primary=error;controller.abort();throw error}finally{await custody?.close();trace?.({id:job.id,phase:'end'})}}};
 try{const settled=await Promise.allSettled(Array.from({length:Math.min(slots,jobs.length)},work));if(primary!==undefined)throw primary;const failed=settled.find(x=>x.status==='rejected');if(failed?.status==='rejected')throw failed.reason;if(controller.signal.aborted||results.some(x=>x===undefined)||results.filter(Boolean).length!==jobs.length)refuse('interrupted/incomplete batch');return results}finally{signal?.removeEventListener('abort',abort)}
}
