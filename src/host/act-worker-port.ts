import {historyLimit} from '../wasm/rust-core.ts';
import type {WorkerAdmissionContext} from './act-rust-ports.ts';
import {runBoundByteWorker} from './worker-host.ts';
import type {BoundWorkerOptions} from './worker-host.ts';
import type {ActWorkerRequest} from './act-worker.ts';
import {BoundRefusal} from './refusals.ts';

async function invoke(request:ActWorkerRequest,options:BoundWorkerOptions){
 const bytes=await runBoundByteWorker(new URL('./act-worker.js',import.meta.url),request,options,request.operation==='publish');
 const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(typeof result.code==='string')throw new BoundRefusal(result.code,result.diagnostic);
 return result;
}
export async function prepareRootDraftInWorker(bytes:Uint8Array,records:number,options:BoundWorkerOptions):Promise<readonly string[]>{
 const result=await invoke({operation:'draft',bytes:Uint8Array.from(bytes),records},options);
 if(!Array.isArray(result.records)||result.records.some((line:unknown)=>typeof line!=='string'))throw Error('act-worker/draft');
 return result.records;
}
export async function publishBundleInWorker(committed:string,files:Readonly<Record<string,string>>,lifetimeMs:number):Promise<void>{
 // Once dispatched, cancellation is resolved as a publication result or uncertainty.
 const result=await invoke({operation:'publish',committed,files},{lifetimeMs});
 if(result.published!==true)throw Error('act-worker/publication');
}


/** Historical, public-key-only inspection. This result grants no current act. */
export async function inspectBoundAdmissionInWorker(context:WorkerAdmissionContext,query:'authority'|'verify',options:BoundWorkerOptions):Promise<unknown>{
 return inspectAdmission(context,query,options,false);
}

export function inspectBoundAdmissionHistoryInWorker(context:WorkerAdmissionContext,query:'authority'|'verify',options:BoundWorkerOptions):Promise<unknown>{
 return inspectAdmission(context,query,options,true);
}

async function inspectAdmission(context:WorkerAdmissionContext,query:'authority'|'verify',options:BoundWorkerOptions,long:boolean):Promise<unknown>{
 if(!context||!context.anchor||typeof context.anchor.publicKey!=='string'||context.anchor.publicKey.includes('PRIVATE KEY')||
  !Array.isArray(context.algorithms)||!Array.isArray(context.history)||!Array.isArray(context.queries)||
  (!long&&context.history.length>64)||context.queries.length>64||
  new TextEncoder().encode(JSON.stringify(context)).length>(long?historyLimit:65536))throw Error('admission/input-budget');
 const {inspection}=await invoke({operation:'inspect',context,query,long},options);
 if(!Array.isArray(inspection)||(inspection[0]!=='fact'&&inspection[0]!=='refuse'))throw Error('admission/worker-response');
 return inspection;
}


export async function reconfirmBundleInWorker(committed:string,files:Readonly<Record<string,string>>,options:BoundWorkerOptions):Promise<void>{
 const result=await invoke({operation:'reconfirm',committed,files},options);
 if(result.reconfirmed!==true)throw Error('act-worker/reconfirmation');
}
