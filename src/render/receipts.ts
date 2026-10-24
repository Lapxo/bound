import {canonical} from '@lapxo/topos/wire';
import {viewsOf,materializedViews} from '../fold/views.ts';
import {standingOf} from '../cli/place.ts';
import {worldAt} from '../fold/places.ts';
import {wordsOf} from '../fold/wire.ts';
import {viewOf,unrendered} from './view.ts';
import {join} from '../host/io.ts';
import {observeText} from '../observe/files.ts';
import {selectedWireList} from '../host/selected-topos.ts';
import {fieldOf} from '../fold/claims.ts';
import {ownLockOf} from '../fold/signed.ts';
import {projectedReceipts} from './receipt-projection.ts';
import {receiptsOf, keepCarried} from '../fold/resolved.ts';
import {bytesDigest} from '../fold/digests.ts';
import {keyOf} from '../fold/keys.ts';
import {fileRegionDigest} from '../fold/closed.ts';
import {readersBehind} from '../fold/observed.ts';
import {instrumentDigest} from '../fold/digests.ts';
import {ownLock,ownRoot,sourceOf} from '../observe/runner.ts';
import {wireLine} from '../fold/wire.ts';
import type {PlaceFold} from '../cli/place.ts';
/** Native receipts are a protocol projection of actual fold observations, not a domain renderer or an acceptance verdict. */
export function receiptRegion(fold: PlaceFold, at: number, materializedOutputs?: readonly string[]): readonly string[] {
  const local = fold.under ? ownLockOf(fold.root, fold.under.replace(/\/$/, '')) : fold.standing;
  const prefix = 'uses/';
  const pins = local.filter(line => {
    const scope = fieldOf(line, 'scope');
    return scope.startsWith(prefix) && scope.length > prefix.length && !scope.slice(prefix.length).includes('/') && fieldOf(line, 'value') !== 'withdraw';
  });
  const fields = selectedWireList(local, fold.epoch, pins, 'receipt-fields');
  const contract = wireLine(ownLock(), 'receipt-instrument');
  const coordinate = contract === undefined ? undefined : fieldOf(contract, 'value');
  const implementation = coordinate === undefined ? undefined : instrumentDigest(fold.store,sourceOf(),[],ownRoot(),ownLock());
  // The current implementation seal is metadata, not an observation carried from a previous fold.
  const observed = [...receiptsOf(fold).filter(line => !coordinate || fieldOf(line,'scope') !== coordinate), ...(coordinate && implementation ? [canonical({scope:coordinate,role:'writes',form:'alphabet',measure:'digest',value:implementation,at:`place:${implementation}`,by:'bound'})] : [])];
  const hash = (bytes: string): string => bytesDigest(fold.store, new TextEncoder().encode(bytes));
  const head = keyOf(fold.store, 'attest');
  const projection = projectedReceipts(observed, fields, hash, head ? [head] : []);
  const set = keepCarried(fold.store, observed);
  if (at === 0) return [canonical({scope: 'receipts', role: 'writes', form: 'alphabet', measure: 'digest', value: projection.root, at: `place:${set}`, by: 'bound'})];
  if (at === 1) {
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
      if(unrendered(fold,view).length||observeText(join(fold.root,place,view.shape))!==viewOf(fold,view))return [];
    }
    const algorithm = hash('').split(':')[0]!;
    const current = readersBehind().length === 0;
    return projection.regions.flatMap(region => {
      const bytes = fileRegionDigest(fold.root, fold.under ?? '', region.scope, algorithm, observed);
      const count = canonical({scope: region.scope, role: 'writes', form: 'interval', measure: 'count', value: `${region.count}..${region.count}`, at: `place:${region.digest}`, by: 'bound'});
      // A stale reading remains visible but cannot seal the current file bytes.
      return current ? [count, canonical({scope: region.scope, role: 'writes', form: 'alphabet', measure: 'bytes', value: bytes, at: `place:${bytes}`, by: 'bound'})] : [count];
    });
  }
  if (at === 8) return observed;
  throw Error(`REFUSE·receipt unsupported resolution ${at}`);
}
