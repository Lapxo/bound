import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {requireEffects} from '../read-only.ts';
import {underTheRegions} from '../../land/act.ts';
import {publishBundle,nativePublicationStorage} from './publication.ts';
import type {PublicationStorage} from './publication.ts';
import {actIdentity,parse,canonical} from '@lapxo/topos/wire';
import {fullDigest} from '../digest.ts';

/** Prepared and verified by the selected Topos admission/result contract. */
export interface LocalActBundle {readonly records: string; readonly receipt: string;readonly placements?:readonly {place:string;records:string}[]}
export type LocalActVerification = (identity: string, bundle: LocalActBundle) => boolean;
const atOf=(store: string,identity: string): string=>{
  if(!identity || identity.includes('\0'))throw Error('REFUSE·act missing identity');
  return join(store,'ledger','acts','committed-'+encodeURIComponent(identity));
};
const read=(at: string): LocalActBundle=>{
  try{const placements=readdirSync(at).filter(name=>name.startsWith('place-')&&name.endsWith('.bound')).map(name=>({
    place:decodeURIComponent(name.slice(6,-6)),records:readFileSync(join(at,name),'utf8'),
  }));return {
    records:readFileSync(join(at,'records.bound'),'utf8'),
    receipt:readFileSync(join(at,'receipt.bound'),'utf8'),
    ...(placements.length?{placements}:{}),
  }}catch(error){
    throw Error(`REFUSE·act committed result unreadable · ${(error as NodeJS.ErrnoException).code??'read failed'}`);
  }
};

export const actLines=(bytes:string):readonly string[]=>{
  if(!bytes.endsWith('\n'))throw Error('REFUSE·act truncated committed lines');
  return bytes.slice(0,-1).split('\n');
};
/** Journal integrity is not authority. Signature/coverage checks remain the
 * same admission boundary; the hash algorithm here is the stored seal's named
 * algorithm, not a new selection of the place's wire.
 */
export function intactLocalAct(identity:string,bundle:LocalActBundle):boolean{
  if(!bundle.receipt.endsWith('\n')||bundle.receipt.slice(0,-1).includes('\n'))return false;
  const receipt=parse(bundle.receipt.slice(0,-1));
  if(receipt.kind!=='fact'||!bundle.placements?.length)return false;
  const f=receipt.value.fields;
  if(canonical(f)!==bundle.receipt.slice(0,-1)||!/^(0|[1-9][0-9]*)$/.test(f['epoch']??''))return false;
  if(f['value']!==identity||f['role']!=='writes'||f['form']!=='alphabet'||f['measure']!=='digest')return false;
  return actIdentity(actLines(bundle.records),{scope:f['scope']??'',context:f['at']??'',
    localEpoch:Number(f['epoch']),digest:bytes=>fullDigest(bytes,identity.slice(0,identity.indexOf(':'))),
    placements:bundle.placements.map(p=>({place:p.place,records:actLines(p.records)})),
  })===identity;
}

/** Committed segments are part of this ledger, not a second authority source. */
export function committedLocalActs(store:string):readonly {identity:string;bundle:LocalActBundle}[]{
  const root=join(store,'ledger','acts');if(!existsSync(root))return [];
  return readdirSync(root).filter(name=>name.startsWith('committed-')).map(name=>{
    const identity=decodeURIComponent(name.slice(10)),bundle=read(join(root,name));
    if(!intactLocalAct(identity,bundle))throw Error('REFUSE·act committed journal seal does not verify');
    return {identity,bundle};
  }).sort((a,b)=>{
    const epoch=(one:LocalActBundle)=>{const p=parse(one.receipt.trim());return p.kind==='fact'?Number(p.value.fields['epoch']):0};
    return epoch(a.bundle)-epoch(b.bundle);
  });
}

/** A public result is available only as a verified committed pair.
 * No writer-tail guess, newest-result selection or implicit authority.
 */
export function localActResult(store: string,identity: string,verify: LocalActVerification): LocalActBundle | undefined {
  const at=atOf(store,identity);
  if(!existsSync(at))return undefined;
  const bundle=read(at);
  if(verify(identity,bundle)!==true)throw Error('REFUSE·act committed result does not verify');
  return bundle;
}

/** One publication point for records and their native result. Re-delivery
 * reads the original pair without preparation, signing or a new local epoch.
 * The caller must also integrate this boundary into admission-history readers;
 * this storage port alone does not activate a grammar or land authority.
 */
export async function commitLocalAct(store: string,identity: string,regions: readonly string[],
  prepare: ()=>Promise<LocalActBundle>,verify: LocalActVerification,
  storage: PublicationStorage=nativePublicationStorage): Promise<LocalActBundle & {readonly kind:'landed'|'once'}> {
  requireEffects('local act commitment');
  return underTheRegions(store,regions,'land',async()=>{
    const prior=localActResult(store,identity,verify);
    if(prior)return {kind:'once',...prior};
    const bundle=await prepare();
    if(!bundle.records || !bundle.receipt || verify(identity,bundle)!==true)throw Error('REFUSE·act prepared result does not verify');
    const files:Record<string,string>={'records.bound':bundle.records,'receipt.bound':bundle.receipt};
    for(const p of bundle.placements??[])files['place-'+encodeURIComponent(p.place)+'.bound']=p.records;
    publishBundle(atOf(store,identity),files,storage);
    return {kind:'landed',...bundle};
  });
}
