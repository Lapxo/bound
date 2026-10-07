import {verifiedContent} from './content-store.ts';
import {readStanding} from '@lapxo/topos/standing';
import type {StandingTopos} from '@lapxo/topos/standing';
import {parse,wireAt} from '@lapxo/topos/wire';
import {fieldOf} from '../fold/claims.ts';

export interface SelectedTopos {readonly digest:string; readonly topos:StandingTopos}
export type ToposResolver=(digest:string)=>StandingTopos;

/** Resolve content using the instrument wire's admitted digest algorithms. No transport interpretation. */
export function toposAt(digest:string,store?:string):StandingTopos {
  const topos=readStanding(Buffer.from(contentAt(digest,store)).toString('utf8'));
  return topos;
}

export function contentAt(digest:string,store?:string):Uint8Array {
  return verifiedContent(digest,store).bytes;
}

/** The declared module runs from the store that supplied its verified bytes. No copy or live-checkout fallback. */
export function contextModuleAt(digest:string,store?:string):string {
  return verifiedContent(digest,store).path;
}

/** Selection verifies standing identity. Requested capabilities verify their artifact bytes separately. */
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

/** Complete an admission snapshot from the selected standing. Local declarations
 * govern their own lists; independent selected contracts cannot choose by order. */
export function selectedWireAt(local:readonly Readonly<Record<string,string>>[],epoch:number,pins:readonly string[],resolve:ToposResolver=toposAt):ReturnType<typeof wireAt> {
  const own=wireAt(local,epoch);
  const worlds=selectedTopoi(pins,resolve).map(({digest,topos})=>({digest,parts:topos.parts,wire:wireAt(topos.parts,Number.MAX_SAFE_INTEGER)}));
  const key=(scope:string):string|undefined=>scope.startsWith('wire/')?scope.slice(5):scope.startsWith('audit/wire/')?scope.slice(11):undefined;
  const declared=new Set(local.filter(f=>Number(f.epoch??0)<=epoch).map(f=>key(f.scope??'')).filter((k):k is string=>k!==undefined));
  const selected=new Map<string,{value:string;fields:Readonly<Record<string,string>>;digest:string}>();
  for(const world of worlds) for(const f of world.parts){
    const name=key(f.scope??'');if(name===undefined||declared.has(name))continue;
    const list=world.wire?.lists.get(name);
    const value=list?[...list].sort().join('|'):f.value??'';
    const previous=selected.get(name);
    if(previous&&previous.value!==value)throw Error(`REFUSE·wire wire/${name} has conflicting selected contracts · ${previous.digest} · ${world.digest}`);
    if(!previous)selected.set(name,{value,fields:f,digest:world.digest});
  }
  return selected.size?wireAt([...selected.values()].map(one=>one.fields).concat(local),epoch):own;
}
