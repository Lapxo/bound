import {AsyncLocalStorage} from 'node:async_hooks';
import {MessageChannel,receiveMessageOnPort,Worker} from 'node:worker_threads';
import type {Request,Response} from '@lapxo/topos/contract';
import type {PublishedCapsuleSelection} from './worker-capsule.ts';

export type CapsuleWorkerSelections=Readonly<Record<string,PublishedCapsuleSelection['limits']>>;
const policy=new AsyncLocalStorage<CapsuleWorkerSelections>();

/** Scope a synchronous native fold to receiver-selected portable archives. */
export function withSynchronousCapsuleWorkers<T>(selections:CapsuleWorkerSelections,run:()=>T):T{
 return policy.run(structuredClone(selections),run);
}
export const synchronousCapsuleWorkers=()=>policy.getStore();

/** Only pure capsule execution crosses this blocking bridge. Legacy callers
 * keep their synchronous exclusion and receipt order. */
export function dispatchCapsuleSynchronously(
 selection:PublishedCapsuleSelection,archive:Uint8Array,requests:readonly Request[],
):readonly Response[]{
 const {lifetimeMs,archiveBytes,inputBytes,batch}=selection.limits;
 if(![lifetimeMs,archiveBytes,inputBytes,batch].every(n=>Number.isSafeInteger(n)&&n>0)||lifetimeMs>2147483647||
  archive.byteLength>archiveBytes||requests.length>batch||Buffer.byteLength(JSON.stringify(requests))>inputBytes)
  throw Error('REFUSE·capsule-worker/budget');
 const {port1,port2}=new MessageChannel(),state=new SharedArrayBuffer(4),flag=new Int32Array(state);
 const deadline=performance.now()+lifetimeMs;
 let thread:Worker|undefined;
 try{
  thread=new Worker(new URL('./capsule-sync-entry.js',import.meta.url),{
   execArgv:[],env:{},transferList:[port2],workerData:{port:port2,state,selection,archive:Uint8Array.from(archive),requests},
  });
  thread.on('error',()=>{}); // A failed startup is bounded by the same deadline.
  const remaining=deadline-performance.now();
  if(remaining<=0||Atomics.wait(flag,0,0,remaining)==='timed-out'||performance.now()>deadline)
   throw Error('REFUSE·capsule-worker/lifetime');
  const reply=receiveMessageOnPort(port1)?.message;
  if(reply?.ok!==true||!Array.isArray(reply.result)||reply.result.length!==requests.length)
   throw Error(typeof reply?.error==='string'?reply.error:'REFUSE·capsule-worker/result');
  return reply.result;
 }finally{
  port1.close();port2.close();
  if(thread)void thread.terminate().catch(()=>{});
 }
}
