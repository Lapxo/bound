import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {BoundRefusal} from './refusals.ts';
import {nativePlaceState} from './native-place-state.ts';
import {invokeSigningPort,type SigningPort} from '../engine/ports.ts';
import {verifyHostInstrument,type NativeHostInstrument} from './native-receiver.ts';

export interface NativeHostLimits {
 readonly requestBytes:number;readonly responseBytes:number;
 readonly timeoutMs:number;readonly heapMiB:number;readonly queuedRequests:number;
}
export interface NativeCommand {readonly verb:'fold'|'sign'|'land';readonly args:readonly string[];readonly signer?:string;readonly inputs?:readonly {readonly name:string;readonly text:string}[]}
export interface NativeCommandResult {readonly status:number;readonly stdout:string;readonly stderr:string}
export interface NativeHostOptions {
 readonly place:string;readonly instrument:NativeHostInstrument;readonly expectedInstrument:string;readonly limits:NativeHostLimits;
 readonly environment:Readonly<Record<string,string|undefined>>;
 readonly scratchParent?:string;
 readonly signer?:{readonly keyId:string;readonly name:string;readonly sign:SigningPort};
 readonly signers?:ReadonlyMap<string,{readonly name:string;readonly sign:SigningPort}>;
}
/** The consumer supplies the environment. Ambient preload/loader and libuv
 * controls cannot cross the fixed host boundary. Values are never logged. */
export function nativeHostEnvironment(input:Readonly<Record<string,string|undefined>>):Record<string,string>{
 return Object.fromEntries(Object.entries(input).filter((entry):entry is [string,string]=>entry[1]!==undefined&&!/^(NODE_|UV_)/.test(entry[0])));
}
const hosts=new Set<string>();
export interface NativeCommandHost {
 readonly pid:number;readonly environment:Readonly<Record<string,string>>;readonly flags:readonly string[];
 request(command:NativeCommand,signal?:AbortSignal):Promise<NativeCommandResult>;
 close():Promise<void>;
}
/** One consumer-owned native dispatcher, not a daemon or a second interpreter.
 * The child exits on IPC disconnect, including an ungraceful client exit. */
