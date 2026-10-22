import{existsSync}from'node:fs';
import{storeOf}from'../land/ledger.ts';
import{admissionAnchor}from'../fold/admission-history.ts';
import{authenticatedStanding}from'./admitted-place.ts';
import{BoundRefusal}from'./refusals.ts';
/** Inspect before internal locks can create a store. Only classic land may found it. */
export function nativePlaceState(root:string):'birth'|'admitted'{
 if(!existsSync(storeOf(root)))return'birth';
 try{admissionAnchor(root);if(!authenticatedStanding(root).length)throw Error('no admitted history');return'admitted'}
 catch{throw new BoundRefusal('host/foundation-state','REFUSE·host/foundation-state')}
}
