import {digest} from './adapter.ts';
import {buffer,input,output,runHistory,historyLimit} from './rust-core.ts';
import type {CoreExports} from './rust-core.ts';

type ExportName='admission_eval'|'admission_history_finish'|'persistence_eval'|'persistence_recover';
type PortName='bound_admission'|'bound_storage';
type PortExports=CoreExports&Record<Exclude<ExportName,'admission_history_finish'>,(handle:number,length:number)=>bigint>&{admission_history_finish():number};
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const max=65536;

export async function runRustPort(
 wasm:Uint8Array, pin:string, prepared:unknown, name:PortName, entry:ExportName, port:(request:Record<string,unknown>)=>unknown,
):Promise<unknown>{
 const payload=encoder.encode(JSON.stringify(prepared));
 if(payload.length>(entry==='admission_history_finish'?historyLimit:max))throw Error('fold/input-budget');
 if(await digest(wasm)!==pin)throw Error('fold/module-integrity');
 const module=await WebAssembly.compile(Uint8Array.from(wasm));
 const imports=WebAssembly.Module.imports(module);
 if(imports.length!==2||!['bound_admission','bound_storage'].every(ns=>
  imports.some(i=>i.module===ns&&i.name==='call'&&i.kind==='function')))throw Error('fold/module-imports');
 let core:PortExports;
 const call=(pointer:number,length:number):bigint=>{
  let response:unknown;
  try{
   if(pointer<1||length<1||length>max||pointer+length>core.memory.buffer.byteLength)throw Error('fold/abi-buffer');
   const request=JSON.parse(decoder.decode(new Uint8Array(core.memory.buffer,pointer,length)));
   response={ok:true,value:port(request)};
  }catch{response={ok:false,code:name==='bound_storage'?'persistence/storage':'admission/port'};}
  const bytes=encoder.encode(JSON.stringify(response));
  if(bytes.length>max)throw Error('fold/response-budget');
  const handle=core.fold_alloc(bytes.length);
  buffer(core,handle,bytes.length).set(bytes);
  return (BigInt(handle)<<32n)|BigInt(bytes.length);
 };
 const denied=()=>{throw Error('fold/undeclared-port')};
 const instance=await WebAssembly.instantiate(module,{
  bound_admission:{call:name==='bound_admission'?call:denied},
  bound_storage:{call:name==='bound_storage'?call:denied},
 });
 core=instance.exports as unknown as PortExports;
 if(!(core.memory instanceof WebAssembly.Memory)||core.fold_abi_version?.()!==2||typeof core[entry]!=='function')throw Error('fold/module-abi');
 const reply=entry==='admission_history_finish'?runHistory(core,payload,core[entry]):output(core,input(core,payload,core[entry]));
 return JSON.parse(decoder.decode(reply));
}
