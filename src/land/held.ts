import { fieldOf } from '../fold/claims.ts';
import { spanOf } from '@lapxo/topos/forms';
import { blobAt, ledgerLines, storeAt } from './ledger.ts';

const STORE = 'store';
export interface Held {
  readonly scope: string;
  readonly bytes: number;
  readonly at: string;
}

const pathOf = (store: string, scope: string): string => {
  const name = scope.split('/').pop() ?? '';
  if (scope.startsWith('cas/blobs/')) return blobAt(store, name);
  if (scope.startsWith('cas/laid/')) return storeAt(store, 'cas', 'laid', name);
  if (scope.startsWith('cas/answers/')) return storeAt(store, 'cas', 'answers', name);
  return storeAt(store, ...scope.split('/'));
};

const sizeOf = (line: string): number => spanOf(fieldOf(line, 'value'))?.hi ?? 0;

function inventory(store: string): readonly Held[] {
  return ledgerLines(store, STORE).filter((line) => fieldOf(line, 'value') !== 'withdraw').map((line) => {
    const scope = fieldOf(line, 'scope');
    return { scope, bytes: sizeOf(line), at: pathOf(store, scope) };
  });
}

/** Bytes the store receipts name: a byte lives only while a standing line names it, and the receipts list what is there. */
export const heldBytes = (_root: string, store: string, _standing: readonly string[]): number =>
  inventory(store).reduce((sum, one) => sum + one.bytes, 0);

