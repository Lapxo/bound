import {readingIdentityBytes,readingReceiptBytes} from '@lapxo/topos/contract';
import type {ReadingIdentityContext} from '@lapxo/topos/contract';
import {encodeUTF8} from './encoding.ts';
import {invokeByteComputationPort,invokeFrameSigningPort,invokeSignatureVerificationPort} from './ports.ts';
import type {ByteComputationPort,DigestPort,SigningPort,SignatureVerificationPort,PortLimits} from './ports.ts';
import {BoundRefusal} from '../host/refusals.ts';

export interface ComputationContext {
 readonly contract:string;
 readonly numericPolicy:string;
 readonly reading:ReadingIdentityContext;
 readonly keyId:string;
 readonly algorithm:string;
}
export interface ComputationStatement {
 readonly profile:'bound-computation@1';
 readonly question:string;
 readonly reading:string;
 readonly origin:string;
 readonly result:string;
 readonly commitment:string;
 readonly keyId:string;
 readonly algorithm:string;
 readonly signature:string;
}
const refuse=(code:string):never=>{throw new BoundRefusal('computation/'+code,'REFUSE·computation/'+code)};
const pin=(value:string)=>{if(typeof value!=='string'||!/^sha256:[a-f0-9]{64}$/.test(value))refuse('context')};
const hash=async(digest:DigestPort,bytes:Uint8Array)=>{const value=await digest(new Uint8Array(bytes));pin(value);return value};
const requestCoordinate='computation/request';
/** Names the question before evaluating it. An implementation is an origin,
 * never a signing key, authority grant or claim of correctness/independence. */
async function prepare(context:ComputationContext,input:Uint8Array,digest:DigestPort){
 if(!context||!context.reading||!(input instanceof Uint8Array)||typeof context.keyId!=='string'||!context.keyId||typeof context.algorithm!=='string'||!context.algorithm)refuse('context');
 let held:ComputationContext;try{held=structuredClone(context)}catch{return refuse('context')}
 pin(held.contract);pin(held.numericPolicy);
 try{readingIdentityBytes(held.reading)}catch{return refuse('context')}
 for(const value of [held.reading.instrument,held.reading.implementation,held.reading.policy])pin(value);
 if(held.reading.inputs.some(([name])=>name===requestCoordinate))refuse('context');
 const readingContext={...held.reading,inputs:[...held.reading.inputs,[requestCoordinate,await hash(digest,input)] as const]};
 let bytes:Uint8Array;try{bytes=readingIdentityBytes(readingContext)}catch{return refuse('context')}
 const normalized=JSON.parse(new TextDecoder().decode(bytes));
 const question=await hash(digest,encodeUTF8(JSON.stringify(['computation-request@1',held.contract,held.numericPolicy,normalized[3],normalized[4],normalized[5]])));
 return {held,question,reading:await hash(digest,bytes)};
}
function frame(statement:Omit<ComputationStatement,'signature'>):string{
 return JSON.stringify([statement.profile,statement.question,statement.reading,statement.origin,statement.result,statement.commitment,statement.keyId,statement.algorithm])+'\n';
}
async function statement(prepared:Awaited<ReturnType<typeof prepare>>,output:Uint8Array,digest:DigestPort):Promise<Omit<ComputationStatement,'signature'>>{
 const result=await hash(digest,output);
 return {profile:'bound-computation@1',question:prepared.question,reading:prepared.reading,origin:prepared.held.reading.implementation,result,commitment:await hash(digest,readingReceiptBytes(prepared.reading,result)),keyId:prepared.held.keyId,algorithm:prepared.held.algorithm};
}
/** Receiver-owned ports only. No private key, clock, filesystem or transport is
 * available to this operation. Each port is separately bounded and cancellable. */
export async function executeComputation(context:ComputationContext,input:Uint8Array,ports:{readonly digest:DigestPort;readonly evaluate:ByteComputationPort;readonly sign:SigningPort;readonly verify:SignatureVerificationPort},limits:PortLimits,signal?:AbortSignal):Promise<{readonly statement:ComputationStatement;readonly output:Uint8Array}>{
 if(!(input instanceof Uint8Array)||input.byteLength>limits.maxBytes)refuse('budget');
 const owned=new Uint8Array(input),prepared=await prepare(context,owned,ports.digest);
 const output=await invokeByteComputationPort(owned,ports.evaluate,limits,signal),unsigned=await statement(prepared,output,ports.digest),bytes=frame(unsigned);
 const signatures=await invokeFrameSigningPort({bytes:[bytes],keyId:unsigned.keyId,algorithm:unsigned.algorithm},ports.sign,limits,signal),signature=signatures[0]!;
 if(!await invokeSignatureVerificationPort(bytes,signature,unsigned.algorithm,ports.verify,limits,signal))refuse('signature');
 return {statement:Object.freeze({...unsigned,signature:signature.signature}),output};
}
/** The receiver supplies the expected implementation, question, policy,
 * environment and verification port. The carrier cannot choose any of them. */
export async function verifyComputation(context:ComputationContext,input:Uint8Array,output:Uint8Array,claim:ComputationStatement,ports:{readonly digest:DigestPort;readonly verify:SignatureVerificationPort},limits:PortLimits,signal?:AbortSignal):Promise<ComputationStatement>{
 if(!(input instanceof Uint8Array)||!(output instanceof Uint8Array)||input.byteLength>limits.maxBytes||output.byteLength>limits.maxBytes)refuse('budget');
 if(!claim||Object.keys(claim).sort().join(',')!=='algorithm,commitment,keyId,origin,profile,question,reading,result,signature'||typeof claim.signature!=='string')refuse('signature');
 const prepared=await prepare(context,new Uint8Array(input),ports.digest),expected=await statement(prepared,new Uint8Array(output),ports.digest);
 const {signature,...unsigned}=claim;
 if(frame(unsigned)!==frame(expected))refuse('context');
 if(!await invokeSignatureVerificationPort(frame(expected),{keyId:expected.keyId,signature},expected.algorithm,ports.verify,limits,signal))refuse('signature');
 return Object.freeze({...expected,signature});
}
