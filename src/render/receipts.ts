import{verifiedContent,verifiedContentBytes}from'../host/content-store.ts';
import{topos_standing_readStanding as readStanding}from'../../vendor/library.js';
import{receiptSelection,receiptSelectionLimits,publicationSelection,isPublicationRegion}from'../fold/receipt-selection.ts';
export{publicationSelection,isPublicationRegion}from'../fold/receipt-selection.ts';
import {topos_wire_canonical as canonical} from "../../vendor/library.js";
import {viewsOf,materializedViews} from '../fold/views.ts';
import {standingOf} from '../cli/place.ts';
import {worldAt} from '../fold/places.ts';
import {wordsOf} from '../fold/wire.ts';
import {viewOf,unrendered,evidenceLines} from './view.ts';
import {join} from '../host/io.ts';
import {observeText} from '../observe/files.ts';
import {selectedWireList,toposAt,withSelectedToposResolver} from '../host/selected-topos.ts';
import {fieldOf,isWire,fieldsOf as parseReceipt} from '../fold/claims.ts';
import {ownLockOf} from '../fold/signed.ts';
import {projectedReceipts} from './receipt-projection.ts';
import {receiptsOf, keepCarried,carriedFrom} from '../fold/resolved.ts';
import {bytesDigest} from '../fold/digests.ts';
import {keyOf} from '../fold/keys.ts';
import {storeOf} from '../land/ledger.ts';
import {emptyLedger} from '../fold/stranger.ts';
import {topos_wire_publicLock as publicLock} from '../../vendor/library.js';
import {fileRegionDigest,meets} from '../fold/closed.ts';
import {readersBehind} from '../fold/observed.ts';
import {instrumentDigest} from '../fold/digests.ts';
import {ownLock,ownRoot,sourceOf} from '../observe/runner.ts';
import {wireLine} from '../fold/wire.ts';
import type {PlaceFold} from '../cli/place.ts';
/** A preserved publication transports verified historical readings; it does not
 * execute them again or assert the current host's authority. */
export interface PreservedPublication {
 readonly root:string;readonly store:string;readonly standing:readonly string[];
 readonly epoch:number;readonly preserved:readonly string[];
 readonly under?:undefined;readonly release?:undefined;readonly materialization?:undefined;
}
type ReceiptSource=PlaceFold|PreservedPublication;
const preserved=(source:ReceiptSource):source is PreservedPublication=>'preserved' in source;

