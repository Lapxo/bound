import {canonical,parse,objectHistory,validateObjectContext} from '@lapxo/topos/wire';
import {objectProvider} from '@lapxo/topos/object-provider';
import {authorityFor,rootSigner} from '../fold/signers.ts';
import {signaturesOf} from '../fold/digests.ts';
import {storeOf} from '../land/ledger.ts';
import {toposAt,contextModuleAt} from './selected-topos.ts';
import {foldClaims} from '../fold/claims.ts';
import {usesWasmObject} from '../wasm/object.ts';
/** Bound supplies host authority and I/O; topos owns grammar, selection and context validation. */
export async function admittedObjects(root:string,lines:readonly string[],emit:(text:string)=>void=()=>{},requireContextClosure=false){
 const history=objectHistory(lines);if(history.kind!=='fact')throw Error(`REFUSE·wire ${history.why}`);
 const authority=authorityFor(lines,rootSigner(root),signaturesOf(storeOf(root)).admitted);
 const admittedConfiguration=history.value.configuration.filter(fields=>authority.of(canonical(fields)).kind==='admitted').map(fields=>canonical(fields));
 const configuration=foldClaims(admittedConfiguration).standing.flatMap(line=>{const got=parse(line);return got.kind==='fact'?[got.value.fields]:[];});
 const verifyClosure=requireContextClosure||usesWasmObject(configuration),declaredModules=new Map<string,readonly string[]>();
 const context=await objectProvider(history.value.objects,history.value.configuration,{admit:fields=>authority.of(canonical(fields)).kind==='admitted',emit,topos:digest=>{
   const selected=toposAt(digest,storeOf(root));
   if(verifyClosure)for(const offer of selected.parts.filter(fields=>fields.kind==='check'&&fields.value)){
     const dependencies=[...new Set((offer.restsOn??'').split('|').filter(Boolean))].sort(),prior=declaredModules.get(offer.value!);
     if(prior&&JSON.stringify(prior)!==JSON.stringify(dependencies))throw Error('REFUSE·context module has conflicting declared closures');
     declaredModules.set(offer.value!,dependencies);
   }
   return selected;
 },module:digest=>{
   const dependencies=declaredModules.get(digest);
   if(verifyClosure&&dependencies===undefined)throw Error('REFUSE·context module has no declared closure');
   return contextModuleAt(digest,storeOf(root),verifyClosure?dependencies:undefined);
 }});
 const checked=validateObjectContext(history.value.objects,context);if(checked.kind!=='fact')throw Error(`REFUSE·context ${checked.why}`);
 return {records:checked.value,context,configuration};
}
