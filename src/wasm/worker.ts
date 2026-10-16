import{runWasmRequest}from'./adapter.ts';import type{WasmRequest}from'./adapter.ts';
self.onmessage=async({data}:{data:WasmRequest})=>{try{self.postMessage({ok:true,result:await runWasmRequest(data)})}catch(error){self.postMessage({ok:false,error:String(error)})}};
