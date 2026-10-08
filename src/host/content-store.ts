import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {blobAt} from '../land/ledger.ts';
import {observeFile} from '../observe/files.ts';
import {ownLock,ownStore} from '../observe/runner.ts';
import {parse,wireAt} from '@lapxo/topos/wire';
import {ContentNeeded} from './content-needed.ts';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {realpathSync} from 'node:fs';

// Each invocation carries its place explicitly; asynchronous requests cannot share a mutable current root.
const requested = new AsyncLocalStorage<{readonly store:string;readonly policy:()=>readonly string[]}>();
export const withContentStore = <T>(store:string, run:()=>T, policy:()=>readonly string[]=()=>[]):T => requested.run({store,policy},run);
export const contentPolicy = ():readonly string[] => requested.getStore()?.policy() ?? [];
export const contentStore = ():string => requested.getStore()?.store ?? ownStore();

/** Only immutable verified bytes may be shared with the instrument. Local corruption is never hidden by fallback. */
export function verifiedContent(digest:string, store:string = contentStore(), instrument:string = ownStore()):{readonly bytes:Uint8Array;readonly path:string} {
 const fields=ownLock().flatMap(line=>{const p=parse(line);return p.kind==='fact'?[p.value.fields]:[];});
 const wire=wireAt(fields,Number.MAX_SAFE_INTEGER);
 if(!wire)throw Error('REFUSE·pin instrument has no admitted wire');
 const split=digest.indexOf(':'),algorithm=digest.slice(0,split),hex=digest.slice(split+1);
 if(split<1||!wire.digests.has(algorithm)||! /^[a-f0-9]+$/.test(hex))throw Error(`REFUSE·pin ${digest} digest is not admitted`);
 // A place may deliver an immutable artifact beside its lock. The coordinate
 // locates bytes; the digest, never that path, identifies them.
 for(const line of contentPolicy()) {
  const p=parse(line);if(p.kind!=='fact')continue;const f=p.value.fields;
  if(!f.scope?.startsWith('dep/')||f.value!==digest||!f.needs||f.needs.includes('|'))continue;
  if(isAbsolute(f.needs)||f.needs.split('/').includes('..'))throw Error(`REFUSE·pin ${digest} artifact coordinate escapes the place`);
  const root=dirname(store),path=resolve(root,f.needs),bytes=observeFile(path);
  if(bytes===undefined)throw new ContentNeeded(digest);
  const escaped=relative(realpathSync(root),realpathSync(path));
  if(escaped==='..'||escaped.startsWith('../')||isAbsolute(escaped))throw Error(`REFUSE·pin ${digest} artifact coordinate escapes the place`);
  if(createHash(algorithm).update(bytes).digest('hex')!==hex)throw Error(`REFUSE·pin ${digest} content hash mismatch · coordinate ${f.needs} · not laid`);
  return {bytes,path};
 }
 for(const at of new Set([store,instrument])) {
  const path=blobAt(at,digest),bytes=observeFile(path);
  if(bytes===undefined)continue;
  if(createHash(algorithm).update(bytes).digest('hex')!==hex)throw Error(`REFUSE·pin ${digest} content hash mismatch · store ${at} · not laid`);
  return {bytes,path};
 }
 throw new ContentNeeded(digest);
}
