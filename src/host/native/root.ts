import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {declaredRootClockSource} from '../root-clock-source.ts';
import {foldClaims,fieldOf} from '../../fold/claims.ts';
import {assertRootAuthorityProtection,type RootAuthorityProtection} from '../../land/act.ts';
import type {RootStanding,RootAuthorityGuard} from './reading.ts';
import type {RootContext} from '@lapxo/topos/core';
import {withCommittedLocalActObservation} from '../ports/local-act.ts';
/** Values come from the fixed parent argv chain while it retains actual Root
 * protection. No world packet supplies the store, parent, cursor or verifier.
 */
export interface NativeRootInheritance {readonly store:string;readonly parent:number;readonly expected:RootContext}
const fail=(why:string):never=>{throw Error('REFUSE·native Root '+why)};
const same=(a:RootContext,b:RootContext)=>JSON.stringify(a)===JSON.stringify(b);
export function currentNativeRoot(store:string,parent:number,proof:RootAuthorityProtection):{readonly context:RootContext;readonly root:RootStanding}{
 assertRootAuthorityProtection(proof,store,parent);
 return withCommittedLocalActObservation(store,()=>{
 // The constructor has just authenticated this cursor and its receiver heads.
 // Reuse that result only within this protected synchronous invocation. Calling
 // trust.current() here would repeat the same full construction immediately;
 // subsequent gates still construct their own fresh source under the lease.
 const root=dirname(store),source=declaredRootClockSource(root),current=source.trust.contract.root;
 const {history,anchor:signer,algorithms:eras}=source.observation;
 const live=foldClaims(history).standing.filter(line=>fieldOf(line,'value')!=='withdraw');
 // The source constructor authenticates the complete history at each original
 // admission snapshot. Current port eligibility stays a separate SDK check.
 const limits=source.resources;
 if(history.length>limits.lines||history.reduce((bytes,line)=>bytes+Buffer.byteLength(line),0)>limits.bytes)fail('Root declared history resources exceeded');
 assertRootAuthorityProtection(proof,store,parent);
 return {context:current,root:{history,live,signer,eras,epoch:Number(current.epoch),budget:{lines:limits.lines,bytes:limits.bytes}}};
 });
}
export function inheritedNativeRoot(inherited:NativeRootInheritance,proof:RootAuthorityProtection):RootStanding{
 const current=currentNativeRoot(inherited.store,inherited.parent,proof);
 if(!same(current.context,inherited.expected))fail('actual authority cursor or dependencies changed');
 return current.root;
}
export function inheritedNativeGuard(inherited:NativeRootInheritance,proof:RootAuthorityProtection):RootAuthorityGuard{
 return {async withCurrent<T>(body:(root:RootStanding)=>Promise<T>):Promise<T>{const before=inheritedNativeRoot(inherited,proof),result=await body(before),after=inheritedNativeRoot(inherited,proof);if(createHash('sha256').update(JSON.stringify(before)).digest('hex')!==createHash('sha256').update(JSON.stringify(after)).digest('hex'))fail('Root changed during native execution');return result}};
}
