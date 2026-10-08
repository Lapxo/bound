import {walkProjection,walkAt,walkSnapshot,walkHeaders,readWalkHeaders,readForeignWalk,walkAuthority,walkOrigin,walkInventory,walkSelection,isWalkHeader} from '@lapxo/topos/walk';
import type {WalkSnapshot,WalkRegion} from '@lapxo/topos/walk';
import {canonical,parse,fromLine,wireAt,matches,objectHistory,validateObjectContext} from '@lapxo/topos/wire';
import {objectProvider} from '@lapxo/topos/object-provider';
import {standingBytes} from '@lapxo/topos/standing';
import {fieldOf} from '../fold/claims.ts';
import {lockStanding,lockLines} from '../fold/keys.ts';
import {authorityFor,rootSigner} from '../fold/signers.ts';
import {publicKeyOf} from '../fold/signers.ts';
import {signaturesOf} from '../fold/digests.ts';
import {fullDigest} from './digest.ts';
import {toposAt,contextModuleAt} from './selected-topos.ts';
import {signerFor} from './signing.ts';
import {signConsentLot,verifiesFields} from '../land/sign.ts';
import {storeOf} from '../land/ledger.ts';
import {signedOwnerLines,epochOf,localActLines,ownerOf} from '../cli/owner.ts';
import {commitIngress,ingressBundles,ingressCost} from './ports/ingress.ts';
import type {IngressBundle} from './ports/ingress.ts';

