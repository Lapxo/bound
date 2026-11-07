import {parentPort} from 'node:worker_threads';
import {rootDraftRecords} from './admission-draft.ts';
import {inspectWithRustPort,publishWithRustPort,reconfirmWithRustPort} from './act-rust-ports.ts';
import type {WorkerAdmissionContext} from './act-rust-ports.ts';
import {BoundRefusal} from './refusals.ts';

export type ActWorkerRequest=
 | {readonly operation:'draft';readonly bytes:Uint8Array;readonly records:number}
 | {readonly operation:'inspect';readonly context:WorkerAdmissionContext;readonly query:'authority'|'verify';readonly long:boolean}
 | {readonly operation:'publish'|'reconfirm';readonly committed:string;readonly files:Readonly<Record<string,string>>};

const port=parentPort;
if(!port)throw Error('act-worker/port');
port.once('message',async(request:ActWorkerRequest)=>{
 try{
  const value=request.operation==='draft'
   ? {records:rootDraftRecords(request.bytes,request.records)}
   : request.operation==='inspect'
    ? {inspection:await inspectWithRustPort(request.context,request.query,request.long)}
    : request.operation==='reconfirm'
     ? (await reconfirmWithRustPort(request.committed,request.files),{reconfirmed:true})
     : (await publishWithRustPort(request.committed,request.files),{published:true});
  port.postMessage({ok:true,result:new TextEncoder().encode(JSON.stringify(value))});
 }catch(error){
  port.postMessage({ok:true,result:new TextEncoder().encode(JSON.stringify({
   code:error instanceof BoundRefusal?error.code:'host/failed',
   diagnostic:error instanceof Error?error.message:'REFUSE·host/failed',
  }))});
 }
});
