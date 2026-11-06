import {readContextualStandingWithProjection} from './in-process-context.ts';
import {assembleContextualStanding,contextualStandingGroups} from './standing-carrier.ts';
import {foldedEvidence} from '@lapxo/topos/contract';
import {fieldsOf,isConfig} from '../fold/claims.ts';
import type {ContentReadPort} from '../engine/ports.ts';
import {authenticatedStandingRecords,publishedStandingLines} from './standing-projection.ts';
import {readRootStandingWithProjection} from './in-process.ts';
import type {RootStandingHostContext,RootStandingHostResult} from './in-process.ts';
import {evaluateInstalledBoundCoreInWorker,installedRustCore} from './worker-host.ts';
import {refuseBound as refuse} from './refusals.ts';

/** One global fold. Transport blocks never partition the claim algebra. */
export async function foldWorkerHistory(history:readonly string[], timeoutMs:number, signal?:AbortSignal){
 const records=history.map(line=>({line,fields:fieldsOf(line),is_config:isConfig(line)}));
 const prepared=new TextEncoder().encode(JSON.stringify({profile:'bound-fold-prepared@1',records}));
 const bytes=await evaluateInstalledBoundCoreInWorker({operation:'history',prepared},{lifetimeMs:timeoutMs,signal});
 const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(result[0]==='refuse'&&typeof result[1]==='string')refuse(result[1]);
 if(result[0]!=='fact'||!Array.isArray(result[1]?.standing))refuse('fold/worker-projection');
 return result[1] as ReturnType<typeof import('../fold/claims.ts').foldClaims>;
}

export async function authenticatedWorkerStanding(history:readonly string[],anchor:RootStandingHostContext['anchor'],timeoutMs:number,signal?:AbortSignal){
 const admitted=[...new Set(authenticatedStandingRecords(history,anchor))];
 const projected=await foldWorkerHistory(admitted,timeoutMs,signal);
 const standing=foldedEvidence(admitted,{classification:()=> 'local',fold:()=>projected.standing}).standing;
 return publishedStandingLines(standing);
}

/** Authenticates the offered snapshot with the same receiver-selected anchor as
 * the in-process host. The Worker receives only admitted projection inputs. */
export function readRootStandingInWorker(
 context:RootStandingHostContext,
 ports:{readonly read:ContentReadPort},
):Promise<RootStandingHostResult>{
 return readRootStandingWithProjection(context,ports,(history,anchor,limits,signal)=>
  authenticatedWorkerStanding(history,anchor,limits.timeoutMs,signal),installedRustCore.digest);
}


/** Keeps each receiver namespace and committed context in its original carrier. */
export function readContextualStandingInWorker(context:RootStandingHostContext,ports:{readonly read:ContentReadPort}){
 return readContextualStandingWithProjection(context,ports,(timeoutMs,signal)=>{
  const deadline=performance.now()+timeoutMs;
  const remaining=()=>{
   const ms=Math.floor(deadline-performance.now());
   if(ms<1)refuse('fold/worker-lifetime');
   return ms;
  };
  return {
   root:(lines,anchor)=>authenticatedWorkerStanding(lines,anchor,remaining(),signal),
   async places(root,legacy,contexts,decoded){
    const groups=contextualStandingGroups(contexts,decoded);
    const legacyFolds=[],groupFolds=[];
    for(const place of legacy)legacyFolds.push(await foldWorkerHistory(place.history,remaining(),signal));
    for(const group of groups)groupFolds.push(await foldWorkerHistory(group.lines,remaining(),signal));
    return assembleContextualStanding(root,legacy,contexts,groups,legacyFolds,groupFolds);
   },
  };
 },installedRustCore.digest);
}
