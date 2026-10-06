import { dirname, existsSync, join, mkdirSync, statSync, writeFileSync } from '../host/io.ts';
import { canonical, LOCK } from '@lapxo/topos/wire';
import { RECEIPTS, fieldOf, isWire } from './claims.ts';
import { bytesDigest as hashBytes, fullDigest as hashFull } from '../host/digest.ts';
import { worldAt } from './places.ts';
import { ownLockOf } from './signed.ts';
import { viewsOf } from './views.ts';
import { storeAt, storeOf } from '../land/ledger.ts';
import { coordinatesUnder, observeFile, observeText } from '../observe/files.ts';
import { carriedFrom } from './resolved.ts';
import { takenFor } from '../fold/place-inputs.ts';

/** A region is closed when the digest of its bytes is the one its receipt names. Folding a closed region is idle: idleCount is how many were already closed, actSeconds how long this act has run, receiptsSeen how many receipts were read and how long that took. */
let idle = 0;
const began = Date.now();
let seen = { count: 0, ms: 0 };

export const idleCount = (): number => idle;

export const noteIdle = (): void => {
  idle += 1;
};

export const actSeconds = (): number => Math.max(0, Math.round((Date.now() - began) / 1000));

export const receiptsSeen = (): { readonly count: number; readonly ms: number } => seen;

const algorithmIn = (text: string): string => text.match(/(?:value=|place:)([a-z0-9]+):[0-9a-f]{64}/)?.[1] ?? '';

const lockStamp = (root: string, place: string): string => {
  const name = place.replace(/\/$/, '');
  try {
    const st = statSync(join(root, name, LOCK));
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return 'none';
  }
};

