import {createHash} from 'node:crypto';
import {runWasmRequest} from '../wasm/adapter.ts';
import type {WasmRequest} from '../wasm/adapter.ts';

export async function evaluateCapsuleWorkerRequest(request:WasmRequest,budget:{bytes:number;calls:number}){
  let {bytes,calls}=budget;
  let refused=false;
  const result=await runWasmRequest(request,context=>{
   const fail=()=>{refused=true;throw Error('capsule-worker/host-budget')};
   const install=(name:string,run:(text:string)=>string)=>{
    const fn=context.newFunction(name,value=>{
     if(--calls<0||context.typeof(value)!=='string')return fail();
     const text=context.getString(value);
     if(text.length>6*bytes+2)return fail();
     return context.newString(run(text));
    });
    try{context.setProp(context.global,name,fn)}finally{fn.dispose()}
   };
   const charge=(size:number)=>{bytes-=size;if(bytes<0)fail()};
   install('__boundSha256',encoded=>{
    const input:unknown=JSON.parse(encoded);
    let data:string|Uint8Array;
    if(typeof input==='string')data=input;
    else if(Array.isArray(input)&&input.length<=bytes&&input.every(n=>Number.isInteger(n)&&n>=0&&n<=255))data=Uint8Array.from(input);
    else return fail();
    charge(typeof data==='string'?Buffer.byteLength(data):data.byteLength);
    return createHash('sha256').update(data).digest('hex');
   });
   install('__boundUrlOrigin',text=>{
    charge(Buffer.byteLength(text));
    return JSON.stringify(URL.canParse(text)?new URL(text).origin:null);
   });
  });
  if(refused)throw Error('capsule-worker/host-budget');
  return result;
}
