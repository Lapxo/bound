/** Optional native exclusion adapter. Authentication stays in trusted ports;
 * no Root, grant, clock advance or owner action is created here. */
import {isAbsolute} from 'node:path';
import {underAuthorityRegions,withActHost} from '../../src/land/act.ts';
import type {ReadingIdentityContext} from '@lapxo/topos/contract';
const fail=(code:string):never=>{throw Object.assign(Error(code),{code})};
interface Ports {
 readContext(signal?:AbortSignal):ReadingIdentityContext|Promise<ReadingIdentityContext>;
 assertExecution(context:ReadingIdentityContext,descriptor:unknown,signal?:AbortSignal):void|Promise<void>;
 authorize(context:ReadingIdentityContext,requests:readonly unknown[],signal?:AbortSignal):void|Promise<void>;
 assertCurrent(signal?:AbortSignal):void|Promise<void>;
}
interface Selection extends Ports {store:string;regions:readonly string[];name:string}
export function createNativeReadingLease({store,regions,name,readContext,assertExecution,authorize,assertCurrent}:Selection){
 if(typeof store!=='string'||!isAbsolute(store)||!Array.isArray(regions)||!regions.length||regions.some(r=>typeof r!=='string'||!r)||typeof name!=='string'||!name||[readContext,assertExecution,authorize,assertCurrent].some(f=>typeof f!=='function'))fail('reading-lease/selection');
 const fixed=Object.freeze([...regions]);
 return Object.freeze({withLease:async(run:(lease:Ports)=>Promise<void>,signal?:AbortSignal)=>withActHost({name,report:()=>{},signal},()=>underAuthorityRegions(store,fixed,name,async()=>{
  let active=true;const check=()=>{if(!active)fail('reading-lease/ended');if(signal?.aborted)fail('reading-lease/cancelled')};
  const guarded=<A extends unknown[],R>(fn:(...args:A)=>R)=>async(...args:A):Promise<Awaited<R>>=>{check();const value=await fn(...args);check();return value};
  try{return await run(Object.freeze({readContext:guarded(readContext),assertExecution:guarded(assertExecution),authorize:guarded(authorize),assertCurrent:guarded(assertCurrent)}))}finally{active=false}
 }))});
}
