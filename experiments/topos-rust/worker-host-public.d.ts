/** Candidate extension to the existing @lapxo/bound/host declaration. */
import type {PortLimits,SigningPort,SignatureVerificationPort} from '../engine/index.js';
import type {WorkerPort} from '../wasm/adapter.js';
export interface WorkerReadingContext {
 readonly instrument:string;readonly implementation:string;readonly policy:string;
 readonly inputs:readonly (readonly [string,string])[];
 readonly environment:readonly (readonly [string,string])[];
}
export interface WorkerReadOptions {readonly signal?:AbortSignal}
export interface WorkerCurrentLease {assertCurrent(signal?:AbortSignal):void|Promise<void>}
export interface WorkerReadingLease extends WorkerCurrentLease {
 readContext(signal?:AbortSignal):WorkerReadingContext|Promise<WorkerReadingContext>;
 assertExecution(context:WorkerReadingContext,descriptor:unknown,signal?:AbortSignal):void|Promise<void>;
 authorize(context:WorkerReadingContext,requests:readonly unknown[],signal?:AbortSignal):void|Promise<void>;
}
export interface WorkerReadingLeases {withLease(run:(lease:WorkerReadingLease)=>Promise<void>,signal?:AbortSignal):Promise<void>}
export interface WorkerCapsulePort {
 descriptor():unknown;assertCurrent(signal?:AbortSignal):Promise<void>;
 run(input:Uint8Array,options?:WorkerReadOptions):Promise<readonly unknown[]>;
}
export interface WorkerCacheIdentity {readonly reading:string;readonly execution:string;readonly batch:string}
export interface WorkerReadingCache {
 read(key:string,signal?:AbortSignal):Promise<Uint8Array|undefined>;
 verify(key:string,bytes:Uint8Array,identity:WorkerCacheIdentity,signal?:AbortSignal):Promise<void>;
 commit(key:string,bytes:Uint8Array,identity:WorkerCacheIdentity,lease:WorkerCurrentLease,signal?:AbortSignal):Promise<void>;
}
export interface WorkerReceiptContext {readonly contract:string;readonly numericPolicy:string;readonly reading:WorkerReadingContext;readonly keyId:string;readonly algorithm:string}
export type WorkerReceiptFiles=Readonly<Record<'binding.json'|'input.json'|'output.json'|'receipt.json',string>>;
export interface WorkerReceiptPersistence {
 read(identity:string,signal?:AbortSignal):Promise<WorkerReceiptFiles|undefined>;
 reconcile(identity:string,files:WorkerReceiptFiles,lease:WorkerCurrentLease,signal?:AbortSignal):Promise<{readonly status:'durable'|'refused';readonly visibility:'durable'|'unknown'|'not-published'}>;
}
export interface WorkerReceiptStorage {
 read(identity:string,signal?:AbortSignal):WorkerReceiptFiles|undefined|Promise<WorkerReceiptFiles|undefined>;
 open(identity:string):{call(request:unknown):unknown};
}
export interface BoundWorkerHost {
 /** Fresh permission and actual-byte checks; returns UTF-8 delivery JSON only after durability. */
 read(input:Uint8Array,options?:WorkerReadOptions):Promise<Uint8Array>;
 /** Historical evidence only. Does not sign, publish, run a capsule or confer authority. */
 recover(identity:string,options?:WorkerReadOptions):Promise<Uint8Array>;
}
export function createBoundWorkerHost(options:{readonly capsule:WorkerCapsulePort;readonly leases:WorkerReadingLeases;readonly cache:WorkerReadingCache;readonly limits:{readonly inputBytes:number;readonly cacheBytes:number;readonly batch:number};readonly receipt:Omit<WorkerReceiptContext,'reading'>&{readonly limits:PortLimits};readonly ports:{readonly sign:SigningPort;readonly verify:SignatureVerificationPort;readonly assertHistorical:(context:WorkerReceiptContext,identity:string,signal?:AbortSignal)=>void|Promise<void>;readonly persistence:WorkerReceiptPersistence};readonly subtle?:SubtleCrypto}):BoundWorkerHost;
export function createRustReceiptPersistence(options:{readonly module:{readonly bytes:Uint8Array;readonly digest:string};readonly storage:WorkerReceiptStorage;readonly maxBytes:number;readonly subtle?:SubtleCrypto}):Promise<WorkerReceiptPersistence>;
export function createNativeReceiptStorage(options:{readonly directory:string;readonly maxBytes:number;readonly platform?:string;readonly syncDirectory?:(directory:string)=>void}):WorkerReceiptStorage;
export function createNativeReadingLease(options:WorkerReadingLease&{readonly store:string;readonly regions:readonly string[];readonly name:string}):WorkerReadingLeases;
export function createMemoryReadingCache(options:{readonly entries:number;readonly payloadBytes:number}):WorkerReadingCache;
export interface WorkerCapsuleAsset {readonly digest:string;readonly bytes:number}
export interface WorkerCapsuleSelection {readonly profile:'bound-capsule-worker@1';readonly entry:string;readonly closure:string;readonly members:readonly string[];readonly self:string;readonly runtime:WorkerCapsuleAsset;readonly wasm:WorkerCapsuleAsset;readonly bootstrap:WorkerCapsuleAsset;readonly contract:WorkerCapsuleAsset;readonly limits:Readonly<Record<'batch'|'inputBytes'|'outputBytes'|'members'|'codeBytes'|'memoryBytes'|'stackBytes'|'executionMs'|'lifetimeMs'|'jobs',number>>}
export function createCapsuleWorkerPort(options:{readonly selection:WorkerCapsuleSelection;readonly readArtifact:(digest:string,signal?:AbortSignal)=>Promise<Uint8Array>;readonly assets:{readonly runtime:Uint8Array|ArrayBuffer;readonly wasm:Uint8Array|ArrayBuffer};readonly bootstrap:string;readonly contract:string;readonly workerFactory:(options:{readonly maxJobs:number})=>WorkerPort;readonly subtle?:SubtleCrypto}):WorkerCapsulePort;
