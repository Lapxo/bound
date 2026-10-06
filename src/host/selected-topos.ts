import {createHash} from 'node:crypto';
import {readStanding} from '@lapxo/topos/standing';
import type {StandingTopos} from '@lapxo/topos/standing';
import {parse,wireAt} from '@lapxo/topos/wire';
import {fieldOf} from '../fold/claims.ts';
import {blobAt} from '../land/ledger.ts';
import {observeFile} from '../observe/files.ts';
import {ownRoot,ownStore,ownLock} from '../observe/runner.ts';
import {lockStanding} from '../fold/keys.ts';
import {replaceWhole} from '../land/ledger.ts';
import {join} from 'node:path';

export interface SelectedTopos {readonly digest:string; readonly topos:StandingTopos}
export type ToposResolver=(digest:string)=>StandingTopos;

/** Resolve content using the instrument wire's admitted digest algorithms. No transport interpretation. */
export function toposAt(digest:string):StandingTopos {
  const topos=readStanding(Buffer.from(contentAt(digest)).toString('utf8'));
  for(const dependency of topos.dependencies)contentAt(dependency);
  return topos;
}

export function contentAt(digest:string):Uint8Array {
  const fields=ownLock().flatMap(line=>{const got=parse(line);return got.kind==='fact'?[got.value.fields]:[];});
  const wire=wireAt(fields,Number.MAX_SAFE_INTEGER);
  if(wire===null)throw Error('REFUSE·pin instrument has no admitted wire');
  const algorithms=wire.digests;
  const bytesAt=(name:string):Uint8Array=>{
    const split=name.indexOf(':');const algorithm=name.slice(0,split),hex=name.slice(split+1);
    if(split<1||!algorithms.has(algorithm)||! /^[a-f0-9]+$/.test(hex))throw Error(`REFUSE·pin ${name} digest is not admitted`);
    const bytes=observeFile(blobAt(ownStore(),name));
    if(bytes===undefined)throw Error(`REFUSE·pin ${name} content unavailable · not laid`);
    if(createHash(algorithm).update(bytes).digest('hex')!==hex)throw Error(`REFUSE·pin ${name} content hash mismatch · not laid`);
    return bytes;
  };
  return bytesAt(digest);
}

/** A declared JS context offer uses this host adapter only after selection; execution is not selection. */
export function contextModuleAt(digest:string):string {
  const bytes=contentAt(digest);
  const at=join(ownStore(),'cas','runtime',digest.replace(':','_')+'.mjs');
  replaceWhole(at,bytes);
  return at;
}

/** Selection verifies the standing and its directly declared closure. It does not request any capability. */
export function selectedTopoi(pins:readonly string[],resolve:ToposResolver=toposAt):readonly SelectedTopos[] {
  return [...new Set(pins.map(pin=>fieldOf(pin,'value')))].map(digest=>({digest,topos:resolve(digest)}));
}

/** Read a declared wire list without copying a world's claims or executing its offers.
 * Independent declarations must agree; selection order cannot choose a contract.
 */
export function selectedWireList(local:readonly string[],epoch:number,pins:readonly string[],list:string,resolve:ToposResolver=toposAt):readonly string[] {
  const records=local.flatMap(line=>{const got=parse(line);return got.kind==='fact'?[got.value.fields]:[];});
  const contracts=[{name:'place',wire:wireAt(records,epoch)},...selectedTopoi(pins,resolve).map(({digest,topos})=>({name:digest,wire:wireAt(topos.parts,Number.MAX_SAFE_INTEGER)}))]
    .flatMap(({name,wire})=>{const words=wire?.lists.get(list);return words===undefined?[]:[{name,words:[...words]}];});
  if(!contracts.length)throw Error(`REFUSE·wire wire/${list} has no declared contract in the place or its selected topoi`);
  const first=contracts[0]!;
  if(contracts.some(({words})=>words.length!==first.words.length||words.some(word=>!first.words.includes(word))))
    throw Error(`REFUSE·wire wire/${list} has conflicting contracts · ${contracts.map(one=>one.name).join(' · ')}`);
  return first.words;
}
