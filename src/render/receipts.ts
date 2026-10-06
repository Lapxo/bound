import {canonical, parse, wireAt} from '@lapxo/topos/wire';
import {receiptProjection} from '@lapxo/topos/receipts';
import {receiptsOf, keepCarried} from '../fold/resolved.ts';
import {bytesDigest} from '../fold/digests.ts';
import {keyOf} from '../fold/keys.ts';
import type {PlaceFold} from '../cli/place.ts';
/** Native receipts are a protocol projection of actual fold observations, not a domain renderer or an acceptance verdict. */
export function receiptRegion(fold: PlaceFold, at: number): readonly string[] {
  const records = fold.standing.map(line => {const got = parse(line); return got.kind === 'fact' ? got.value.fields : {};});
  const fields = [...(wireAt(records, fold.epoch)?.lists.get('receipt-fields') ?? [])];
  const observed = receiptsOf(fold);
  const hash = (bytes: string): string => bytesDigest(fold.store, new TextEncoder().encode(bytes));
  const head = keyOf(fold.store, 'attest');
  const projection = receiptProjection(observed, fields, hash, head ? [head] : []);
  const set = keepCarried(fold.store, observed);
  if (at === 0) return [canonical({scope: 'receipts', role: 'writes', form: 'alphabet', measure: 'digest', value: projection.root, at: `place:${set}`, by: 'bound'})];
  if (at === 1) return projection.regions.map(region => canonical({scope: region.scope, role: 'writes', form: 'interval', measure: 'count', value: `${region.count}..${region.count}`, at: `place:${region.digest}`, by: 'bound'}));
  if (at === 8) return observed;
  throw Error(`REFUSE·receipt unsupported resolution ${at}`);
}
