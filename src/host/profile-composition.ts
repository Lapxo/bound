import {sha256} from './hash.ts';
import {decodeProfileComposition,encodeProfileComposition,inspectProfileComposition} from '@lapxo/topos/contract';
import type {ProfileComposition,PolicyField,RecordBudget,CategoryPin} from '@lapxo/topos/contract';
import {fieldOf} from '../fold/claims.ts';
import {lockLines,lockStanding} from '../fold/keys.ts';
import {authorityFor,rootSigner} from '../fold/signers.ts';
import {ownRecordAdmitted} from '../fold/signed.ts';
import {signaturesOf} from '../fold/digests.ts';
import {wordOf} from '../fold/wire.ts';
import {storeOf} from '../land/ledger.ts';
import {widenedWithoutWitness} from '../judge/widening.ts';
import {BoundRefusal,refuseBound as refuse} from './refusals.ts';

export const profileDigest=(bytes:string):string=>sha256(bytes+'\n');
export interface ProfileFieldBinding {
 readonly contract:string; readonly field:PolicyField<unknown>;
 readonly scope:string; readonly role:'reads'|'writes'; readonly form:'interval'|'alphabet'; readonly measure:string;
}
export interface ProfileCompositionRequest {
 readonly root:string; readonly place:string; readonly profile:ProfileComposition;
 readonly profiles:ReadonlyMap<string,string>; readonly fields:readonly ProfileFieldBinding[];
 /** Original signed lines; drafts and parent bytes supply no authority. */
 readonly statements:readonly string[]; readonly budget:RecordBudget;
 readonly categories:readonly ReleaseCategory[];
}
/** Resolve pinned declarations, then reuse the consumer's current signature,
 * window, region coverage and widening judge. This prepares a lot; it never lands it. */
export function composeProfile(request:ProfileCompositionRequest){
 const {profile,profiles,budget}=request,bindings=new Map(request.fields.map(row=>[row.contract,row]));
 if(bindings.size!==request.fields.length)refuse('profile/ambiguous-field');
 let inspection:ReturnType<typeof inspectProfileComposition>;
 try{inspection=inspectProfileComposition(profile,{profiles,fields:new Map(request.fields.map(row=>[row.contract,row.field])),digest:sha256},budget)}
 catch(error){throw new BoundRefusal('profile/declaration','REFUSE·profile/declaration '+(error instanceof Error?error.message:'Topos declaration refused'))}
 if(inspection.status==='open')refuse('profile/missing-parent');
 if(inspection.fields!.some(row=>row.composition!=='compatible'))refuse('profile/incompatible');
 const store=storeOf(request.root),lock=lockLines(store),standing=lockStanding(store),algorithms=signaturesOf(store).admitted;
 const signers=authorityFor(lock,rootSigner(request.root),algorithms).admitted;
 const family=signers.some(signer=>!signer.coverage.includes('*'))?wordOf(standing,'families','region'):'';
 const admitted=request.statements.filter(line=>ownRecordAdmitted(line,request.place,family,signers,algorithms));
 const records=new Map<string,ProfileComposition>();
 function visit(id:string):void{if(records.has(id))return;const bytes=profiles.get(id);if(bytes===undefined)refuse('profile/missing-parent');const row=decodeProfileComposition(bytes!,budget);records.set(id,row);for(const parent of row.parents)visit(parent)}
 for(const parent of profile.parents)visit(parent);
 const own=profileDigest(encodeProfileComposition(profile,budget));records.set(own,profile);
 const lineFor=(row:ProfileComposition['fields'][number],source:string):string=>{
  const binding=bindings.get(row.contract);if(!binding||binding.field.coordinate!==row.coordinate) return refuse('profile/undeclared-field');
  const matches=admitted.filter(line=>fieldOf(line,'scope')===binding.scope&&fieldOf(line,'role')===binding.role&&fieldOf(line,'form')===binding.form&&fieldOf(line,'measure')===binding.measure&&fieldOf(line,'value')===row.value&&fieldOf(line,'restsOn')===source);
  if(matches.length!==1)return refuse(matches.length?'profile/ambiguous-authority':'profile/authority-required');return matches[0]!;
 };
 const inherited=[...records].filter(([id])=>id!==own).flatMap(([id,row])=>row.fields.map(field=>lineFor(field,id)));
 const proposed=profile.fields.map(field=>lineFor(field,own));
 // Every inherited constraint is checked, so two parents cannot conceal a widening.
 const witness=wordOf(standing,'at-classes','witness');
 for(const before of inherited){
  const sameField=proposed.filter(line=>['scope','role','form','measure'].every(key=>fieldOf(line,key)===fieldOf(before,key)));
  if(widenedWithoutWitness(sameField,[before],()=>true,witness).length)refuse('profile/widening-witness-required');
 }
 const lines=[...inherited,...proposed];
 // A non-meet transition still needs real signed authority, already checked above.
 const releases=releaseCategoryPins(inspection.pins!,request.categories,admitted);
 return {status:'prepared' as const,digest:own,inspection,lines,pins:inspection.pins!,releases};
}

export interface ReleaseCategory {
 readonly category:string;readonly class:string;readonly scope:string;
 readonly role:'reads'|'writes';readonly measure:'digest';
}
/** Exact declared category selection, with no code-family or scope-prefix rule. */
export function releaseCategoryPins(pins:readonly CategoryPin[],categories:readonly ReleaseCategory[],standing:readonly string[]):readonly string[]{
 const selected:string[]=[];
 for(const pin of pins){
  const declarations=categories.filter(row=>row.category===pin.category);
  if(!declarations.length)refuse('release/category-missing');
  if(declarations.length!==1)refuse('release/category-ambiguous');
  const category=declarations[0]!;
  if(category.class!==pin.class||pin.algorithm!=='sha256')refuse('release/category-class');
  const lines=standing.filter(line=>fieldOf(line,'scope')===category.scope&&fieldOf(line,'role')===category.role&&fieldOf(line,'form')==='alphabet'&&fieldOf(line,'measure')===category.measure);
  if(!lines.length)refuse('release/pin-missing');
  if(lines.length!==1)refuse('release/pin-ambiguous');
  if(fieldOf(lines[0]!,'value')!==pin.digest)refuse('release/pin-integrity');
  selected.push(lines[0]!);
 }
 if(new Set(pins.map(pin=>pin.category)).size!==pins.length)refuse('release/category-ambiguous');
 return selected;
}
