import type {Request} from '@lapxo/topos/contract';
import type {ContentReadPort} from '../engine/ports.ts';
import {dispatchSelectedCapsuleInWorker} from './worker-capsule.ts';
import type {SelectedWorkerCapsuleContext} from './worker-capsule.ts';
import type {NativeHostInstrument} from './native-receiver.ts';
import {withHostCall} from './call-context.ts';
import {underRootAuthority} from '../land/act.ts';
import {storeOf} from '../land/ledger.ts';
import {authenticatedStanding} from './admitted-place.ts';
import {refuseHost as fail} from './host-controls.ts';

export interface NativeWorkerCapsuleContext extends Omit<SelectedWorkerCapsuleContext,'host'|'instrument'>{
 readonly root:string;
 readonly instrument:NativeHostInstrument;
}

/** Root-scoped native host entry. The receiver supplies a selected offer and
 * content port, while its current authenticated lock supplies the dependency. */
export async function dispatchNativeCapsuleInWorker(
 context:NativeWorkerCapsuleContext,requests:readonly Request[],ports:{readonly read:ContentReadPort},signal?:AbortSignal,
){
 const {root,instrument,...selected}=structuredClone(context);
 if(!root||!instrument?.runtime||!Array.isArray(requests)||requests.length>selected.limits.batch)return fail('context');
 const batch:readonly Request[]=structuredClone(requests);
 if(batch.some(request=>!request||request.place!==undefined))return fail('context');
 if(signal?.aborted)return fail('cancelled');
 return withHostCall({instrumentName:instrument.name,runtime:instrument.runtime,output:()=>{}},()=>
  underRootAuthority(storeOf(root),'capsule worker dispatch',async()=>{
   const host=authenticatedStanding(root);
   return dispatchSelectedCapsuleInWorker({...selected,host,instrument:instrument.runtime.lock},batch,ports,signal);
  }));
}
