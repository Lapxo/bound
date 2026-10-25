import {topos_core_PLACE_ACT_CONTEXT as PLACE_ACT_CONTEXT,type topos_core_PlaceAct as PlaceAct,type topos_core_PlaceReceipt as PlaceReceipt} from "../../vendor/library.js";
import {foldClaims,fieldOf} from '../fold/claims.ts';
import type {PortablePlaceContext} from './root-clock-source.ts';

export interface ContextualStandingSnapshot {
 readonly rootHistory:readonly string[];
 readonly legacyPlaces:readonly {readonly place:string;readonly history:readonly string[]}[];
 readonly contexts:readonly PortablePlaceContext[];
}
/** Projection only, after the caller authenticates the complete carrier. The
 * CLI and in-process reader use this same fold and output shape. */
export function projectContextualStanding(root:readonly string[],legacy:ContextualStandingSnapshot['legacyPlaces'],contexts:readonly PortablePlaceContext[],decoded:readonly {readonly identity:string;readonly context:PlaceAct}[]){
 const groups=new Map<string,{namespace:string;place:string;lines:string[];contexts:{identity:string;context:string;receipts:readonly PlaceReceipt[]}[]}>();
 for(const act of contexts){const context=decoded.find(one=>one.identity===act.identity)!.context;
  for(const p of context.places){const key=JSON.stringify([context.root.namespace,p.place]),group=groups.get(key)??{namespace:context.root.namespace,place:p.place,lines:[],contexts:[]};
   group.lines.push(...p.records);group.contexts.push({identity:act.identity,context:act.context,receipts:act.receipts});groups.set(key,group);
  }
 }
 const legacyPlaces=legacy.map(place=>({namespace:'legacy-global',place:place.place,standing:foldClaims(place.history).standing.filter(line=>fieldOf(line,'value')!=='withdraw'),history:place.history}));
 return {profile:PLACE_ACT_CONTEXT,root,legacyPlaces,contexts,places:[...groups.values()].map(group=>{const folded=foldClaims(group.lines);return {namespace:group.namespace,place:group.place,standing:folded.standing.filter(line=>fieldOf(line,'value')!=='withdraw'),retracted:folded.retracted,superseded:folded.superseded,forks:folded.forks,contexts:group.contexts}})};
}