/** Native receipts are a protocol projection of actual fold observations, not a domain renderer or an acceptance verdict. */
export function receiptRegion(fold: ReceiptSource, at: number, materializedOutputs?: readonly string[], delivery?: {readonly files:ReadonlySet<string>;readonly configuration:readonly string[];readonly scope:string;readonly coordinate:string}): readonly string[] {
  const local = fold.under ? ownLockOf(fold.root, fold.under.replace(/\/$/, '')) : fold.standing;
  const prefix = 'uses/';
  const pins = local.filter(line => {
    const scope = fieldOf(line, 'scope');
    return scope.startsWith(prefix) && scope.length > prefix.length && !scope.slice(prefix.length).includes('/') && fieldOf(line, 'value') !== 'withdraw';
  });
  const prior=preserved(fold)?fold.preserved:receiptsOf(fold),contracts=new Map<string,Uint8Array>();
  for(const pin of pins){const digest=fieldOf(pin,'value');if(contracts.has(digest))continue;
    const supplied=preserved(fold)?prior.filter(line=>fieldOf(line,'scope')===`receipts/contracts/${digest.split(':')[1]}`&&fieldOf(line,'value')===digest&&fieldOf(line,'measure')==='content'):[];
    if(supplied.length>1)throw Error('REFUSE·receipt publication ambiguous selected contract '+digest);
    const inline=supplied[0],encoded=inline===undefined?undefined:fieldOf(inline,'about');
    const bytes=encoded===undefined?verifiedContent(digest,fold.store).bytes:Buffer.from(encoded,'base64');
    if(inline&&(fieldOf(inline,'shape')!=='base64'||Buffer.from(bytes).toString('base64')!==encoded))throw Error('REFUSE·receipt publication malformed selected contract '+digest);
    contracts.set(digest,verifiedContentBytes(digest,bytes));
  }
  const resolve=(digest:string)=>contracts.has(digest)?readStanding(new TextDecoder('utf-8',{fatal:true}).decode(contracts.get(digest)!)):toposAt(digest,fold.store);
  const fields = selectedWireList(local, fold.epoch, pins, 'receipt-fields',resolve);
  const attachments=[...contracts].map(([digest,bytes])=>canonical({scope:'receipts/contracts/'+digest.split(':')[1],role:'writes',form:'alphabet',measure:'content',value:digest,shape:'base64',about:Buffer.from(bytes).toString('base64'),at:'place:'+digest,by:'bound'}));
  const contract = wireLine(ownLock(), 'receipt-instrument');
  const coordinate = contract === undefined ? undefined : fieldOf(contract, 'value');
  const implementation = coordinate === undefined ? undefined : instrumentDigest(fold.store,sourceOf(),[],ownRoot(),ownLock());
  // The current implementation seal is metadata, not an observation carried from a previous fold.
  const observed = [...prior.filter(line => (!coordinate || fieldOf(line,'scope') !== coordinate)&&!attachments.some(item=>fieldOf(item,'scope')===fieldOf(line,'scope'))), ...attachments, ...(coordinate && implementation ? [canonical({scope:coordinate,role:'writes',form:'alphabet',measure:'digest',value:implementation,at:`place:${implementation}`,by:'bound'})] : [])];
  const hash = (bytes: string): string => bytesDigest(fold.store, new TextEncoder().encode(bytes));
  const head = keyOf(fold.store, 'attest');
  const projection = projectedReceipts(observed, fields, hash, head ? [head] : []);
  const set = keepCarried(fold.store, observed);
  if (at === 0) return [canonical({scope: 'receipts', role: 'writes', form: 'alphabet', measure: 'digest', value: projection.root, at: `place:${set}`, by: 'bound'})];
  if (at === 1) return withSelectedToposResolver(resolve,()=>{
    // Byte seals cannot certify an old output against a new admitted source.
    // Reuse the declared view renderer; receipt views are excluded to avoid
    // self-reference. Withhold region counts too, so the byte-only sealer
    // cannot manufacture a closure from these incomplete semantic receipts.
    const place=fold.under??'';
    const materialized=materializedOutputs===undefined?undefined:new Set(materializedOutputs);
    const captured=fold.materialization;
    const tree=captured?undefined:standingOf(fold.root);
    const own=captured?.own??(worldAt(fold.root,place.replace(/\/$/,''))?ownLockOf(fold.root,place.replace(/\/$/,'')):[]);
    const rootViews=captured?new Map(captured.tree.map(view=>[view.name,view])):viewsOf(tree!.lock);
    const selected=materializedViews(fold.standing,place,own,rootViews,captured?.worlds??wordsOf(tree!.standing,'views/world'),shape=>materialized?.has(join(place,shape))===true||observeText(join(fold.root,place,shape))!==undefined);
    for(const view of selected){
      if(!view.shape||view.regions.some(region=>region.name==='receipts'))continue;
      // Delivery selection is captured before copying an already closed source.
      // Missing selected outputs still fail; absence never selects a subset.
      if(materialized&&!materialized.has(join(place,view.shape)))continue;
      if(!preserved(fold)&&(unrendered(fold,view).length||observeText(join(fold.root,place,view.shape))!==viewOf(fold,view)))return [];
    }
    const algorithm = hash('').split(':')[0]!;
    const current = readersBehind().length === 0;
    const seals = projection.regions.flatMap(region => {
      const bytes = fileRegionDigest(fold.root, fold.under ?? '', region.scope, algorithm, observed, delivery);
      const count = canonical({scope: region.scope, role: 'writes', form: 'interval', measure: 'count', value: `${region.count}..${region.count}`, at: `place:${region.digest}`, by: 'bound'});
      // A stale reading remains visible but cannot seal the current file bytes.
      return current ? [count, canonical({scope: region.scope, role: 'writes', form: 'alphabet', measure: 'bytes', value: bytes, at: `place:${bytes}`, by: 'bound'})] : [count];
    });
    // The inventory itself consumes every selected member, including files
    // that no semantic reader needed. Carry one seal for that complete read.
    if(delivery&&!seals.some(line=>fieldOf(line,'scope')==='receipts/.'&&fieldOf(line,'measure')==='bytes')){
      const scope='receipts/.',digest=fileRegionDigest(fold.root,place,scope,algorithm,observed,delivery);
      seals.push(canonical({scope,role:'writes',form:'interval',measure:'count',value:'1..1',at:'place:'+digest,by:'bound'}),canonical({scope,role:'writes',form:'alphabet',measure:'bytes',value:digest,at:'place:'+digest,by:'bound'}));
    }
    if(delivery)for(const view of selected){
      if(!view.shape||view.regions.some(region=>region.name==='receipts')||!delivery.files.has(join(place,view.shape)))continue;
      const scope='receipts/'+view.shape;
      if(projection.regions.some(region=>{const prefix=region.scope.replace(/^receipts\//,'').replace(/\/$/,'');return !prefix||prefix==='.'||view.shape===prefix||view.shape.startsWith(prefix+'/')}))continue;
      const digest=fileRegionDigest(fold.root,place,scope,algorithm,observed,delivery);
      seals.push(canonical({scope,role:'writes',form:'interval',measure:'count',value:'1..1',at:'place:'+digest,by:'bound'}),canonical({scope,role:'writes',form:'alphabet',measure:'bytes',value:digest,at:'place:'+digest,by:'bound'}));
    }
    return delivery?seals.map(line=>fieldOf(line,'measure')==='bytes'?canonical({...parseReceipt(line),shape:delivery.coordinate,needs:delivery.scope}):line):seals;
  });
  if (at === 8) return observed;
  throw Error(`REFUSE·receipt unsupported resolution ${at}`);
}


import {topos_wire_publicationOf as publicationOf,topos_wire_matches as matches} from '../../vendor/library.js';
import {captureViewInputs,preparingView,viewInput} from '../host/reading-context.ts';
import {withoutEffects} from '../host/read-only.ts';
import {readBoundedFile} from '../host/native/bounded-file.ts';

/** Public configuration uses the same admitted projection as every native seal.
 * Non-consumed historical notices may be referenced separately; bounds and
 * dependencies never disappear from a delivery. The source remains intact. */
export function publicationLines(fold:Pick<PlaceFold,'standing'>):readonly string[]{
 const rows=fold.standing.filter(line=>fieldOf(line,'scope')==='publish/standing/history'&&fieldOf(line,'value')!=='withdraw');
 if(rows.length>1)throw Error('REFUSE·receipt publication ambiguous historical selection');
 const selectors=rows.flatMap(line=>fieldOf(line,'value').split('|').filter(Boolean));
 const historical=fold.standing.filter(line=>selectors.some(selector=>matches(selector,fieldOf(line,'scope'))));
 if(selectors.some(selector=>!historical.some(line=>matches(selector,fieldOf(line,'scope')))))throw Error('REFUSE·receipt publication unknown historical selection');
 for(const line of historical)if(fieldOf(line,'role')!=='demands'||fieldOf(line,'form')!=='alphabet'||fieldOf(line,'measure')!=='status'||fieldOf(line,'value')!=='present'||fold.standing.some(other=>fieldOf(other,'needs').split('|').some(need=>matches(need,fieldOf(line,'scope')))))throw Error('REFUSE·receipt publication cannot omit a bound or consumed declaration');
 return publicationOf(fold.standing.filter(line=>!historical.includes(line)&&!rows.includes(line)));
}

/** A receiver-admitted inventory selects bytes; it grants no new authority and
 * never invokes a compiler, package manager, archive tool or filesystem writer. */
export function publicationReceipts(fold:ReceiptSource,selectionScope='publish/receipt-members'):readonly string[]{
 const selected=(scope:string)=>{const rows=fold.standing.filter(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'value')!=='withdraw');if(rows.length!==1)throw Error('REFUSE·receipt publication selection '+scope);return rows[0]!};
 const limits=receiptSelectionLimits(fold.standing);
 const run=()=>{
  if(fold.under||(fold.release&&!['ready','absent'].includes(fold.release.status))||!meets(fold.root,fold.store,'',!preserved(fold)))throw Error('REFUSE·receipt publication requires fresh closed source and materialized outputs');
  const hash=(bytes:Uint8Array)=>bytesDigest(fold.store,bytes),selection=receiptSelection(fold.root,fold.standing,selectionScope,hash);
  const paths=[...selection.files],read=(name:string)=>Buffer.from(viewInput('file:'+join(fold.root,name),()=>readBoundedFile(join(fold.root,name),limits.bytes,name).toString('base64')),'base64');
  const configuration=publicationLines(fold),source=fieldOf(selected('sources/receipt-history'),'value');
  let location:URL;try{location=new URL(source)}catch{throw Error('REFUSE·receipt publication history location')}
  if(!['https:','http:'].includes(location.protocol)||location.username||location.password||location.search||location.hash||!source.endsWith('/'))throw Error('REFUSE·receipt publication history location');
  const records=isPreservedSource(fold.root,fold.store)?[]:[read('TARGET.bound'),read('receipts.bound'),Buffer.from(evidenceLines(fold.root,fold.store).join('\n')+'\n')];
  const retained=carriedFrom(fold.store,(observeText(join(fold.root,'receipts.bound'))??'').split('\n').filter(isWire))?.filter(line=>fieldOf(line,'scope').startsWith('receipts/history/'))??[];
  const history=[...retained,...records.map(bytes=>{const digest=hash(bytes);return canonical({scope:'receipts/history/'+digest.split(':')[1],role:'writes',form:'alphabet',measure:'digest',value:digest,at:'place:'+digest,by:'bound',shape:'bound-lock/1',about:source+digest.split(':')[1]+'.bound'})})];
  const projected={...fold,standing:configuration,receiptHistory:history},files=new Set<string>(paths as string[]),seals=receiptRegion(projected,1,paths,{...selection,files,configuration});
  if(!seals.length)throw Error('REFUSE·receipt publication selected output stale');
  return [...receiptRegion(projected,8),...receiptRegion(projected,0),...seals];
 };
 return withoutEffects(()=>preparingView()?run():captureViewInputs(limits,run).value);
}

/** Byte closure and the native carrier are checked before reprojecting history.
 * This is inspection of a historical source, never a fresh reading or grant. */
export function preservedPublication(root:string):PreservedPublication|undefined{
 const store=storeOf(root);if(!isPreservedSource(root,store))return undefined;
 if(!meets(root,store,'',false))throw Error('REFUSE·receipt publication requires a closed historical source');
 const lines=(observeText(join(root,'receipts.bound'))??'').split('\n').filter(isWire),held=carriedFrom(store,lines);
 if(!held?.length)throw Error('REFUSE·receipt publication missing verified historical readings');
 return{root,store,standing:standingOf(root).standing,epoch:0,preserved:held};
}

export function isPreservedSource(root:string,store=storeOf(root)):boolean{return emptyLedger(store)&&publicLock((observeText(join(root,'TARGET.bound'))??'').split('\n').filter(isWire))!==undefined}
