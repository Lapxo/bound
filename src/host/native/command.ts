import {spawn} from 'node:child_process';
import {channel} from 'node:diagnostics_channel';
import {isAbsolute} from 'node:path';
import {checkCommandPort,commandRequest,commandResponse} from '@lapxo/topos/contract';
import type {CommandPort,CommandLot} from '@lapxo/topos/contract';
import {requireEffects} from '../read-only.ts';
import {assertNativeRuntime} from './runtime.ts';
import {scheduleDeadline} from './deadline.ts';

const rejectedCommand=channel('bound.command.refusal');
type Phase='selection'|'help'|'check'|'preview'|'sign'|'act';
export interface Invocation {readonly command:string;readonly args:readonly string[];readonly cwd:string;readonly hostEnvelope?:Uint8Array;readonly envelopeBytes?:number}
export interface HostBoundary {
 readonly admitsDeclaration:(port:CommandPort)=>boolean;
 readonly covers:(coordinate:string)=>boolean;
 readonly verifies:(digest:string)=>boolean;
 /** Host chooses a verified invocation. A capsule cannot supply a program. */
 readonly resolve:(port:CommandPort)=>Invocation;
 /** Independent loader-closure proof, not a digest-list membership test. */
 readonly loaderClosure:(port:CommandPort,invocation:Invocation)=>'verified'|'unmeasured';
}
/** macOS prototype: bounded async invocation with POSIX child-group cancellation.
 * No acquisition or persistence on prospective paths; no partial success frames.
 * Host callbacks are trusted admission/verification operations, never signatures
 * or authority assertions supplied by the command's own output. */
export async function executeLot(options:{port:CommandPort;lot:CommandLot;host:HostBoundary;phase:Phase;environment:Readonly<Record<string,string>>;signal?:AbortSignal;accepts:(member:unknown,index:number)=>boolean}):Promise<{readonly members:readonly unknown[];readonly stderr:string;readonly invocations:1}>{
 const start=process.hrtime.bigint();
 const {host,signal,phase,accepts}=options;
 // Admitted semantic configuration is snapshotted for the whole invocation;
 // mutations of a caller's delivery object cannot alter checks mid-flight.
 const port=Object.freeze({...options.port,closure:Object.freeze([...options.port.closure]),environment:Object.freeze([...options.port.environment])});
 const lot=Object.freeze({...options.lot,requests:Object.freeze([...options.lot.requests])});
 const environment=Object.freeze({...options.environment});
 assertNativeRuntime(environment,[]);
 const refuse=(why:string):never=>{throw Error(`REFUSE·port ${port.coordinate} ${why}`);};
 if(phase!=='act')refuse('invocation forbidden during '+phase);
 requireEffects('command '+port.coordinate);
 if(signal?.aborted)refuse('interrupted before invocation');
 checkCommandPort(port,host);
 const deadline=start+BigInt(port.timeoutMs)*1_000_000n;
 const resolved=host.resolve(port),invocation=Object.freeze({...resolved,args:Object.freeze([...resolved.args])});
 if(!isAbsolute(invocation.command)||!isAbsolute(invocation.cwd))refuse('host invocation needs absolute coordinates');
 if(host.loaderClosure(port,invocation)!=='verified')refuse('runtime-loader closure unmeasured');
 const names=Object.keys(environment).sort(),declared=[...new Set(port.environment)].sort();
 if(names.length!==declared.length||names.some((name,index)=>name!==declared[index])||names.some(name=>typeof environment[name]!=='string'||environment[name]!.includes('\0')))refuse('environment differs from declared handoff');
 const frame=commandRequest(port,lot);
 const envelope=invocation.hostEnvelope;
 if(envelope&&(!Number.isSafeInteger(invocation.envelopeBytes)||invocation.envelopeBytes!<1||envelope.byteLength>invocation.envelopeBytes!))refuse('host envelope byte resources');
 if(process.hrtime.bigint()>=deadline)refuse('timeout before invocation');
 if(signal?.aborted)refuse('interrupted before invocation');
 const result=await new Promise<{status:number|null;interrupted:boolean;stdout:string;stderr:string}>((resolve,reject)=>{
  const child=spawn(invocation.command,[...invocation.args],{cwd:invocation.cwd,env:{...environment},shell:false,detached:false,stdio:envelope?['pipe','pipe','pipe','pipe']:['pipe','pipe','pipe']});
  const stdout:Buffer[]=[],stderr:Buffer[]=[];let bytes=0,why:string|undefined,done=false;
  const stop=(cause:string)=>{if(why)return;why=cause;try{child.kill('SIGKILL')}catch{}child.stdin!.destroy();if(envelope)child.stdio[3]?.destroy();};
  const cancelTimer=scheduleDeadline(deadline,()=>stop('timeout'));
  const abort=()=>stop('interrupted');signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  const collect=(target:Buffer[],chunk:Buffer,channel:string)=>{if(why)return;bytes+=chunk.length;if(bytes>port.responseBytes){stop('response-bytes exceeded');return;}if(channel==='stderr'&&port.stderr==='reject'){rejectedCommand.publish({coordinate:port.coordinate,stderr:chunk.subarray(0,Math.min(port.responseBytes,1024)).toString('utf8')});stop('stderr forbidden');return;}target.push(chunk);};
  child.stdout!.on('data',(chunk:Buffer)=>collect(stdout,chunk,'stdout'));child.stderr!.on('data',(chunk:Buffer)=>collect(stderr,chunk,'stderr'));
  child.stdin!.on('error',()=>stop('request handoff failed'));
  const finish=(status:number|null,error?:Error)=>{if(done)return;done=true;cancelTimer();signal?.removeEventListener('abort',abort);if(error||why){reject(Error(`REFUSE·port ${port.coordinate} ${why??error!.message}`));return;}resolve({status,interrupted:false,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')});};
  child.once('error',error=>finish(null,error));child.once('close',status=>finish(status));
  if(envelope){const pipe=child.stdio[3] as import('node:stream').Writable;const header=Buffer.alloc(8);header.writeBigUInt64BE(BigInt(envelope.byteLength));pipe.on('error',()=>stop('host envelope handoff failed'));pipe.end(Buffer.concat([header,Buffer.from(envelope)]));}
  child.stdin!.end(frame);
 });
 const members=commandResponse(port,lot,result,accepts);
 return {members,stderr:result.stderr,invocations:1};
}
