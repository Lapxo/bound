import {BoundRefusal} from './refusals.ts';
import {sha256} from './hash.ts';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {release} from 'node:os';
import {readingIdentityBytes} from '@lapxo/topos/contract';
import type {ReadingIdentityContext} from '@lapxo/topos/contract';

export type ReadingReference = readonly [string,string];
export interface ReadingExecution {
 readonly context:ReadingIdentityContext;
 readonly env:Readonly<Record<string,string>>;
 readonly cwd:string;
 readonly flags:readonly string[];
}
interface Boundary {readonly identity:string;readonly execution?:ReadingExecution}
const active=new AsyncLocalStorage<Boundary>();
export const readingBoundary=active.getStore.bind(active);
export function withReadingBoundary<T>(identity:string,execution:ReadingExecution|undefined,run:()=>T):T{
 if(execution){const algorithm=identity.split(':')[0]!;const hash=(text:string)=>algorithm+':'+createHash(algorithm).update(text).digest('hex');
  const expected=readingEnvironment(hash,execution.env,execution.cwd,execution.flags);
  const named=[...execution.context.environment].sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
  if(JSON.stringify([...expected].sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b))))!==JSON.stringify(named))throw Error('REFUSE·reading execution environment differs from its identity');
 }
 return active.run({identity,execution},run);
}

/** References commit the actual inherited boundary. Values are hashed, never
 * carried as environment secrets. No empty map is substituted for unknown input. */
// The running runtime is resolved once for this act; mutable input bytes are not
// stored in this slot. Later processes establish their own runtime reference.
const runtimes=new Map<string,string>();
const runtimeOf=(algorithm:string):string=>{const held=runtimes.get(algorithm);if(held)return held;const digest=algorithm+':'+createHash(algorithm).update(readFileSync(process.execPath)).digest('hex');runtimes.set(algorithm,digest);return digest;};
export function readingEnvironment(hash:(text:string)=>string,env:Readonly<Record<string,string|undefined>>=process.env,cwd=process.cwd(),flags:readonly string[]=process.execArgv):readonly ReadingReference[]{
 const inherited=Object.entries(env).filter((entry):entry is [string,string]=>entry[1]!==undefined);
 return [
  ['variables',hash(JSON.stringify(inherited.sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b)))))],
  ['cwd',hash(realpathSync(cwd))],['flags',hash(JSON.stringify(flags))],
  ['runtime',runtimeOf(hash('').split(':')[0]!)],
  ['platform',hash(JSON.stringify([process.platform,process.arch,process.versions,release()]))],
 ];
}

export function readingProfile(lines:readonly string[],field:(line:string,name:string)=>string):boolean{
 const values=(scope:string)=>lines.filter(line=>field(line,'scope')===scope&&field(line,'role')==='writes'&&field(line,'value')!=='withdraw');
 const contexts=values('wire/reading-context'),receipts=values('wire/reading-receipt');
 if(!contexts.length&&!receipts.length)return false;
 if(contexts.length!==1||receipts.length!==1||field(contexts[0]!,'value')!=='reading-context@1'||field(receipts[0]!,'value')!=='reading-receipt@1')throw Error('REFUSE·reading identity ambiguous or incomplete profiles');
 return true;
}

/** The caller supplies verified implementation and transitive references. This
 * constructor adds the process boundary that the host will actually hand over. */
export function readingExecution(input:{instrument:string;implementation:string;policy:string;inputs:readonly ReadingReference[]},hash:(text:string)=>string,boundary:{env:Readonly<Record<string,string|undefined>>;cwd:string;flags:readonly string[]}={env:process.env,cwd:process.cwd(),flags:process.execArgv}):ReadingExecution{
 const env=Object.fromEntries(Object.entries(boundary.env).filter((entry):entry is [string,string]=>entry[1]!==undefined));
 const cwd=boundary.cwd,flags=Object.freeze([...boundary.flags]);Object.freeze(env);
 const context={...input,environment:readingEnvironment(hash,env,cwd,flags)};
 readingIdentityBytes(context);
 return {context,env,cwd,flags};
}

