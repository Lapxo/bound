import{signerRequestBytes,signerResponseBytes,signerResponseOf}from'@lapxo/topos/wire';
import{BoundRefusal}from'../host/refusals.ts';
import{encodeUTF8 as encoded}from'./encoding.ts';
export interface PortLimits{readonly timeoutMs:number;readonly maxBytes:number}
export interface SigningLot{readonly bytes:readonly string[];readonly keyId:string;readonly algorithm:string}
export interface SignatureRecord{readonly keyId:string;readonly signature:string}
export type SigningPort=(lot:SigningLot,signal:AbortSignal)=>Promise<readonly SignatureRecord[]>;
export type ContentReadPort=(source:string,digest:string,signal:AbortSignal)=>Promise<Uint8Array>;
/** Atomic byte retention supplied by the host. This is neither admission nor a current-answer cache. */
export type PersistencePort=(digest:string,bytes:Uint8Array,signal:AbortSignal)=>Promise<void>;
export type DigestPort=(bytes:Uint8Array)=>string|Promise<string>;
export type ByteComputationPort=(bytes:Uint8Array,signal:AbortSignal)=>Promise<Uint8Array>;
export type SignatureVerificationPort=(bytes:string,signature:SignatureRecord,algorithm:string,signal:AbortSignal)=>Promise<boolean>;
/** Each invocation has its own budget; evaluation and signing are separate acts. */
export function invokeByteComputationPort(bytes:Uint8Array,evaluate:ByteComputationPort,limits:PortLimits,signal?:AbortSignal):Promise<Uint8Array>{
 limitsOf(limits);const input=owned(bytes,limits.maxBytes);
 return bounded(limits,signal,async s=>owned(await evaluate(input,s),limits.maxBytes));
}
export function invokeSignatureVerificationPort(bytes:string,signature:SignatureRecord,algorithm:string,verify:SignatureVerificationPort,limits:PortLimits,signal?:AbortSignal):Promise<boolean>{
 limitsOf(limits);if(encoded(bytes).length+encoded(signature.signature).length>limits.maxBytes)fail('budget');
 return bounded(limits,signal,async s=>{const valid=await verify(bytes,Object.freeze({...signature}),algorithm,s);if(typeof valid!=='boolean')fail('response');return valid});
}
class PortFault extends BoundRefusal{}
const fail=(code:string):never=>{throw new PortFault('host-port/'+code,'REFUSE·host-port/'+code)};
function limitsOf(limits:PortLimits){if(!limits||!Number.isSafeInteger(limits.timeoutMs)||limits.timeoutMs<1||limits.timeoutMs>2147483647||!Number.isSafeInteger(limits.maxBytes)||limits.maxBytes<1)fail('budget');}
/** The callback must cooperate with cancellation; JavaScript callbacks are not a sandbox. */
async function bounded<T>(limits:PortLimits,signal:AbortSignal|undefined,run:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 limitsOf(limits);if(signal?.aborted)fail('cancelled');
 return new Promise<T>((resolve,reject)=>{const controller=new AbortController();let done=false;
  const finish=(code:string|undefined,value?:T)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(code){controller.abort();reject(new BoundRefusal('host-port/'+code,'REFUSE·host-port/'+code))}else resolve(value!)};
  const abort=()=>finish('cancelled'),timer=setTimeout(()=>finish('timeout'),limits.timeoutMs);signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return;}
  Promise.resolve().then(()=>{if(done)fail('cancelled');return run(controller.signal)}).then(value=>finish(undefined,value),error=>finish(error instanceof PortFault?error.code.slice('host-port/'.length):'failed'));
 });
}
function owned(bytes:Uint8Array,maxBytes:number):Uint8Array{if(!(bytes instanceof Uint8Array))fail('response');if(bytes.byteLength>maxBytes)fail('budget');if(typeof SharedArrayBuffer!=='undefined'&&bytes.buffer instanceof SharedArrayBuffer)fail('response');return new Uint8Array(bytes);}
const identity=(digest:string)=>{if(!/^sha256:[a-f0-9]{64}$/.test(digest))fail('integrity')};
export async function readContent(source:string,digest:string,ports:{readonly read:ContentReadPort;readonly digestBytes:DigestPort},limits:PortLimits,signal?:AbortSignal):Promise<Uint8Array>{
 limitsOf(limits);identity(digest);return bounded(limits,signal,async s=>{const bytes=owned(await ports.read(source,digest,s),limits.maxBytes);if(s.aborted)fail('cancelled');if(await ports.digestBytes(new Uint8Array(bytes))!==digest)fail('integrity');if(s.aborted)fail('cancelled');return bytes;});
}
/** Verify before invoking retention; no operation automatically writes the projected result. */
export async function retainContent(digest:string,bytes:Uint8Array,ports:{readonly retain:PersistencePort;readonly digestBytes:DigestPort},limits:PortLimits,signal?:AbortSignal):Promise<{readonly digest:string;readonly bytes:number}>{
 limitsOf(limits);identity(digest);if(signal?.aborted)fail('cancelled');const copy=owned(bytes,limits.maxBytes);return bounded(limits,signal,async s=>{if(await ports.digestBytes(new Uint8Array(copy))!==digest)fail('integrity');if(s.aborted)fail('cancelled');const result=await ports.retain(digest,copy,s);if(result!==undefined)fail('response');return Object.freeze({digest,bytes:copy.byteLength});});
}
/** Acquire canonical line signatures only. The line protocol is not widened
 * for contextual receipt frames. Both operations share bounds and response checks. */
