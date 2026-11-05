import{abiBuffer}from'./abi-port.mjs';
// Byte transport only; persistence capability and physical destination belong
// to the receiving host, never to the request or the WASM module.
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const stop=code=>{throw Object.assign(Error(code),{code})};
export function preparePersistence(input){
 if(!(input instanceof Uint8Array)||input.length>65536)stop('fold/input-budget');
 if(typeof SharedArrayBuffer!=='undefined'&&input.buffer instanceof SharedArrayBuffer)stop('persistence/input');
 let r;try{r=JSON.parse(dec.decode(new Uint8Array(input)))}catch{stop('persistence/input');}
 if(!r||r.profile!=='bound-persistence-request@1'||Object.keys(r).some(k=>!['profile','files'].includes(k))||!r.files||typeof r.files!=='object'||Array.isArray(r.files))stop('persistence/input');
 const files=Object.entries(r.files).map(([name,bytes])=>{if(typeof bytes!=='string')stop('persistence/input');return{name,bytes}});
 const bytes=enc.encode(JSON.stringify({profile:'bound-persistence-prepared@1',files}));if(bytes.length>65536)stop('fold/input-budget');return bytes;
}
export async function instantiatePersistence(moduleBytes,{prepare=preparePersistence,entry="persistence_eval"}={}){
 const module=await WebAssembly.compile(new Uint8Array(moduleBytes)),imports=WebAssembly.Module.imports(module);
 if(imports.length!==1||imports[0].module!=='bound_storage'||imports[0].name!=='call'||imports[0].kind!=='function')stop('persistence/imports');
 let instance,port,busy=false;
 const call=(pointer,length)=>{let result;try{const value=port.call(JSON.parse(dec.decode(new Uint8Array(instance.exports.memory.buffer,pointer,length))));if(value&&typeof value.then==='function')stop('persistence/async-port');result={ok:true,value};}catch(e){result={ok:false,code:typeof e?.code==='string'?e.code:'persistence/storage'};}
 const bytes=enc.encode(JSON.stringify(result));if(bytes.length>65536)stop('persistence/port-budget');const p=instance.exports.fold_alloc(bytes.length);abiBuffer(instance.exports,p,bytes.length).set(bytes);return(BigInt(p)<<32n)|BigInt(bytes.length);};
 instance=await WebAssembly.instantiate(module,{bound_storage:{call}});
 return{instance,run(input,selectedPort){if(busy)stop('persistence/busy');busy=true;let p,prepared;try{prepared=prepare(input);port=selectedPort;p=instance.exports.fold_alloc(prepared.length);abiBuffer(instance.exports,p,prepared.length).set(prepared);const packed=instance.exports[entry](p,prepared.length),at=Number(packed>>32n),n=Number(packed&0xffffffffn);if(n>65536)stop('fold/response-budget');try{return abiBuffer(instance.exports,at,n).slice();}finally{instance.exports.fold_free(at,n);}}finally{if(p!==undefined)instance.exports.fold_free(p,prepared.length);port=undefined;busy=false;}}};
}
