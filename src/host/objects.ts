import {canonical,parse,objectHistory,validateObjectContext} from '@lapxo/topos/wire';
import {objectProvider} from '@lapxo/topos/object-provider';
import {authorityFor,rootSigner} from '../fold/signers.ts';
import {signaturesOf} from '../fold/digests.ts';
import {storeOf} from '../land/ledger.ts';
import {contextProviderServices} from './selected-topos.ts';
import {foldClaims} from '../fold/claims.ts';
/** Bound supplies host authority and I/O; topos owns grammar, selection and context validation. */
export async function admittedObjects(root:string,lines:readonly string[],emit:(text:string)=>void=()=>{},_requireContextClosure=false){
 const history=objectHistory(lines);if(history.kind!=='fact')throw Error(`REFUSE·wire ${history.why}`);
 const authority=authorityFor(lines,rootSigner(root),signaturesOf(storeOf(root)).admitted);
 const admittedConfiguration=history.value.configuration.filter(fields=>authority.of(canonical(fields)).kind==='admitted').map(fields=>canonical(fields));
 const configuration=foldClaims(admittedConfiguration).standing.flatMap(line=>{const got=parse(line);return got.kind==='fact'?[got.value.fields]:[];});
 const context=await objectProvider(history.value.objects,history.value.configuration,{admit:fields=>authority.of(canonical(fields)).kind==='admitted',emit,...contextProviderServices(storeOf(root))});
 const checked=validateObjectContext(history.value.objects,context);if(checked.kind!=='fact')throw Error(`REFUSE·context ${checked.why}`);
 return {records:checked.value,context,configuration};
}
