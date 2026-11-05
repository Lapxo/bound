// Node test embedding only. The runtime/session below have no Node imports.
import{parentPort,workerData}from'node:worker_threads';
const moduleURL=workerData.runtimeURL;
globalThis.process=undefined;globalThis.Buffer=undefined;globalThis.require=undefined;globalThis.fetch=undefined;
const {withWasmSession,capsuleResult}=await import(moduleURL);
parentPort.once('message',async request=>{try{const result=await withWasmSession(request,ctx=>capsuleResult(ctx,workerData.maxJobs));parentPort.postMessage({ok:true,result,ambient:{process:typeof process,Buffer:typeof Buffer,require:typeof require,fetch:typeof fetch}})}catch(error){parentPort.postMessage({ok:false,error:error.code??'capsule-worker/failed'})}});
