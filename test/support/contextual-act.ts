import {canonical,signedBytes} from '@lapxo/topos/wire';
import {placeActContextBytes,originContextBytes,placeReceiptBytes,type OriginProof} from '@lapxo/topos/core';
import {actingRootFixture} from './acting-root.ts';
import {declaredRootClockSource} from '../../src/host/root-clock-source.ts';
import {signBytes} from '../../src/host/adapters/keys/ed25519.ts';
import {sha256} from '../../src/host/hash.ts';

/** Extends the existing disposable, real-CLI fixture; no second bootstrap. */
export function contextualActFixture(name:string,placeNames:readonly string[]=['catalog','inventory']){
 const fixture=actingRootFixture(name,[],{places:placeNames});
 const packet=(names:readonly string[],value:string)=>{
  const chosen=declaredRootClockSource(fixture.root),heads=chosen.trust.current().heads;
  const places=names.map(name=>{
   const place=name+'/TARGET.bound',head=heads.find(h=>h.place===place)!,initial=chosen.selection.initial.find(i=>i.place===place)!;
   const epoch=String(Number(head.epoch)+1),fields={scope:'items/value',measure:'id',value,role:'writes',form:'alphabet',at:'policy:fixture',by:'lane',epoch};
   return {place,previous:head.identity,epoch,originPrefix:head.identity===initial.receiver.identity?initial.origin.prefix:head.identity,records:[canonical({...fields,sig:signBytes(signedBytes(fields),fixture.lanePem,'ed25519:sample')})],proofs:[] as OriginProof[]};
  });
  for(const place of places)place.proofs=[{by:'lane',signature:signBytes(originContextBytes(chosen.trust.contract.root,place,'lane',chosen.selection.budget),fixture.lanePem,'ed25519:sample')}];
  const context=placeActContextBytes({root:chosen.trust.contract.root,places},chosen.selection.budget),identity=sha256(context);
  const receipts=places.map(p=>({place:p.place,by:'owner',signature:signBytes(placeReceiptBytes(identity,p,chosen.trust.contract.root,'owner','receipts',chosen.selection.budget),fixture.ownerPem,'ed25519:sample')}));
  return {profile:'place-act-context@1',context,receipts};
 };
 return {...fixture,packet,placeNames};
}
