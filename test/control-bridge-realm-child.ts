import {parentPort,workerData,isMainThread}from'node:worker_threads';import{spawnSync}from'node:child_process';import{createFixedControlBridge}from'../src/host/native/control-bridge.ts';
let refusal='';try{createFixedControlBridge({...workerData.binding,workerBytes:Buffer.from(workerData.workerBytes,'base64')});}catch(error){refusal=String(error);}
const f=workerData.frame,endpoint=workerData.binding.endpoint;
const result=spawnSync(process.execPath,[new URL('../src/cli/custodian.ts',import.meta.url).pathname,String(endpoint.responseBytes)],{input:JSON.stringify({endpoint,frame:f}),encoding:'utf8',timeout:endpoint.timeoutMs,maxBuffer:endpoint.responseBytes,shell:false});
parentPort!.postMessage({isMainThread,refusal,status:result.status,stderr:result.stderr,reply:result.stdout});
