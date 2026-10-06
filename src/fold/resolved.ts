import { createHash, dirname, existsSync, join, linkSync, mkdirSync, readdirSync, renameSync, writeFileSync } from '../host/io.ts';
import { canonical, parse } from '@lapxo/topos/wire';
import { RECEIPTS, fieldOf, isWire } from './claims.ts';
import { bytesDigest } from './digests.ts';
import { carriesOnly } from './observed.ts';
import { writerFor } from './signers.ts';
import { viewsOf } from './views.ts';
import { zoomed } from './zoom.ts';
import { ledgerLines, storeAt } from '../land/ledger.ts';
import { sourced } from '../land/vouched.ts';
import { entriesIn, observeFile, observeText } from '../observe/files.ts';
import type { PlaceFold } from '../cli/place.ts';

export const bytesOnly = (line: string): string => {
  const got = parse(line);
  return got.kind === 'fact' && fieldOf(line, 'measure') === 'observed' ? canonical({ ...got.value.fields, value: fieldOf(line, 'at').replace(/^.*:/, '').slice(0, 16) }) : line;
};

const held = new WeakMap<PlaceFold, readonly string[]>();

/**
 * Every receipt of a place, @8: the bytes of what it observed that a reading ran over, those readings, the verdicts its
 * paid demands were taken with, and at the root the digest of each place's own receipts. The attest is none of them:
 * it stands in the root lock and the release, naming the root these lines resolve to. The fold keeps the set in the
 * root's store under the digest of its bytes, which every line that resolves it names, and what a place with no reader
 * carries is read back from there, never from a file the place ships.
 */
export function receiptsOf(fold: PlaceFold): readonly string[] {
  const kept = held.get(fold);
  if (kept !== undefined) return kept;
  if (!fold.observed.length && carriesOnly(fold.root, fold.store)) return held.set(fold, [...new Set(carriedIn(fold.store).flatMap((file) => (observeText(file) ?? '').split('\n').filter(isWire)))]).get(fold)!;
  const under = fold.under ?? '';
  const shape = [...viewsOf(fold.standing).values()].flatMap((view) => ('regions' in view && view.regions.some((one) => one.name === 'receipts') ? [view.shape] : []))[0] ?? '';
  const closed = under || !shape ? [] : entriesIn(fold.root).filter((entry) => entry.dir && observeText(join(fold.root, entry.name, shape)) !== undefined).map((entry) => `${entry.name}/`).sort();
  const own = (place: string): boolean => place.startsWith(under) && !closed.some((one) => place.startsWith(one)) && (!shape || !place.endsWith(shape));
  const mine = new Set(fold.observed.filter((line) => fieldOf(line, 'measure') === 'observed' && own(fieldOf(line, 'scope')))
    .map((line) => `${fieldOf(line, 'by')} ${fieldOf(line, 'at')}`));
  const ran = [...new Set(fold.observed.filter((line) => fieldOf(line, 'measure') !== 'observed'
    && mine.has(`${fieldOf(line, 'by')} ${fieldOf(line, 'at')}`)))];
  const ranAt = new Set(ran.map((line) => `${fieldOf(line, 'by')} ${fieldOf(line, 'at')}`));
  const cones = new Set(fold.observed.filter((line) => fieldOf(line, 'measure') === 'observed' && own(fieldOf(line, 'scope')) && ranAt.has(`${fieldOf(line, 'by')} ${fieldOf(line, 'at')}`)).map(bytesOnly));
  const paid = ledgerLines(fold.store, 'judge').filter((line) => fold.paid.some((demand) => fieldOf(demand, 'scope') === fieldOf(line, 'scope')
    && !(closed.length > 0 && fieldOf(demand, 'needs').split('|').filter(Boolean).length > 0
      && fieldOf(demand, 'needs').split('|').filter(Boolean).every((need) => closed.some((one) => need.startsWith(one))))));
  const named = closed.map((place) => {
    const digest = bytesDigest(fold.store, observeFile(join(fold.root, place, shape)) ?? new Uint8Array());
    return canonical({ scope: `${sourced(fold.standing)}/${place}${shape}`, role: 'writes', form: 'alphabet', measure: 'digest', value: digest, by: writerFor(fold.standing, 'fold') ?? '', at: `place:${digest}` });
  });
  const place = under.replace(/\/$/, '');
  const lines = [...named, ...[...cones].sort(), ...[...ran].sort(), ...paid].map((line) => (place ? zoomed(line, place) : line));
  if (!lines.length) {
    const shipped = (observeText(join(fold.root, under, RECEIPTS)) ?? '').split('\n').filter(isWire);
    const carried = carriedFrom(fold.store, shipped);
    if (carried !== undefined && carried.length) return held.set(fold, carried).get(fold)!;
  }
  held.set(fold, lines);
  keepCarried(fold.store, lines);
  return lines;
}

