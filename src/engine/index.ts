/**
 * Pure projection of already admitted typed-object records.
 * Input is the effective history already admitted by the host, preserving cell
 * declarations before uses within each epoch and a deterministic selected context.
 * This API performs no admission,
 * signature verification, storage, transport, clock selection or execution.
 * Object operations delegate to the existing Obligations implementation.
 */
export {objectFold} from './object.ts';
export type {ObjectReading} from './object.ts';
export type {ObjectRecord,ObjectContext} from '@lapxo/topos/wire';
// Optional host operations are explicit and injected; objectFold itself never invokes them.
export{readContent,retainContent,invokeSigningPort}from'./ports.ts';
export type{PortLimits,ContentReadPort,PersistencePort,DigestPort,SigningPort,SigningLot,SignatureRecord}from'./ports.ts';
export {executeComputation,verifyComputation} from './computation.ts';
export type {ComputationContext,ComputationStatement} from './computation.ts';
export type {ByteComputationPort,SignatureVerificationPort} from './ports.ts';
export {runConformance} from './conformance.ts';
export type {ConformanceReceiver,ConformanceCase,ConformanceSuite,ConformanceReport} from './conformance.ts';
export {readRefusalCatalog} from '../host/refusals.ts';
export type {RefusalEntry} from '../host/refusals.ts';
import {validateObjectContext} from '@lapxo/topos/wire';
import type {ObjectContext,ObjectRecord} from '@lapxo/topos/wire';
import {objectFold as project} from './object.ts';
import {BoundRefusal} from '../host/refusals.ts';
import {encodeUTF8,decodeUTF8} from './encoding.ts';
/** Portable byte profile. Context and admission callbacks belong to the
 * receiver, never to a requested vector or downloaded place. */
export function objectFoldBytes(input:Uint8Array,context:ObjectContext):Uint8Array{
 let request:unknown;try{request=JSON.parse(decodeUTF8(input))}catch{throw new BoundRefusal('engine/input','REFUSE·engine/input')}
 if(!Array.isArray(request)||request.length!==2||request[0]!=='bound-object-request@1'||!Array.isArray(request[1]))throw new BoundRefusal('engine/input','REFUSE·engine/input');
 let records:ReturnType<typeof validateObjectContext>;
 try{records=validateObjectContext(request[1] as readonly ObjectRecord[],context)}catch{throw new BoundRefusal('engine/context','REFUSE·engine/context')}
 if(records.kind!=='fact')throw new BoundRefusal('engine/context','REFUSE·engine/context');
 return encodeUTF8(JSON.stringify(['fact',project(records.value,context)])+'\n');
}
