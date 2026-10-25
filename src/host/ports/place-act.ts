import {existsSync,readdirSync,statSync,openSync,fstatSync,readSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {topos_core_readPlaceActContext as readPlaceActContext,topos_core_placeActReceiptsOf as placeActReceiptsOf,type topos_core_TrustedClockContract as TrustedClockContract,type topos_core_PlaceReceipt as PlaceReceipt,type topos_core_RootContext as RootContext} from "../../../vendor/library.js";
import {transactPlaceAct,type PlaceActPersistence} from '../place-act-transaction.ts';
import {canonicalActStore,underAuthorityRegions,underTheRegions,underRootProjection} from '../../land/act.ts';
import {requireEffects} from '../read-only.ts';
import {receiverClock} from '../host-controls.ts';
import {publishBundle,nativePublicationStorage,type PublicationStorage} from './publication.ts';

export interface PlaceActBudget {readonly acts:number;readonly bytes:number}
export interface PlaceActHead {readonly place:string;readonly identity:string;readonly epoch:string}
export interface PlaceActSnapshot {readonly root:RootContext;readonly heads:readonly PlaceActHead[]}
/** Fixed instrument construction, never supplied by world JSON. Historical
 * authentication permits inspection only; current() is read under Root guards. */
export interface PlaceActTrust {
 readonly contract:TrustedClockContract;
 readonly initialHeads:readonly PlaceActHead[];
 readonly current:()=>PlaceActSnapshot;
 readonly historical:(encoded:string)=>TrustedClockContract;
}
export interface PlaceActBundle {readonly context:string;readonly receipts:readonly PlaceReceipt[];readonly originals:readonly (readonly string[])[]}
const fail=(why:string):never=>{throw Error('REFUSE·place act '+why)};
const budget=(b:PlaceActBudget)=>{if(!b||!Number.isSafeInteger(b.acts)||b.acts<1||!Number.isSafeInteger(b.bytes)||b.bytes<1)fail('missing storage budget')};
const base=(store:string)=>join(store,'ledger','place-acts');
const at=(store:string,id:string)=>{if(!id||id.includes('\0'))fail('missing identity');return join(base(store),'committed-'+encodeURIComponent(id))};
function storedInventory(store:string,b:PlaceActBudget):{names:readonly string[];bytes:number} {
 budget(b);if(!existsSync(base(store)))return{names:[],bytes:0};
 const names=readdirSync(base(store)).filter(n=>n.startsWith('committed-'));if(names.length>b.acts)fail('stored act budget');
 let bytes=0;for(const name of names)for(const member of ['context.json','receipts.json','originals.json']){const stat=statSync(join(base(store),name,member));if(!stat.isFile()||(bytes+=stat.size)>b.bytes)fail('stored aggregate byte budget')}
 return{names,bytes};
}
function readBundle(path:string,b:PlaceActBudget):PlaceActBundle {
 budget(b);let bytes=0;const read=(name:string)=>{const fd=openSync(join(path,name),'r');try{const size=fstatSync(fd);if(!size.isFile()||size.size>b.bytes-bytes)fail('stored byte budget');
   const data=Buffer.alloc(size.size);let read=0;while(read<data.length){const count=readSync(fd,data,read,data.length-read,null);if(!count)fail('stored member changed while reading');read+=count}
   if(readSync(fd,Buffer.alloc(1),0,1,null)!==0)fail('stored member changed while reading');bytes+=read;return new TextDecoder('utf-8',{fatal:true}).decode(data);
  }finally{closeSync(fd)}};
 try{const context=read('context.json'),receipts=JSON.parse(read('receipts.json')),originals=JSON.parse(read('originals.json'));return{context,receipts,originals}}catch(e){if(e instanceof Error&&e.message.startsWith('REFUSE·'))throw e;return fail('committed bundle unreadable')}
}
function authenticated(bundle:PlaceActBundle,id:string,contract:TrustedClockContract){
 const result=placeActReceiptsOf(bundle.context,bundle.receipts,contract),decoded=readPlaceActContext(bundle.context,contract.budget);
 if(result.identity!==id||JSON.stringify(bundle.originals)!==JSON.stringify(decoded.places.map(p=>p.records)))fail('stored original/context identity mismatch');
 return decoded;
}
/** Historical result reads never produce a current authorization permit. */
export function placeActResult(store:string,id:string,trust:Pick<PlaceActTrust,'historical'>,limits:PlaceActBudget):PlaceActBundle|undefined {
 const path=at(store,id);if(!existsSync(path))return undefined;const bundle=readBundle(path,limits);authenticated(bundle,id,trust.historical(bundle.context));return bundle;
}
/** Each receiver chain advances independently. Initial heads are explicit,
 * authenticated host inputs, not inferred zero or legacy global epochs. */
export function placeActHeads(store:string,initial:readonly PlaceActHead[],trust:Pick<PlaceActTrust,'historical'|'contract'>,limits:PlaceActBudget):readonly PlaceActHead[] {
 budget(limits);if(!initial.length||new Set(initial.map(h=>h.place)).size!==initial.length)fail('missing/ambiguous initial heads');
 const heads=new Map(initial.map(h=>{receiverClock(h.epoch,fail);if(!h.identity)fail('missing initial head');return[h.place,{...h}] as const}));
 if(!existsSync(base(store)))return[...heads.values()];
 const {names}=storedInventory(store,limits);
 const pending=names.map(name=>{const id=decodeURIComponent(name.slice(10)),bundle=readBundle(join(base(store),name),limits);const context=authenticated(bundle,id,trust.historical(bundle.context));if(context.root.namespace!==trust.contract.root.namespace)fail('stored clock namespace mismatch');return{id,context}});
 while(pending.length){const next=pending.findIndex(a=>a.context.places.every(p=>heads.get(p.place)?.identity===p.previous));if(next<0)fail('receiver chain fork or missing predecessor');
  const act=pending.splice(next,1)[0]!;for(const p of act.context.places){const prior=heads.get(p.place)!;const epoch=receiverClock(prior.epoch,fail)+1;if(!Number.isSafeInteger(epoch)||receiverClock(p.epoch,fail)!==epoch)fail('receiver chain clock mismatch');heads.set(p.place,{place:p.place,identity:act.id,epoch:p.epoch})}
 }
 return[...heads.values()];
}
/** Context, exact original bytes and complete signed receipts have one visibility
 * point. Real Root guard exclusion spans final authority/head comparison and
 * publication; this does not activate a CLI profile or reinterpret local-act@1. */
/** Native persistence adapter. The transaction below is also the CLI path. */
export function nativePlaceActPersistence(store:string,storage:PublicationStorage=nativePublicationStorage):PlaceActPersistence {
 store=canonicalActStore(store);
 return {
  exclusive:(regions,run)=>{const enter=regions.includes('')?underTheRegions:underAuthorityRegions;return enter(store,regions,'place act',()=>underRootProjection(store,'place act publication',run))},
  result:(identity,trust,limits)=>placeActResult(store,identity,trust,limits),
  inventory:limits=>storedInventory(store,limits),
  heads:(trust,limits)=>placeActHeads(store,trust.initialHeads,trust,limits),
  publish:(identity,files)=>publishBundle(at(store,identity),files,storage),
 };
}
export async function commitPlaceAct(store:string,encoded:string,receipts:readonly PlaceReceipt[],trust:PlaceActTrust,limits:PlaceActBudget,storage:PublicationStorage=nativePublicationStorage){
 requireEffects('place act commitment');
 return transactPlaceAct(encoded,receipts,trust,limits,nativePlaceActPersistence(store,storage));
}

/** Enumerates only committed, historically authenticated carriers. Namespace
 * projection is a caller's separate pure operation, never current permission. */
export function committedPlaceActResults(store:string,trust:Pick<PlaceActTrust,'historical'>,limits:PlaceActBudget):readonly {identity:string;bundle:PlaceActBundle}[] {
 const {names}=storedInventory(store,limits);return names.map(name=>{const identity=decodeURIComponent(name.slice(10)),bundle=placeActResult(store,identity,trust,limits);if(!bundle)fail('committed carrier vanished');return{identity,bundle:bundle!}});
}