function filesOf(root: string, place: string, region: string): readonly string[] {
  const step = region.replace(/^receipts\//, '').replace(/\/$/, '');
  const name = place.replace(/\/$/, '');
  const own = existsSync(join(root, name, LOCK)) ? [name ? `${name}/${LOCK}` : LOCK] : [];
  const receipt = `${name ? `${name}/` : ''}${RECEIPTS}`;
  return [...new Set([...coordinatesUnder(join(root, place, step), root), ...own])].filter((rel) => rel !== receipt && !rel.split('/').some((part) => part === '.bound' || part === '.cache' || part === '.git'));
}

const rooted = new Map<string, readonly string[]>();

function rootLines(root: string, place: string): readonly string[] {
  const name = place.replace(/\/$/, '');
  if (!name) return [];
  const key = `${root}\0${name}\0${lockStamp(root, '')}`;
  const held = rooted.get(key);
  if (held !== undefined) return held;
  const standing = (observeText(join(root, LOCK)) ?? '').split('\n').filter(isWire);
  const lines = standing.filter((line) => fieldOf(line, 'value') !== 'withdraw');
  const take = takenFor(lines, `${name}/`, worldAt(root, name) ? { own: ownLockOf(root, name), tree: viewsOf(standing) } : undefined);
  const got = lines.filter(take).map((line) => `root ${line}`);
  rooted.set(key, got);
  return got;
}

/** File-fold identity uses public inputs; admission history stays in its separate ledger guard. */
export function fileRegionDigest(root: string, place: string, region: string, algorithm: string): string {
  const files = filesOf(root, place, region);
  return hashFull([...files.map((rel) => `${rel} ${hashBytes(observeFile(join(root, rel)) ?? new Uint8Array(), algorithm)}`), ...rootLines(root, place)], algorithm);
}

function namedReceipts(root: string, store: string): ReadonlyMap<string, string> {
  const text = observeText(join(root, RECEIPTS));
  const carried = carriedFrom(store, (text ?? '').split('\n').filter(isWire));
  const out = new Map<string, string>();
  for (const line of carried ?? []) {
    if (!isWire(line) || fieldOf(line, 'measure') !== 'digest') continue;
    const place = /^write\/([^/]+)\/receipts\.bound$/.exec(fieldOf(line, 'scope'))?.[1];
    if (place) out.set(place, fieldOf(line, 'value'));
  }
  return out;
}

function ownBytes(root: string): readonly string[] {
  return (observeText(join(root, RECEIPTS)) ?? '').split('\n').filter(line => isWire(line) && fieldOf(line, 'measure') === 'bytes');
}

function bytesMeet(root: string, place: string): boolean {
  const lines = (observeText(join(root, place, RECEIPTS)) ?? '').split('\n').filter((line) => isWire(line) && fieldOf(line, 'measure') === 'bytes');
  const algorithm = algorithmIn(lines.join('\n'));
  return lines.length > 0 && algorithm !== '' && lines.map((line) => fieldOf(line, 'value')).join('\n') === lines.map((line) => fileRegionDigest(root, place, fieldOf(line, 'scope'), algorithm)).join('\n');
}

const stampAt = (store: string): string => storeAt(store, 'cas', 'instrument');

export const instrumentKept = (store: string): string => (observeText(stampAt(store)) ?? '').trim();

export function instrumentKeep(store: string, id: string): void {
  mkdirSync(dirname(stampAt(store)), { recursive: true });
  writeFileSync(stampAt(store), `${id}\n`);
}

export function receiptPlaces(root: string, store: string): readonly string[] {
  const children = [...namedReceipts(root, store).keys()];
  return ownBytes(root).length ? ['', ...children] : children;
}

function rewritePlace(root: string, place: string): void {
  const at = join(root, place, RECEIPTS);
  const text = observeText(at) ?? '';
  const algorithm = algorithmIn(text);
  if (algorithm === '') return;
  const kept = text.split('\n').filter((line) => line === '' || !isWire(line) || fieldOf(line, 'measure') !== 'bytes');
  const regions = kept.filter((line) => isWire(line) && fieldOf(line, 'measure') === 'count' && fieldOf(line, 'scope').startsWith('receipts/'));
  const bytes = regions.map((line) => {
    const scope = fieldOf(line, 'scope');
    const now = fileRegionDigest(root, place, scope, algorithm);
    return canonical({ scope, role: 'writes', form: 'alphabet', measure: 'bytes', value: now, at: `place:${now}`, by: fieldOf(line, 'by') || 'bound' });
  });
  writeFileSync(at, `${[...kept.filter((line) => line !== ''), ...bytes].join('\n')}\n`);
}

export async function closeReceipts(root: string, store: string, semantic?: ReadonlyMap<string,string>): Promise<readonly string[]> {
  if (semantic) {
    const lines=(observeText(join(root,RECEIPTS))??'').split('\n').filter(isWire);
    return [...semantic].filter(([scope,digest])=>!lines.some(line=>fieldOf(line,'scope')===scope&&fieldOf(line,'measure')==='bytes'&&fieldOf(line,'value')===digest)).map(([scope])=>scope);
  }
  const open = receiptPlaces(root, store).filter((place) => !meets(root, store, `${place}/`));
  for (const place of open) {
    rewritePlace(root, place);
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  return open;
}

/** One comparison. A place meets its receipt; the root meets when every receipt it names meets. */
export function meets(root: string, store: string, place: string): boolean {
  const name = place.replace(/\/$/, '');
  if (name === '') {
    const at = Date.now();
    const named = namedReceipts(root, store);
    const own = ownBytes(root);
    const carried = own.length ? carriedFrom(store, (observeText(join(root, RECEIPTS)) ?? '').split('\n').filter(isWire)) : undefined;
    const ownClosed = own.length > 0 && carried !== undefined && carried.length > 0 && bytesMeet(root, '');
    const closed = (own.length > 0 ? ownClosed : named.size > 0) && [...named].every(([one, expected]) => {
      const bytes = observeFile(join(root, one, RECEIPTS));
      const algorithm = expected.split(':')[0];
      return bytes !== undefined && hashBytes(bytes, algorithm) === expected && meets(root, store, `${one}/`);
    });
    seen = { count: named.size + (own.length > 0 ? 1 : 0), ms: Date.now() - at };
    return closed;
  }
  const lines = (observeText(join(root, place, RECEIPTS)) ?? '').split('\n').filter((line) => isWire(line) && fieldOf(line, 'measure') === 'bytes');
  const lock = existsSync(join(root, name, LOCK));
  if (lines.length > 0) return bytesMeet(root, place);
  if (lock) return false;
  const expected = namedReceipts(root, store).get(name);
  const file = expected !== undefined ? observeFile(join(root, place, RECEIPTS)) : undefined;
  const algorithm = file === undefined ? '' : algorithmIn(new TextDecoder().decode(file));
  const closed = file !== undefined && algorithm !== '' && hashBytes(file, algorithm) === expected;
  return closed;
}
