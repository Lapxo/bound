import { join } from '../host/io.ts';
import { wordOf } from './wire.ts';
import { ledgerLines, storeAt } from '../land/ledger.ts';
import { lockStanding } from './keys.ts';
import { fieldOf } from './claims.ts';
import { entriesIn, exists, observeText } from '../observe/files.ts';

/** A receipt as the fold sees it: the scope it paid and the coordinates it moved. */
interface Receipt {
  readonly scope: string;
  readonly digest: string;
  readonly moved: readonly string[];
}

/** The writer of the index that names, per scope, the receipts judged before the ledger existed. */

/** The receipt files the session index names for these scopes; without scopes, every receipt file. The index is a ledger. */
function receiptNames(store: string, dir: string, scopes?: readonly string[]): string[] {
  if (!scopes) return entriesIn(dir).map((entry) => entry.name);
  const wanted = new Set(ledgerLines(store, wordOf(lockStanding(store), 'families', 'session'))
    .filter((line) => scopes.includes(fieldOf(line, 'scope')))
    .map((line) => fieldOf(line, 'value').replace(/^sha256:/, '')));
  return [...wanted].flatMap((hex) => [`${hex}.json`, `sha256:${hex}.json`]).filter((name) => exists(join(dir, name)));
}

export function receiptsIn(store: string, scopes?: readonly string[]): readonly Receipt[] {
  const out: Receipt[] = [];
  const dir = storeAt(store, 'cas', 'receipts');
  for (const name of receiptNames(store, dir, scopes)) {
    if (!/^(sha256:)?[0-9a-f]{64}\.json$/.test(name)) continue;
    const parsed = JSON.parse(observeText(join(dir, name)) ?? '{}') as { receipt?: { kind?: string; floor?: unknown; moved?: unknown } };
    const r = parsed.receipt;
    if (r?.kind !== 'fact') continue;
    const floor = typeof r.floor === 'string' ? r.floor : (r.floor as { scope?: string } | undefined)?.scope ?? '';
    if (!floor) continue;
    const moved = Array.isArray(r.moved) ? r.moved.filter((m): m is string => typeof m === 'string') : [];
    out.push({ scope: floor.replace(/\.(status|count|id|ms|order|kind)$/, ''), digest: name.replace(/\.json$/, ''), moved });
  }
  for (const line of ledgerLines(store, 'judge')) {
    const at = fieldOf(line, 'at');
    if (fieldOf(line, 'value') !== 'present' || !at.startsWith('receipt:')) continue;
    if (scopes && !scopes.includes(fieldOf(line, 'scope'))) continue;
    const digest = at.slice('receipt:'.length);
    const envelope = JSON.parse(observeText(storeAt(store, 'cas', 'envelopes', `${digest.slice(digest.indexOf(':') + 1)}.json`)) ?? '{}') as {
      readonly before?: Readonly<Record<string, string>>;
      readonly after?: Readonly<Record<string, string>>;
    };
    const before = envelope.before ?? {};
    const after = envelope.after ?? {};
    const moved = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((coordinate) => before[coordinate] !== after[coordinate]);
    out.push({ scope: fieldOf(line, 'scope'), digest, moved });
  }
  return out;
}