export async function invokeSigningPort(lot:SigningLot,sign:SigningPort,limits:PortLimits,signal?:AbortSignal):Promise<readonly SignatureRecord[]>{
 validateSigningLot(lot,limits);
 let request:string;try{request=signerRequestBytes(lot)}catch{return fail('response')}
 return invokeDeclaredSignatures(lot,request,sign,limits,signal);
}
/** Host-prepared signature frames. This acquires no authority: the contextual
 * transaction validates the frame's domain/receiver and verifies every signature.
 * A carrier cannot select this operation or supply a signature verifier. */
export async function invokeFrameSigningPort(lot:SigningLot,sign:SigningPort,limits:PortLimits,signal?:AbortSignal):Promise<readonly SignatureRecord[]>{
 validateSigningLot(lot,limits);
 return invokeDeclaredSignatures(lot,JSON.stringify(lot)+'\n',sign,limits,signal);
}
function validateSigningLot(lot:SigningLot,limits:PortLimits):void {
 limitsOf(limits);if(!lot||!Array.isArray(lot.bytes)||!lot.bytes.length||typeof lot.keyId!=='string'||!lot.keyId||typeof lot.algorithm!=='string'||!lot.algorithm)fail('budget');
 let size=0;for(const bytes of lot.bytes){if(typeof bytes!=='string'||bytes.length>limits.maxBytes-size)fail('budget');size+=encoded(bytes).length+1;if(size>limits.maxBytes)fail('budget');}
}
function invokeDeclaredSignatures(lot:SigningLot,request:string,sign:SigningPort,limits:PortLimits,signal?:AbortSignal):Promise<readonly SignatureRecord[]>{
 if(encoded(request).length>limits.maxBytes)fail('budget');
 const input=Object.freeze({...lot,bytes:Object.freeze([...lot.bytes])});return bounded(limits,signal,async s=>{const records=await sign(input,s);
 if(!Array.isArray(records)||records.length!==lot.bytes.length||records.some(r=>!r||typeof r.signature!=='string'||r.signature.length>limits.maxBytes))fail('response');
 let response:string;try{response=signerResponseBytes(records)}catch{return fail('response')}if(encoded(response).length>limits.maxBytes)fail('budget');
 try{return Object.freeze(signerResponseOf(response,lot).map(record=>Object.freeze({...record})))}catch{return fail('response')}
 });
}
