import {authenticatedStanding} from '../admitted-place.ts';
import {withoutEffects} from '../read-only.ts';
import {withHostCall} from '../call-context.ts';
import {sha256,isSha256} from '../hash.ts';
import {BoundRefusal} from '../refusals.ts';
import {fieldOf} from '../../fold/claims.ts';
import {storeOf,blobAt} from '../../land/ledger.ts';
import {readBoundedFile} from './bounded-file.ts';
import {parseNativeAuthorityCardRequest,prepareNativeAuthorityCard} from './authority-card.ts';
import type {NativeHostInstrument} from '../native-receiver.ts';

/** The receiver supplies Root and implementation. Only authenticated selection
 * chooses a bounded local request; document bytes supply neither authority. */
export async function nativeAuthorityCardView(root:string,instrument:NativeHostInstrument,scope:string){
 const call={instrumentName:instrument.name,runtime:structuredClone(instrument.runtime),output:()=>{}};
 const selected=withHostCall(call,()=>withoutEffects(()=>{
  if(typeof scope!=='string'||!scope||/[\s@]/.test(scope))throw new BoundRefusal('authority-card/selection','REFUSE·authority-card/selection requires an explicit request scope');
  const standing=authenticatedStanding(root);
  const select=(at:string,measure:string,form:string)=>{
   const rows=standing.filter(line=>fieldOf(line,'scope')===at&&fieldOf(line,'measure')===measure&&fieldOf(line,'role')==='writes'&&fieldOf(line,'form')===form&&fieldOf(line,'value')!=='withdraw');
   if(rows.length!==1)throw new BoundRefusal('authority-card/selection','REFUSE·authority-card/selection requires one admitted '+measure+' at '+at);
   return fieldOf(rows[0]!,'value');
  };
  const digest=select(scope,'authority-card-request','alphabet');
  if(!isSha256(digest))throw new BoundRefusal('authority-card/selection','REFUSE·authority-card/selection requires a SHA-256 request');
  const limit=(name:string)=>{
   const span=/^0\.\.([1-9][0-9]*)$/.exec(select(scope+'/'+name,name,'interval')),n=Number(span?.[1]);
   if(!span||!Number.isSafeInteger(n))throw new BoundRefusal('authority-card/budget','REFUSE·authority-card/budget requires a finite '+name+' bound');return n;
  };
  const limits={bytes:limit('bytes'),items:limit('items')};
  let bytes:Buffer;
  try{bytes=readBoundedFile(blobAt(storeOf(root),digest),limits.bytes,scope)}catch(error){throw new BoundRefusal('authority-card/content','REFUSE·authority-card/content '+(error instanceof Error?error.message:'request bytes unavailable'));}
  if(sha256(bytes)!==digest)throw new BoundRefusal('authority-card/integrity','REFUSE·authority-card/integrity request bytes differ from admitted selection');
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw new BoundRefusal('authority-card/integrity','REFUSE·authority-card/integrity request is not UTF-8')};
  const request=parseNativeAuthorityCardRequest(text,digest,limits);
  if(request.limits.bytes>limits.bytes||request.limits.items>limits.items)throw new BoundRefusal('authority-card/budget','REFUSE·authority-card/budget request exceeds admitted selector limits');
  return {request,standing:sha256(standing.join('\n')+'\n')};
 }));
 const result=await prepareNativeAuthorityCard({...selected.request,root,instrument});
 const current=withHostCall(call,()=>withoutEffects(()=>sha256(authenticatedStanding(root).join('\n')+'\n')));
 if(current!==selected.standing)throw new BoundRefusal('authority-card/selection','REFUSE·authority-card/selection changed during preflight');
 return result;
}
