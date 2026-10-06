import {canonical,objectHistory,validateObjectContext} from '@lapxo/topos/wire';
import {objectProvider} from '@lapxo/topos/object-provider';
import {authorityFor,rootSigner} from '../fold/signers.ts';
import {signaturesOf} from '../fold/digests.ts';
import {storeOf} from '../land/ledger.ts';
import {toposAt,contextModuleAt} from './selected-topos.ts';
/** Bound supplies host authority and I/O; topos owns grammar, selection and context validation. */
export async function admittedObjects(root:string,lines:readonly string[],emit:(text:string)=>void=()=>{}){
 const history=objectHistory(lines);if(history.kind!=='fact')throw Error(`REFUSE·wire ${history.why}`);
 const authority=authorityFor(lines,rootSigner(root),signaturesOf(storeOf(root)).admitted);
 const context=await objectProvider(history.value.objects,history.value.configuration,{admit:fields=>authority.of(canonical(fields)).kind==='admitted',emit,topos:toposAt,module:contextModuleAt});
 const checked=validateObjectContext(history.value.objects,context);if(checked.kind!=='fact')throw Error(`REFUSE·context ${checked.why}`);
 return {records:checked.value,context};
}
