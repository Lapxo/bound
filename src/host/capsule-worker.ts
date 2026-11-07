import {parentPort,workerData} from 'node:worker_threads';
import {evaluateCapsuleWorkerRequest} from './capsule-worker-runtime.ts';
import type {WasmRequest} from '../wasm/adapter.ts';

const port=parentPort;
if(!port)throw Error('capsule-worker/port');
port.once('message',async(request:WasmRequest)=>{
 try{port.postMessage({ok:true,result:await evaluateCapsuleWorkerRequest(request,workerData)})}
 catch(error){port.postMessage({ok:false,error:error instanceof Error?error.message:'capsule-worker/failed'})}
});