export async function startNativeHost(options:NativeHostOptions):Promise<NativeCommandHost>{
 verifyHostInstrument(options.instrument,options.expectedInstrument);
 const place=realpathSync(options.place),limits={...options.limits};
 nativePlaceState(place);
 const bindings=new Map(options.signers??[]);
 if(options.signer){if(bindings.has(options.signer.keyId))throw new BoundRefusal('host/context','REFUSE·host/context');bindings.set(options.signer.keyId,{name:options.signer.name,sign:options.signer.sign})}
 for(const[key,binding]of bindings)if(typeof key!=='string'||!key||typeof binding.name!=='string'||!binding.name||typeof binding.sign!=='function')throw new BoundRefusal('host/context','REFUSE·host/context');
 for(const n of Object.values(limits))if(!Number.isSafeInteger(n)||n<1)throw new BoundRefusal('host/budget','REFUSE·host/budget');
 if(limits.timeoutMs>2147483647||limits.heapMiB<16||limits.heapMiB>4096)throw new BoundRefusal('host/budget','REFUSE·host/budget');
 if(hosts.has(place))throw new BoundRefusal('host/busy','REFUSE·host/busy');hosts.add(place);
 const environment=Object.freeze(nativeHostEnvironment(options.environment)),flags=Object.freeze(['--max-old-space-size='+limits.heapMiB]);
 const scratch=mkdtempSync(join(options.scratchParent??tmpdir(),'bound-native-host-'));
 let child:ChildProcess;
 try{child=spawn(process.execPath,[...flags,options.instrument.runtime.entry],{cwd:place,env:environment,stdio:['ignore','pipe','pipe','ipc'],serialization:'advanced',shell:false})}catch(error){hosts.delete(place);rmSync(scratch,{recursive:true,force:true});throw error}
 let closed=false,sequence=0,queued=0,queuedBytes=0,tail:Promise<unknown>=Promise.resolve();
 let pending:{id:number;signer?:string;resolve:(v:NativeCommandResult)=>void;reject:(e:Error)=>void;abort:AbortController;dispose:()=>void}|undefined;
 let readyResolve:()=>void,readyReject:(error:Error)=>void;
 const ready=new Promise<void>((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
 let exitResolve:()=>void;const exited=new Promise<void>(resolve=>{exitResolve=resolve});
 const cleanup=()=>{closed=true;hosts.delete(place);rmSync(scratch,{recursive:true,force:true});pending?.abort.abort();pending?.dispose();pending?.reject(new BoundRefusal('host/closed','REFUSE·host/closed'));pending=undefined;exitResolve!()};
 child.once('error',error=>{readyReject!(error);cleanup()});
 child.once('exit',()=>{readyReject!(new BoundRefusal('host/closed','REFUSE·host/closed'));cleanup()});
 // Unexpected raw output is bounded and drained, never confused with a reply.
 let raw=0;const drain=(chunk:Buffer)=>{raw+=chunk.length;if(raw>limits.responseBytes)child.kill('SIGTERM')};child.stdout!.on('data',drain);child.stderr!.on('data',drain);
 child.on('message',async(message:any)=>{
  if(message?.kind==='ready'){readyResolve!();return}
  const current=pending;if(!current||message?.id!==current.id)return;
  if(message.kind==='sign'){
   try{if(message.lot?.keyId!==current.signer)throw new BoundRefusal('host/signer-mismatch','REFUSE·host/signer-mismatch');const binding=current.signer===undefined?undefined:bindings.get(current.signer);if(!binding)throw new BoundRefusal('host/unbound-signer','REFUSE·host/unbound-signer');const records=await invokeSigningPort(message.lot,binding.sign,{timeoutMs:limits.timeoutMs,maxBytes:limits.responseBytes},current.abort.signal);if(child.connected)child.send({kind:'signed',id:current.id,records})}
   catch(error){if(child.connected)child.send({kind:'signed',id:current.id,error:{code:error instanceof BoundRefusal?error.code:'host-port/failed'}})}return;
  }
  if(message.kind==='result'){
   current.dispose();pending=undefined;
   if(typeof message.stdout!=='string'||typeof message.stderr!=='string'||!Number.isSafeInteger(message.status)||Buffer.byteLength(message.stdout)+Buffer.byteLength(message.stderr)>limits.responseBytes){current.reject(new BoundRefusal('host/budget','REFUSE·host/budget'));return}
   current.resolve({status:message.status,stdout:message.stdout,stderr:message.stderr});
  }
 });
 const startup=setTimeout(()=>{readyReject!(new BoundRefusal('host/timeout','REFUSE·host/timeout'));child.kill('SIGTERM')},limits.timeoutMs);
 child.send({kind:'configure',place,scratch,limits,instrumentName:basename(options.instrument.runtime.root),instrumentRoot:options.instrument.runtime.root});
 try{await ready;verifyHostInstrument(options.instrument,options.expectedInstrument)}catch(error){child.kill('SIGTERM');await exited;throw error}finally{clearTimeout(startup)}
 return {
  pid:child.pid!,environment,flags,
  request(command,signal){
   // Snapshot offered data now; queueing cannot let the caller mutate a request.
   const encoded=JSON.stringify(command),bytes=Buffer.byteLength(encoded);
   if(queued>=limits.queuedRequests||queuedBytes+bytes>limits.requestBytes)return Promise.reject(new BoundRefusal('host/budget','REFUSE·host/budget'));
   const request=JSON.parse(encoded) as NativeCommand;queued++;queuedBytes+=bytes;
   const run=()=>new Promise<NativeCommandResult>((resolve,reject)=>{
    if(closed||!child.connected){reject(new BoundRefusal('host/closed','REFUSE·host/closed'));return}
    if(signal?.aborted){reject(new BoundRefusal('host/cancelled','REFUSE·host/cancelled'));return}
    const id=++sequence,abort=new AbortController();
    const cancel=()=>{abort.abort();if(child.connected)child.send({kind:'cancel',id})};
    const timer=setTimeout(cancel,limits.timeoutMs);signal?.addEventListener('abort',cancel,{once:true});
    const selected=request.signer,binding=selected===undefined?undefined:bindings.get(selected);
    pending={id,signer:selected,resolve,reject,abort,dispose:()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}};
    child.send({kind:'request',id,command:request,...(selected!==undefined||bindings.size?{signer:{keyId:selected??'',name:binding?.name??'',bound:!!binding}}:{})});
   });
   const result=tail.then(run).finally(()=>{queued--;queuedBytes-=bytes});tail=result.catch(()=>{});return result;
  },
  async close(){if(!closed){closed=true;pending?.abort.abort();if(child.connected)child.send({kind:'close'})}await exited;},
 };
}
