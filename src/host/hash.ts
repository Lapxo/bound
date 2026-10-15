import { createHash,type Hash } from 'node:crypto';

/** SHA-256 byte hashing for host formats that explicitly name this algorithm. */
export const sha = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Typed digest spelling shared by fixed host boundaries; hashes identical bytes. */
export const sha256 = (bytes:string|Uint8Array):string => 'sha256:'+sha(bytes);

/** Length-delimited UTF-8 fields for existing host history identities. */
export function hashText(hash:Hash,value:string):void{hash.update(String(Buffer.byteLength(value,'utf8'))+':');hash.update(value,'utf8');}

/** Exact typed SHA-256 spelling used by fixed host declarations. */
export const isSha256=(value:unknown):value is string=>typeof value==='string'&&/^sha256:[0-9a-f]{64}$/.test(value);
