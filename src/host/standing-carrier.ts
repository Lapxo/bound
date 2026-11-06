import {PLACE_ACT_CONTEXT,type PlaceAct,type PlaceReceipt} from '@lapxo/topos/core';
import {foldClaims,fieldOf} from '../fold/claims.ts';
import type {PortablePlaceContext} from './root-clock-source.ts';

export interface ContextualStandingSnapshot {
 readonly rootHistory:readonly string[];
 readonly legacyPlaces:readonly {readonly place:string;readonly history:readonly string[]}[];
 readonly contexts:readonly PortablePlaceContext[];
}
/** Projection only, after the caller authenticates the complete carrier. The
 * CLI and in-process reader use this same fold and output shape. */
export function contextualStandingGroups(contexts:readonly PortablePlaceContext[],decoded:readonly {readonly identity:string;readonly context:PlaceAct}[]){
 const groups=new Map<string,{namespace:string;place:string;lines:string[];contexts:{identity:string;context:string;receipts:readonly PlaceReceipt[]}[]}>();
 for(const act of contexts){const context=decoded.find(one=>one.identity===act.identity)!.context;
  for(const p of context.places){const key=JSON.stringify([context.root.namespace,p.place]),group=groups.get(key)??{namespace:context.root.namespace,place:p.place,lines:[],contexts:[]};
   group.lines.push(...p.records);group.contexts.push({identity:act.identity,context:act.context,receipts:act.receipts});groups.set(key,group);
  }
 }
 return [...groups.values()];
}

type Fold=ReturnType<typeof foldClaims>;
export function assembleContextualStanding(root:readonly string[],legacy:ContextualStandingSnapshot['legacyPlaces'],contexts:readonly PortablePlaceContext[],groups:ReturnType<typeof contextualStandingGroups>,legacyFolds:readonly Fold[],groupFolds:readonly Fold[]){
 const visible=(fold:Fold)=>fold.standing.filter(line=>fieldOf(line,'value')!=='withdraw');
 const legacyPlaces=legacy.map((place,i)=>({namespace:'legacy-global',place:place.place,standing:visible(legacyFolds[i]!),history:place.history}));
 return {profile:PLACE_ACT_CONTEXT,root,legacyPlaces,contexts,places:groups.map((group,i)=>{
  const {retracted,superseded,forks}=groupFolds[i]!;
  return {namespace:group.namespace,place:group.place,standing:visible(groupFolds[i]!),retracted,superseded,forks,contexts:group.contexts};
 })};
}

export function projectContextualStanding(root:readonly string[],legacy:ContextualStandingSnapshot['legacyPlaces'],contexts:readonly PortablePlaceContext[],decoded:readonly {readonly identity:string;readonly context:PlaceAct}[]){
 const groups=contextualStandingGroups(contexts,decoded);
 return assembleContextualStanding(root,legacy,contexts,groups,legacy.map(p=>foldClaims(p.history)),groups.map(g=>foldClaims(g.lines)));
}