export function keepCarried(store: string, lines: readonly string[], from?: string): string {
  const text = lines.map((line) => `${line}\n`).join('');
  const digest = createHash('sha256').update(text).digest('hex');
  const at = storeAt(store, 'cas', 'carried', digest);
  if (existsSync(at)) {
    verifiedCarried(at, digest);
  } else {
    mkdirSync(dirname(at), { recursive: true });
    const src = from === undefined ? '' : storeAt(from, 'cas', 'carried', digest);
    if (src && existsSync(src)) {
      verifiedCarried(src, digest);
      try {
        linkSync(src, at);
        return `sha256:${digest}`;
      } catch {
        // Cross-device stores still keep the authenticated bytes below.
      }
    }
    writeFileSync(`${at}.${process.pid}`, text);
    renameSync(`${at}.${process.pid}`, at);
  }
  return `sha256:${digest}`;
}

/**
 * What a copy of a place reads back of its receipts: the lines it shipped when they are the whole set, or, when they
 * name a root at the digest of its bytes, the set the store keeps there; a root the store does not keep is no set, and
 * the caller refuses rather than read the lines that only name it.
 */
export function carriedFrom(store: string, shipped: readonly string[]): readonly string[] | undefined {
  const named = shipped.find((line) => fieldOf(line, 'scope') === 'receipts' && fieldOf(line, 'measure') === 'digest');
  if (named === undefined) return shipped;
  // Resolution 8 may precede its authenticated summary in the same public file.
  // It is evidence only if its exact bytes meet the summary's carrier digest.
  for (let i = 1; i < shipped.length; i += 1) {
    const header = shipped[i]!;
    if (fieldOf(header, 'scope') !== 'receipts' || fieldOf(header, 'measure') !== 'digest') continue;
    const digest = fieldOf(header, 'at').replace(/^place:sha256:/, '');
    const body = shipped.slice(0, i);
    if (/^[0-9a-f]{64}$/.test(digest) && createHash('sha256').update(body.map(line => `${line}\n`).join('')).digest('hex') === digest) return body;
  }
  const hex = fieldOf(named, 'at').replace(/^place:(?:sha256:)?/, '');
  const text = /^[0-9a-f]{64}$/.test(hex) ? verifiedCarried(storeAt(store, 'cas', 'carried', hex), hex) : undefined;
  return text === undefined ? undefined : text.split('\n').filter(isWire);
}

export const carriedIn = (store: string): readonly string[] => ((dir) => (existsSync(dir)
  ? readdirSync(dir).filter((name) => /^[0-9a-f]{64}$/.test(name)).sort().map((name) => {
    const at = join(dir, name);
    verifiedCarried(at, name);
    return at;
  }) : []))(storeAt(store, 'cas', 'carried'));

/** Authenticate the existing SHA-256 receipt carrier before interpreting any lines. */
function verifiedCarried(at: string, expected: string): string | undefined {
  const bytes = observeFile(at);
  if (bytes === undefined) return undefined;
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw Error(`REFUSE·receipt carried bytes mismatch · expected sha256:${expected} · got sha256:${actual}`);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
