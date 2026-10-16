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
