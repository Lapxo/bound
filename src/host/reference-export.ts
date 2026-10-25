import type{SigningPort}from'../engine/ports.ts';
import {installedReferenceContracts} from './reference-contracts.ts';
import {BoundRefusal,describeRefusal,readRefusalCatalog} from './refusals.ts';
import {readFileSync} from 'node:fs';
import {authorityAtEpoch,canonical,parse} from '@lapxo/topos/wire';
import {sha256 as hash} from './hash.ts';
import {signerFor} from './signing.ts';
import {signConsentLot} from '../land/sign.ts';
import {underRootAuthority} from '../land/act.ts';
import {storeOf} from '../land/ledger.ts';
import {authorityFor,rootSigner} from '../fold/signers.ts';
import {admissionAnchor,admissionHistoryAt} from '../fold/admission-history.ts';
import {authenticatedRootStanding} from './admitted-place.ts';
import {eraOf} from '../fold/digests.ts';
import {epochOf} from '../cli/owner.ts';
import {fieldOf} from '../fold/claims.ts';
import {prepareNativeReference} from './reference-native.ts';
import {referenceContextBytes,referenceContracts,referenceStanding} from './reference-standing.ts';
import {encodeReference} from './reference-profile.ts';

const catalog=()=>readFileSync(new URL('../../docs/contracts/refusals.bound',import.meta.url),'utf8');
export {BoundRefusal as ReferenceExportRefusal} from './refusals.ts';
function fail(code:string):never{
 const refusal=new BoundRefusal('reference-export/'+code,'REFUSE·reference-export/'+code);
 const entry=describeRefusal(refusal,readRefusalCatalog(catalog()));
 throw new BoundRefusal(entry.code,'REFUSE·'+entry.code+' '+entry.meaning);
}

/** Signs a public snapshot proof; never lands, refreshes evidence or changes the Root. */
export async function exportAuthenticatedReference(root:string,source:string,options:{readonly key?:string;readonly keyFile?:string;readonly signer?:string;readonly hostSigner?:{readonly name:string;readonly sign:SigningPort}}={}){
 try{encodeReference({class:'standing',algorithm:'sha256',digest:'0'.repeat(64),blob:'sha256:'+'0'.repeat(64),source});}catch{fail('source');}
 return underRootAuthority(storeOf(root),'reference export',async()=>{
  const history=admissionHistoryAt(root,Number.MAX_SAFE_INTEGER),standing=authenticatedRootStanding(root),epoch=epochOf(history),era=eraOf(standing);
  const authority=authorityFor(history,admissionAnchor(root),era.admitted);
  const one=(scope:string,measure='id',form='alphabet')=>{const rows=standing.filter(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'value')!=='withdraw');if(rows.length!==1||fieldOf(rows[0]!,'role')!=='writes'||fieldOf(rows[0]!,'measure')!==measure||fieldOf(rows[0]!,'form')!==form||authority.of(rows[0]!).kind!=='admitted')fail('context');return fieldOf(rows[0]!,'value');};
  if(one('reference/authentication')!=='authenticated-standing@1')fail('context');
  const proofScope=one('reference/proof-scope'),contracts={refusals:one('reference/contracts/refusals'),standing:one('reference/contracts/standing')};
  const installed=installedReferenceContracts();if(!referenceContracts(contracts)||contracts.refusals!==installed.refusals||contracts.standing!==installed.standing)fail('context');
  const count=one('reference/records'),maxRecords=Number(count),range=/^(0|[1-9][0-9]*)\.\.(0|[1-9][0-9]*)$/.exec(one('reference/export-bytes','bytes','interval'));
  if(!/^(0|[1-9][0-9]*)$/.test(count)||!Number.isSafeInteger(maxRecords)||maxRecords<1||!range||Number(range[1])>Number(range[2])||!Number.isSafeInteger(Number(range[2]))||Number(range[2])<1)fail('budget');const maxBytes=Number(range[2]);
  const originals=standing.filter(line=>fieldOf(line,'value')!=='withdraw'||fieldOf(line,'type')!=='');
  if(!originals.length||originals.length>maxRecords||Buffer.byteLength(originals.join('\n'))>maxBytes)fail('budget');
  if(originals.some(line=>authority.of(line).kind!=='admitted'))fail('history');
  const key=options.key??rootSigner(root).id,signer=authority.admitted.find(s=>s.id===key);
  const stamp=canonical({scope:proofScope,role:'writes',form:'alphabet',measure:'digest',value:hash(JSON.stringify(['authenticated-standing@1',originals])+'\n'),by:'target',at:'witness:'+'sha256:'+'0'.repeat(64)});
  const probe=parse(stamp);if(!signer||probe.kind!=='fact'||authorityAtEpoch({...probe.value.fields,by:key,epoch:String(epoch)},signer,epoch,proofScope,'authority').kind!=='admitted')fail('authority');
  const held=await prepareNativeReference(root),semantic=referenceStanding(originals,held.records),semanticIdentity=hash(semantic);
  const context={profile:'reference-export-context@1',semanticIdentity,epoch,proofScope,policy:held.policy,formImplementation:held.formImplementation,signers:authority.admitted,algorithms:era.admitted,contracts,maxBytes,maxRecords};
  const snapshot=hash(referenceContextBytes(context));
  if(Buffer.byteLength(JSON.stringify({originals,context,snapshot})+'\n')>maxBytes)fail('budget');
  const drafted=canonical({...probe.value.fields,at:'witness:'+snapshot});
  let signed:Awaited<ReturnType<typeof signConsentLot>>;
  try{signed=await signConsentLot([drafted],{epoch,by:key,algorithm:era.era},signer.publicKey,era.admitted,signerFor(standing,key,options.signer,options.keyFile,options.hostSigner));}catch{fail('signer');}
  if(signed.kind!=='fact')fail('signer');
  const carrier=JSON.stringify(['authenticated-standing@1',originals,signed.lines[0]])+'\n';
  const reference=encodeReference({class:'standing',algorithm:'sha256',digest:semanticIdentity.slice(7),blob:hash(carrier),source});
  const result={profile:'reference-export@1',reference,carrier,context:{...context,snapshot}};
  if(Buffer.byteLength(JSON.stringify(result)+'\n')>maxBytes)fail('budget');
  return result;
 });
}
