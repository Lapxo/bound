import {foldClaims} from '../../dist/fold/claims.js';
import {withdrawal} from '../../dist/land/withdraw.js';
import {regionsOf,packRegions} from '../../dist/fold/region.js';
import {deliverModuleClosure} from '../../dist/host/native/module-delivery.js';
import {moduleInventory} from '../../dist/host/native/module-inventory.js';
/** Test adapter only. The pinned JSON is data; all semantics stay in native functions. */
export function nativeParity(input:Uint8Array):Uint8Array{
 const asked=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input));let result:unknown;
 switch(asked.operation){
  case 'fold':result=foldClaims(asked.lines);break;
  case 'withdrawal':result=withdrawal(asked.withdraws,asked.held);break;
  case 'regions':result=packRegions(regionsOf(asked.standing,asked.ceilings,asked.cells));break;
  case 'inventory':{
   const snapshots=asked.snapshots.map((one:any)=>({identity:one.identity,entry:one.entry,members:new Map(one.members.map((m:any)=>[m.coordinate,{source:m.source,digest:m.digest}]))}));
   const entries=new Map(asked.needs.map((name:string,i:number)=>[name,snapshots[i]]));
   const delivery=deliverModuleClosure(asked.needs,entries,()=>undefined,asked.limits);
   result=moduleInventory(delivery.bytes,delivery.digest,asked.limits,asked.sources,asked.context);break;
  }
  default:throw Error('Unsupported fixture operation');
 }
 return new TextEncoder().encode(JSON.stringify(['fact',result])+'\n');
}
