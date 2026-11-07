import {workerData} from 'node:worker_threads';
import type {MessagePort} from 'node:worker_threads';
import type {Request} from '@lapxo/topos/contract';
import {dispatchCapsuleWithEvaluation} from './worker-capsule.ts';
import type {PublishedCapsuleSelection} from './worker-capsule.ts';
import {evaluateCapsuleWorkerRequest} from './capsule-worker-runtime.ts';

const {port,state,selection,archive,requests}=workerData as {
 port:MessagePort;state:SharedArrayBuffer;selection:PublishedCapsuleSelection;archive:Uint8Array;requests:readonly Request[];
};
try{
 const result=await dispatchCapsuleWithEvaluation(selection,archive,requests,
  (request,_lifetime,budget)=>evaluateCapsuleWorkerRequest(request,budget));
 port.postMessage({ok:true,result});
}catch(error){
 port.postMessage({ok:false,error:error instanceof Error?error.message:'capsule-worker/failed'});
}finally{
 const flag=new Int32Array(state);
 Atomics.store(flag,0,1);Atomics.notify(flag,0);
 port.close();
}
