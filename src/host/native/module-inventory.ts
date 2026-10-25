import {compareStrings} from '../order.ts';
import {topos_wire_canonical as canonical} from "../../../vendor/library.js";
import {verifyModuleDelivery,type ClosureDeliveryLimits} from './module-delivery.ts';

/** Source names and versions are declarations supplied by the receiving host.
 * The snapshot pins their bytes; this projection does not authenticate a
 * publisher's version claim or infer symbol reachability.
 */
export interface ModuleInventorySource {
 readonly snapshot:string;
 readonly source:string;
 readonly version:string;
}
export interface ModuleInventoryLine extends ModuleInventorySource {
 readonly unit:'module';
 readonly module:string;
 readonly digest:string;
 /** The verified closure which reached this module, not an immediate importer. */
 readonly reachedFrom:string;
}
export interface ModuleInventory {
 readonly format:'verified-module-inventory/1';
 readonly delivery:string;
 readonly closure:string;
 readonly modules:readonly ModuleInventoryLine[];
 /** Existing canonical wire; descriptive module metadata stays in about. */
 readonly lines:string;
}
export interface ModuleInventoryContext {readonly scope:string;readonly by:string;readonly at:string}

/** Project a verified delivery without a second traversal, I/O, compilation,
 * source transformation or execution. Notices remain in the delivery, separate
 * from executable module units. Extra source declarations cannot add modules.
 */
export function moduleInventory(bytes:Uint8Array,expected:string,limits:ClosureDeliveryLimits,sources:readonly ModuleInventorySource[],context:ModuleInventoryContext):ModuleInventory {
 const delivery=verifyModuleDelivery(bytes,expected,limits);
 const declared=new Map<string,ModuleInventorySource>();
 const reached=new Set(delivery.manifest.modules.map(m=>m.snapshot));
 if(!context||!context.scope||!context.by||!context.at)throw Error('REFUSE·module inventory missing declaration context');
 if(!Array.isArray(sources)||sources.length!==reached.size)throw Error('REFUSE·module inventory source coverage');
 for(const one of sources){
  if(!one||!reached.has(one.snapshot)||typeof one.source!=='string'||!one.source||typeof one.version!=='string'||!one.version||declared.has(one.snapshot))throw Error('REFUSE·module inventory invalid/duplicate source');
  declared.set(one.snapshot,one);
 }
 const modules=delivery.manifest.modules.map(m=>{
  const one=declared.get(m.snapshot);
  if(!one)throw Error('REFUSE·module inventory missing source '+m.snapshot);
  return {unit:'module' as const,source:one.source,version:one.version,snapshot:m.snapshot,module:m.coordinate,digest:m.digest,reachedFrom:delivery.closure};
 }).sort((a,b)=>compareStrings(JSON.stringify([a.snapshot,a.module]),JSON.stringify([b.snapshot,b.module])));
 const lines=modules.map(m=>canonical({scope:context.scope+'/'+m.snapshot.slice(7)+'/'+encodeURIComponent(m.module),role:'writes',form:'alphabet',measure:'digest',value:m.digest,by:context.by,at:context.at,about:JSON.stringify({format:'module-inventory-record/1',...m})})+'\n').join('');
 return {format:'verified-module-inventory/1',delivery:delivery.digest,closure:delivery.closure,modules,lines};
}