interface Input {readonly value:unknown;readonly encoded:string;readonly digest:string;readonly cost:number;readonly read:()=>unknown;readonly identity:boolean}
interface Capture {readonly inputs:Map<string,Input>;readonly bytes:number;readonly files:number;used:number}
const viewInputs=new AsyncLocalStorage<Capture>();
const observedInputs=new AsyncLocalStorage<Map<string,Input>>();
const accessedInputs=new AsyncLocalStorage<Set<string>>();
// Only flat frozen string arrays have a reusable encoding. The callback still
// runs before lookup, so current byte readers decide whether a value is equal.
interface Encoding {readonly encoded:string;readonly digest:string;readonly cost:number}
const immutableEncodings=new WeakMap<readonly string[],Encoding>();
const stringEncodings=new Map<string,Encoding>();
let retainedEncodingBytes=0;
const STRING_ENCODING_LIMIT=16*1024*1024,STRING_ENCODING_ENTRIES=512;
function encoding(encoded:string):Encoding{return {encoded,digest:sha256(encoded),cost:Buffer.byteLength(encoded)}}
function encodeObserved(value:unknown):Encoding{
 if(typeof value==='string'){
  const held=stringEncodings.get(value);if(held)return held;
  const result=encoding(JSON.stringify(value)),cost=Buffer.byteLength(value)+result.cost;
  if(cost<=STRING_ENCODING_LIMIT){
   while(stringEncodings.size>=STRING_ENCODING_ENTRIES||retainedEncodingBytes+cost>STRING_ENCODING_LIMIT){const first=stringEncodings.keys().next().value!;retainedEncodingBytes-=Buffer.byteLength(first)+stringEncodings.get(first)!.cost;stringEncodings.delete(first)}
   stringEncodings.set(value,result);retainedEncodingBytes+=cost;
  }
  return result;
 }
 if(Array.isArray(value)&&Object.isFrozen(value)&&Object.getPrototypeOf(value)===Array.prototype&&(value as unknown as {readonly toJSON?:unknown}).toJSON===undefined){
  const held=immutableEncodings.get(value);if(held)return held;
  if(Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(field=>field&&'value'in field&&typeof field.value==='string')){const result=encoding(JSON.stringify(value));immutableEncodings.set(value,result);return result;}
 }
 return encoding(JSON.stringify(value)??'null');
}
const encodedInput=(read:()=>unknown):string=>encodeObserved(read()).encoded;
const verifyInput=(input:Input):void=>{
 const current=viewInputs.exit(()=>observedInputs.exit(()=>encodedInput(input.read)));
 if(current!==input.encoded)throw new BoundRefusal('reading-identity/context','REFUSE·reading-identity/context view inputs changed during preparation');
};
/** Reuse exact input bytes only inside one synchronous native observation.
 * Every source is freshly checked before any result can leave that observation. */
export function withViewInputObservation<T>(run:()=>T):T{
 if(observedInputs.getStore())return run();
 const inputs=new Map<string,Input>();
 return observedInputs.run(inputs,()=>{
  const value=run();
  if(value&&typeof (value as {then?:unknown}).then==='function')throw new BoundRefusal('reading-identity/context','REFUSE·reading-identity/context input observation must be synchronous');
  for(const input of inputs.values())verifyInput(input);
  return value;
 });
}
export const preparingView=():boolean=>viewInputs.getStore()!==undefined;
/** One immutable value per semantic source, scoped to a synchronous preparation. */
export function viewInput<T>(name:string,read:()=>T,identity=true):T{
 const capture=viewInputs.getStore();if(!capture)return read();
 accessedInputs.getStore()?.add(name);
 const prior=capture.inputs.get(name);if(prior)return prior.value as T;
 const observed=observedInputs.getStore(),held=observed?.get(name);
 const value=(held?held.value:read()) as T,serialized=held??encodeObserved(value);
 if(capture.inputs.size>=capture.files||(capture.used+=Buffer.byteLength(name)+serialized.cost)>capture.bytes)throw new BoundRefusal('reading-identity/budget','REFUSE·reading-identity/budget view inputs');
 const input={value,encoded:serialized.encoded,digest:serialized.digest,cost:serialized.cost,read,identity};capture.inputs.set(name,input);
 if(observed&&!held)observed.set(name,input);return value;
}
export function captureViewInputs<T>(limits:{bytes:number;files:number},run:()=>T):{value:T;inputs:readonly (readonly [string,string])[]}{
 const capture:Capture={inputs:new Map(),...limits,used:0};
 return viewInputs.run(capture,()=>{
  const value=run();
  // A native commit is checked independently by the caller. Mutable legacy
  // sources must still match the exact immutable values consumed here.
  if(!observedInputs.getStore())for(const input of capture.inputs.values())verifyInput(input);
  return {value,inputs:[...capture.inputs].filter(([,input])=>input.identity).map(([name,input])=>[name,input.digest] as const).sort(([a],[b])=>a<b?-1:a>b?1:0)};
 });
}

/** Reuse a computation only inside the caller's synchronous observation. Every
 * consuming view replays exactly its input membership through the same budget
 * checker. The enclosing observation still verifies every source before return.
 * The callback and its returned value are private to this one preparation. */
export function sharedViewInputs<T>(run:()=>T):()=>T{
 let held:{readonly value:T;readonly inputs:readonly (readonly [string,Input])[];readonly observation:Map<string,Input>}|undefined;
 return()=>{
  const capture=viewInputs.getStore(),observation=observedInputs.getStore();
  if(!capture||!observation)return run();
  if(held?.observation===observation){for(const[name,input]of held.inputs)viewInput(name,input.read,input.identity);return held.value;}
  const names=new Set<string>(),parent=accessedInputs.getStore();
  const value=accessedInputs.run(names,run);
  if(value&&typeof(value as {then?:unknown}).then==='function')throw new BoundRefusal('reading-identity/context','REFUSE·reading-identity/context shared preparation must be synchronous');
  for(const name of names)parent?.add(name);
  held={value,inputs:[...names].map(name=>[name,capture.inputs.get(name)!] as const),observation};return value;
 };
}
