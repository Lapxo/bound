import {openSync,fstatSync,readSync,closeSync} from 'node:fs';
import {readPlaceActContext,PLACE_ACT_CONTEXT,type PlaceReceipt} from '@lapxo/topos/core';
import {declaredRootClockSource,hasRootClockSource} from './root-clock-source.ts';
import {commitPlaceAct,placeActResult,committedPlaceActResults} from './ports/place-act.ts';
import {placesIn} from '../fold/places.ts';
import {appliedHistoryIn} from '../fold/signed.ts';
import {storeOf} from '../land/ledger.ts';
import {authenticatedRootStanding} from './admitted-place.ts';
import {foldClaims,fieldOf} from '../fold/claims.ts';
const fail=(s:string):never=>{throw Error('REFUSE·contextual place '+s)};
function read(path:string,limit:number):string {
 const fd=openSync(path,'r');try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>limit)fail('batch byte budget');const data=Buffer.alloc(stat.size);let n=0;while(n<data.length){const got=readSync(fd,data,n,data.length-n,null);if(!got)fail('batch changed during read');n+=got}if(readSync(fd,Buffer.alloc(1),0,1,null))fail('batch changed during read');return new TextDecoder('utf8',{fatal:true}).decode(data)}finally{closeSync(fd)}
}
export function hasContextualPlace(root:string):boolean{return hasRootClockSource(root)}
/** Exact selected SDK frame plus complete pre-signed receiver statements. No
 * executable/verifier/epoch selection can be supplied by this envelope. */
export async function landContextualPlace(root:string,file:string){
 const selected=declaredRootClockSource(root),raw=read(file,selected.selection.budget.bytes);let packet:any;try{packet=JSON.parse(raw)}catch{return fail('invalid batch JSON')}
 if(!packet||Object.keys(packet).sort().join(',')!=='context,profile,receipts'||packet.profile!==PLACE_ACT_CONTEXT||typeof packet.context!=='string'||!Array.isArray(packet.receipts)||JSON.stringify(packet)+'\n'!==raw)fail('unsupported/noncanonical batch envelope');
 return commitPlaceAct(storeOf(root),packet.context,packet.receipts as readonly PlaceReceipt[],selected.trust,selected.selection.storageBudget);
}
export function contextualAct(root:string,identity:string){
 const selected=declaredRootClockSource(root),bundle=placeActResult(storeOf(root),identity,selected.trust,selected.selection.storageBudget);if(!bundle)return undefined;
 const all=new Map(committedPlaceActResults(storeOf(root),selected.trust,selected.selection.storageBudget).map(a=>[a.identity,a])),kept=new Set<string>(),contexts:{identity:string;context:string;receipts:readonly PlaceReceipt[];authority:ReturnType<typeof selected.authority>}[]=[];
 const visit=(id:string)=>{if(kept.has(id))return;const a=all.get(id);if(!a)return;kept.add(id);const decoded=readPlaceActContext(a.bundle.context,selected.selection.budget);for(const p of decoded.places)visit(p.previous);contexts.push({identity:a.identity,context:a.bundle.context,receipts:a.bundle.receipts,authority:selected.authority(a.bundle.context)})};visit(identity);
 return{profile:PLACE_ACT_CONTEXT,identity,context:bundle.context,receipts:bundle.receipts,contexts};
}
/** Carriers retain exact originals and authenticated context/receipts. Each
 * namespace folds independently; labels assert no statistical independence. */
export function contextualStanding(root:string){
 const selected=declaredRootClockSource(root),acts=committedPlaceActResults(storeOf(root),selected.trust,selected.selection.storageBudget);
 const groups=new Map<string,{namespace:string;place:string;lines:string[];contexts:{identity:string;context:string;receipts:readonly PlaceReceipt[]}[]}>();
 for(const act of acts){const decoded=readPlaceActContext(act.bundle.context,selected.selection.budget);for(const p of decoded.places){const key=JSON.stringify([decoded.root.namespace,p.place]),group=groups.get(key)??{namespace:decoded.root.namespace,place:p.place,lines:[],contexts:[]};group.lines.push(...p.records);group.contexts.push({identity:act.identity,context:act.bundle.context,receipts:act.bundle.receipts});groups.set(key,group)}}
 const legacyPlaces=placesIn(root).map(place=>{const history=appliedHistoryIn(root,place),folded=foldClaims(history);return{namespace:'legacy-global',place:[place,'TARGET.bound'].join('/'),standing:folded.standing.filter(line=>fieldOf(line,'value')!=='withdraw'),history}});
 return{profile:PLACE_ACT_CONTEXT,root:authenticatedRootStanding(root),legacyPlaces,contexts:acts.map(a=>({identity:a.identity,context:a.bundle.context,receipts:a.bundle.receipts,authority:selected.authority(a.bundle.context)})),places:[...groups.values()].map(group=>{const folded=foldClaims(group.lines);return{namespace:group.namespace,place:group.place,standing:folded.standing.filter(line=>fieldOf(line,'value')!=='withdraw'),retracted:folded.retracted,superseded:folded.superseded,forks:folded.forks,contexts:group.contexts}})};
}
