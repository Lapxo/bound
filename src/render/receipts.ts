import {canonical} from '@lapxo/topos/wire';
import {selectedWireList} from '../host/selected-topos.ts';
import {fieldOf} from '../fold/claims.ts';
import {ownLockOf} from '../fold/signed.ts';
import {receiptProjection} from '@lapxo/topos/receipts';
import {receiptsOf, keepCarried} from '../fold/resolved.ts';
import {bytesDigest} from '../fold/digests.ts';
import {keyOf} from '../fold/keys.ts';
import {fileRegionDigest} from '../fold/closed.ts';
import {readersBehind} from '../fold/observed.ts';
import type {PlaceFold} from '../cli/place.ts';
/** Native receipts are a protocol projection of actual fold observations, not a domain renderer or an acceptance verdict. */
export function receiptRegion(fold: PlaceFold, at: number): readonly string[] {
  const local = fold.under ? ownLockOf(fold.root, fold.under.replace(/\/$/, '')) : fold.standing;
  const prefix = 'uses/';
  const pins = local.filter(line => {
    const scope = fieldOf(line, 'scope');
    return scope.startsWith(prefix) && scope.length > prefix.length && !scope.slice(prefix.length).includes('/') && fieldOf(line, 'value') !== 'withdraw';
  });
  const fields = selectedWireList(local, fold.epoch, pins, 'receipt-fields');
  const observed = receiptsOf(fold);
  const hash = (bytes: string): string => bytesDigest(fold.store, new TextEncoder().encode(bytes));
  const head = keyOf(fold.store, 'attest');
  const projection = receiptProjection(observed, fields, hash, head ? [head] : []);
  const set = keepCarried(fold.store, observed);
  if (at === 0) return [canonical({scope: 'receipts', role: 'writes', form: 'alphabet', measure: 'digest', value: projection.root, at: `place:${set}`, by: 'bound'})];
  if (at === 1) {
    const algorithm = hash('').split(':')[0]!;
    const current = readersBehind().length === 0;
    return projection.regions.flatMap(region => {
      const bytes = fileRegionDigest(fold.root, fold.under ?? '', region.scope, algorithm);
      const count = canonical({scope: region.scope, role: 'writes', form: 'interval', measure: 'count', value: `${region.count}..${region.count}`, at: `place:${region.digest}`, by: 'bound'});
      // A stale reading remains visible but cannot seal the current file bytes.
      return current ? [count, canonical({scope: region.scope, role: 'writes', form: 'alphabet', measure: 'bytes', value: bytes, at: `place:${bytes}`, by: 'bound'})] : [count];
    });
  }
  if (at === 8) return observed;
  throw Error(`REFUSE·receipt unsupported resolution ${at}`);
}
