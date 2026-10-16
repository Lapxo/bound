/** Native ports for authenticated #bound opening; trusted policy belongs to the selected local place. */
import{sha256 as hash,isSha256}from'./hash.ts';
import{canonical,parse,transportSelection}from'@lapxo/topos/wire';
import{semanticStandingBytes}from'@lapxo/topos/standing';
import{authorityFor,rootSigner}from'../fold/signers.ts';
import{eraOf}from'../fold/digests.ts';
import{lockStanding,lockLines}from'../fold/keys.ts';
import{signedOwnerLines}from'../cli/owner.ts';
import{admittedObjects}from'./objects.ts';
import{storeOf}from'../land/ledger.ts';
import{objectFold}from'../engine/index.ts';
import{toposAt,contextModuleAt,contentAt}from'./selected-topos.ts';
import{transportBytes}from'./ports/transport.ts';
import{decodeReference}from'./reference-profile.ts';
import{inspectAuthenticatedReference}from'./reference-authenticated.ts';
import{verifyBytes}from'./adapters/keys/ed25519.ts';
export function authenticatedReferenceSelected(standing:readonly string[]):boolean{
 const selected=standing.flatMap(line=>{const p=parse(line);return p.kind==='fact'&&p.value.fields.scope==='reference/authentication'?[p.value.fields]:[]});
 if(!selected.length)return false;if(selected.length!==1||selected[0]!.value!=='authenticated-standing@1')throw Error('REFUSE·reference conflicting or unknown authentication profile');return true;
}
export async function openAuthenticatedReference(root:string,fragment:string){
 const store=storeOf(root),standing=lockStanding(store),era=eraOf(standing),authority=authorityFor(lockLines(store),rootSigner(root),era.admitted);if(!authenticatedReferenceSelected(standing))throw Error('REFUSE·reference no admitted authenticated-standing@1 profile');
 const one=(scope:string)=>{const found=standing.flatMap(line=>{const p=parse(line);return p.kind==='fact'&&p.value.fields.scope===scope?[{line,fields:p.value.fields}]:[]});if(found.length!==1||found[0]!.fields.role!=='writes'||found[0]!.fields.measure!=='id'||authority.of(found[0]!.line).kind!=='admitted')throw Error('REFUSE·reference missing, conflicting or unauthenticated '+scope);return found[0]!.fields.value!;};
 if(one('reference/authentication')!=='authenticated-standing@1')throw Error('REFUSE·reference authentication profile');const snapshot=one('reference/snapshot'),epochText=one('reference/epoch'),proofScope=one('reference/proof-scope'),recordsText=one('reference/records');if(!isSha256(snapshot)||!/^\d+$/.test(epochText)||!Number.isSafeInteger(Number(epochText))||!/^\d+$/.test(recordsText)||!Number.isSafeInteger(Number(recordsText))||Number(recordsText)<1||!proofScope)throw Error('REFUSE·reference authority snapshot or resource contract');
 const reference=decodeReference(fragment);
 // Provider selection is made from HOST-declared cells/configuration, never carrier-picked code.
 const held=await admittedObjects(root,signedOwnerLines(store),()=>{},true);if(!held.records.some(r=>r.record==='cell'))throw Error('REFUSE·reference host has no declared object interpretation');const context=held.context,policy=held.configuration.map(fields=>canonical(fields)),selection=transportSelection(held.configuration,new URL(reference.source).protocol.slice(0,-1));if(!selection)throw Error('REFUSE·reference no admitted transport policy');
 const implementations=[...new Set(held.records.filter(r=>r.record==='cell').map(r=>r.fields.topos!))].sort().map(pin=>{const selected=toposAt(pin,store),selectors=selected.parts.filter(f=>f.scope==='wire/topos/context-view');if(selectors.length!==1)throw Error('REFUSE·reference host context selector');const offers=selected.parts.filter(f=>f.kind==='check'&&f.view===selectors[0]!.value);if(offers.length!==1)throw Error('REFUSE·reference host context offer');const offer=offers[0]!,closure=[...new Set((offer.restsOn??'').split('|').filter(Boolean))].sort();for(const digest of closure)contentAt(digest,store);return[pin,offer.value,closure]});
 const result=await inspectAuthenticatedReference(fragment,{snapshot,epoch:Number(epochText),proofScope,policy:hash(semanticStandingBytes(policy)),formImplementation:hash(JSON.stringify(implementations)),signers:authority.admitted,algorithms:era.admitted,objects:context,maxBytes:selection.responseBytes,maxRecords:Number(recordsText),digestBytes:hash,verifyBytes,fetchBytes:(source,blob)=>transportBytes(source,blob,policy)});
 return{...result,readings:objectFold(result.records,context)};
}