const refuse=(why:string):never=>{throw Error('REFUSE·walk '+why)};
const fields=(line:string)=>{const p=parse(line);if(p.kind!=='fact')return refuse('not a wire line');return p.value.fields};
const one=(lines:readonly string[],scope:string,measure:string):string=>{
 const rows=lines.filter(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')===measure&&fieldOf(line,'value')!=='withdraw');
 if(rows.length!==1)return refuse('missing or conflicting '+scope+' '+measure);
 return fieldOf(rows[0]!,'value');
};
function policy(root:string){
 const store=storeOf(root),standing=lockStanding(store),contract=walkSelection(standing);
 const view=one(standing,'view/walk','id');if(view!=='walk@*')refuse('view/walk must declare walk@*');
 const masks=standing.filter(line=>fieldOf(line,'scope')==='view/walk').flatMap(line=>fieldOf(line,'needs').split('|')).filter(Boolean);
 if(!masks.length)refuse('view/walk has no declared history inputs');
 const wire=wireAt(standing.map(fields),Number.MAX_SAFE_INTEGER),algorithm=wire?.digests.values().next().value;
 if(!algorithm)refuse('no admitted digest algorithm');
 return {store,standing,contract,masks,digest:(bytes:string)=>fullDigest(bytes,algorithm!)};
}
function context(root:string,pin:string,own=false){
 const p=policy(root);
 if(!own&&!p.standing.some(line=>fieldOf(line,'scope').startsWith('uses/')&&fieldOf(line,'value')===pin))refuse('origin context is not selected by digest');
 const topos=toposAt(pin,p.store),authority=walkAuthority(topos.parts,verifiesFields);
 const configuration=topos.parts.map(f=>canonical({...f,by:'target',epoch:'0'}));
 return {pin,topos,authority,configuration,origin:walkOrigin(topos.parts),contract:walkSelection(topos.lines)};
}
function local(root:string):WalkSnapshot {
 const p=policy(root),authority=authorityFor(lockLines(p.store),rootSigner(root),signaturesOf(p.store).admitted);
 const history=signedOwnerLines(p.store).filter(line=>p.masks.some(mask=>matches(mask,fieldOf(line,'scope'))));
 if(history.some(line=>authority.of(line).kind!=='admitted'))refuse('local history is not authenticated');
 const selected=context(root,one(p.standing,'walk/context','digest'),true);
 return walkSnapshot(history,selected.contract.fields,p.digest,selected.origin,selected.contract.partition);
}
const headerInfo=(lines:readonly string[])=>{
 const roots=lines.filter(line=>isWalkHeader(line)&&fieldOf(line,'scope')==='walk/root');
 if(roots.length!==1)return refuse('one signed root is required');
 const at=fieldOf(roots[0]!,'at');if(!at.startsWith('receipt:'))return refuse('root has no declared context');
 return {pin:at.slice(8),base:fieldOf(roots[0]!,'condition')};
};
async function validateHistory(root:string,selected:ReturnType<typeof context>,history:readonly string[]):Promise<void>{
 if(!selected.authority.authenticate(history))refuse('origin history is not authenticated');
 for(const line of history){const f=fields(line),decoded=fromLine(line,wireAt(selected.topos.parts,Number(f.epoch)));if(decoded.kind!=='fact')refuse('origin wire '+decoded.why);}
 const decoded=objectHistory([...selected.configuration,...history]);if(decoded.kind!=='fact')return refuse('origin history '+decoded.why);
 if(!decoded.value.objects.length)return;
 const pinned=new Set(selected.topos.lines);
 const admit=(f:Readonly<Record<string,string>>)=>Boolean(f.sig)?selected.authority.of(canonical(f)).kind==='admitted':pinned.has(standingBytes([canonical(f)]).trim());
 const provider=await objectProvider(decoded.value.objects,decoded.value.configuration,{admit,emit:()=>{},topos:pin=>toposAt(pin,storeOf(root)),module:pin=>contextModuleAt(pin,storeOf(root))});
 const checked=validateObjectContext(decoded.value.objects,provider);if(checked.kind!=='fact')refuse('origin context '+checked.why);
}
async function readBundle(root:string,bundle:IngressBundle,earlier:readonly string[]=[]){
 const lines=bundle.evidence.split('\n').filter(Boolean),info=headerInfo(lines),p=policy(root);
 const receipts=bundle.receipt.split('\n').filter(Boolean),authority=authorityFor(lockLines(p.store),rootSigner(root),signaturesOf(p.store).admitted);
 if(receipts.length!==1||fieldOf(receipts[0]!,'scope')!=='receipts'||fieldOf(receipts[0]!,'role')!=='writes'||fieldOf(receipts[0]!,'form')!=='alphabet'||fieldOf(receipts[0]!,'measure')!=='digest'||fieldOf(receipts[0]!,'at')!=='receipt:'+info.pin||authority.of(receipts[0]!).kind!=='admitted')refuse('retained import receipt is not authenticated');
 const selected=context(root,info.pin);
 const got=readForeignWalk(lines,{origin:selected.origin,regionOrigin:selected.origin,context:info.pin,base:info.base,fields:selected.contract.fields,partition:selected.contract.partition,digest:p.digest,previousPrefixes:[],authenticatePrefix:selected.authority.authenticate,authenticateEvidence:selected.authority.authenticate,validateOriginHistory:()=>true});
 if(fieldOf(receipts[0]!,'value')!==got.identity)refuse('retained import receipt does not authenticate this ingress');
 await validateHistory(root,selected,[...new Set([...earlier,...got.records])]);
 return {...got,context:info.pin,regions:walkSnapshot(got.records,selected.contract.fields,p.digest,got.origin,selected.contract.partition).regions};
}
async function verifiedIngress(root:string){
 const result:Awaited<ReturnType<typeof readBundle>>[]=[],history=new Map<string,Set<string>>();
 const bundles=[...ingressBundles(storeOf(root))].sort((a,b)=>epochOf(a.receipt.split('\n'))-epochOf(b.receipt.split('\n')));
 for(const bundle of bundles){const info=headerInfo(bundle.evidence.split('\n').filter(Boolean)),origin=context(root,info.pin).origin;if(result.some(prior=>prior.origin===origin&&prior.context!==info.pin))refuse('origin context changed without declared lineage');const prior=history.get(origin)??new Set<string>();const got=await readBundle(root,bundle,[...prior]);for(const line of got.records)prior.add(line);history.set(origin,prior);result.push(got)}
 return result;
}
async function inventory(root:string){
 const p=policy(root),regions=new Map(local(root).regions.map(region=>[region.scope,region]));
 for(const got of (await verifiedIngress(root)).sort((a,b)=>a.senderEpoch-b.senderEpoch))for(const region of got.regions)regions.set(region.scope,region);
 return walkInventory([[...regions.values()]],p.digest,context(root,one(p.standing,'walk/context','digest'),true).contract.partition);
}
/** Verified foreign histories stay separate from the local authority and local epoch inputs. */
export async function foreignWalkLines(root:string):Promise<readonly string[]>{
 const verified=await verifiedIngress(root);
 return [...new Set(verified.flatMap(got=>got.records))];
}
/** A declared origin exports its own signed history. Foreign packets are retained with their contexts, never re-signed as local history. */
export async function renderWalk(root:string,resolution:number|undefined,peer:readonly string[],key?:string,keyFile?:string,signer?:string):Promise<readonly string[]>{
 const p=policy(root),pin=one(p.standing,'walk/context','digest'),selected=context(root,pin,true),own=local(root);
 const known=peer.length?(()=>{const info=headerInfo(peer),remote=context(root,info.pin);return readWalkHeaders(peer,info.pin,info.base,remote.authority.authenticate)})():walkSnapshot([],p.contract.fields,p.digest);
 const projection=walkProjection(selected.contract.projections,resolution);
 const ownInventory=projection==='history'?own:await inventory(root);
 const selectedPacket=walkAt(ownInventory,known,resolution,selected.contract.projections),by=key??ownerOf(p.store),publicKey=publicKeyOf(root,by);
 if(!publicKey)refuse('unknown local signer '+by);
 const drafted=walkHeaders(selectedPacket,pin,known.root,projection!=='inventory'),epoch=epochOf(localActLines(root));
 const got=await signConsentLot(drafted,{by,epoch,algorithm:signaturesOf(p.store).era},publicKey!,signaturesOf(p.store).admitted,signerFor(p.standing,by,signer,keyFile));
 if(got.kind!=='fact')return refuse(got.why);
 if(!selected.authority.authenticate(got.lines)||!selected.authority.authenticate(selectedPacket.records))refuse('local context does not authenticate exported history');
 return [...got.lines,...selectedPacket.records,`EXCHANGE ${selectedPacket.touched} touched regions · ${selectedPacket.open} open regions · ${Buffer.byteLength(selectedPacket.records.join('\n')+(selectedPacket.records.length?'\n':''))} payload bytes`];
}
/** The SDK proves the foreign prefix; the host admits the pair at one publication point. */
export async function landWalk(root:string,lines:readonly string[],key?:string,keyFile?:string,signer?:string):Promise<readonly string[]>{
 const p=policy(root),info=headerInfo(lines),selected=context(root,info.pin);
 const retained=await verifiedIngress(root);
 if(retained.some(prior=>prior.origin===selected.origin&&prior.context!==info.pin))refuse('origin context changed without declared lineage');
 const previous=(verified:typeof retained)=>{const prefixes=new Map<string,WalkRegion & {senderEpoch:number}>();for(const prior of verified.filter(got=>got.origin===selected.origin).sort((a,b)=>a.senderEpoch-b.senderEpoch))for(const region of prior.regions)prefixes.set(region.scope,{...region,senderEpoch:prior.senderEpoch});return [...prefixes.values()]};
 const payload=lines.filter(line=>!isWalkHeader(line));
 const proof=(prefixes:ReturnType<typeof previous>)=>readForeignWalk(lines,{origin:selected.origin,regionOrigin:selected.origin,context:info.pin,base:info.base,fields:selected.contract.fields,partition:selected.contract.partition,digest:p.digest,previousPrefixes:prefixes,authenticatePrefix:selected.authority.authenticate,authenticateEvidence:selected.authority.authenticate,validateOriginHistory:()=>true});
 const raw=proof([]),known=retained.find(prior=>prior.identity===raw.identity),got=known?raw:proof(previous(retained));
 const history=(prior:typeof retained)=>[...new Set([...prior.filter(item=>item.origin===selected.origin).flatMap(item=>item.records),...payload])];
 await validateHistory(root,selected,history(retained));
 if(!known&&info.base!==(await inventory(root)).root)refuse('stale receiver base');
 if(!payload.length&&!readWalkHeaders(lines,info.pin,info.base,selected.authority.authenticate).regions.length)return ['ONCE 0 new evidence lines · 0 import receipts · no regions offered',`EXCHANGE 0 payload bytes · ${Buffer.byteLength(lines.join('\n')+'\n')} protocol bytes · 0 new evidence bytes · 0 new receipt bytes`];
 const by=key??ownerOf(p.store),pub=publicKeyOf(root,by);if(!pub)refuse('unknown receiver signer '+by);
 const result=await commitIngress(p.store,got.identity,async()=>{
  if(info.base!==(await inventory(root)).root)refuse('receiver changed before ingress');
  const current=await verifiedIngress(root);
  proof(previous(current));
  await validateHistory(root,selected,history(current));
  const next=epochOf(localActLines(root))+1;
  const signed=await signConsentLot([got.importReceiptProposal],{by,epoch:next,algorithm:signaturesOf(p.store).era},pub!,signaturesOf(p.store).admitted,signerFor(p.standing,by,signer,keyFile));
  if(signed.kind!=='fact')return refuse(signed.why);
  const authority=authorityFor(lockLines(p.store),rootSigner(root),signaturesOf(p.store).admitted);
  if(authority.of(signed.lines[0]!).kind!=='admitted')refuse('receiver signer does not cover the import receipt');
  const grammar=fromLine(signed.lines[0]!,wireAt(p.standing.map(fields),next));if(grammar.kind!=='fact')refuse('receiver receipt wire '+grammar.why);
  return {evidence:lines.join('\n')+'\n',receipt:signed.lines.join('\n')+'\n'};
 },bundle=>{
  try{
   const retainedLines=bundle.evidence.split('\n').filter(Boolean),retainedInfo=headerInfo(retainedLines);
   if(retainedInfo.pin!==info.pin)return false;
   const retainedProof=readForeignWalk(retainedLines,{origin:selected.origin,regionOrigin:selected.origin,context:info.pin,base:retainedInfo.base,fields:selected.contract.fields,partition:selected.contract.partition,digest:p.digest,previousPrefixes:[],authenticatePrefix:selected.authority.authenticate,authenticateEvidence:selected.authority.authenticate,validateOriginHistory:()=>true});
   const receipts=bundle.receipt.split('\n').filter(Boolean),receipt=receipts[0]??'';
   return receipts.length===1&&retainedProof.identity===got.identity&&fieldOf(receipt,'scope')==='receipts'&&fieldOf(receipt,'value')===got.identity&&fieldOf(receipt,'at')==='receipt:'+info.pin&&authorityFor(lockLines(p.store),rootSigner(root),signaturesOf(p.store).admitted).of(receipt).kind==='admitted';
  }catch{return false}
 });
 return [`${result.kind==='once'?'ONCE':'INGRESS'} ${result.kind==='once'?0:got.records.length} new evidence lines · 1 ${result.kind==='once'?'retained':'signed local'} import receipt`,result.receipt.trim(),ingressCost(result,Buffer.byteLength(payload.join('\n')+(payload.length?'\n':'')),Buffer.byteLength(lines.filter(isWalkHeader).join('\n')+'\n'))];
}
