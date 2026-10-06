import { createHash, dirname, existsSync, join, mkdirSync, readdirSync, renameSync, writeFileSync } from '../host/io.ts';
import { bytesDigest, coordinateDigest } from './digests.ts';
import { viewsOf } from './views.ts';
import { landMemo, ledgerLines, memoAt } from '../land/ledger.ts';
import { observeText } from '../observe/files.ts';
import type { PlaceFold } from '../cli/place.ts';
import { EXTENSION, fieldOf } from './claims.ts';
import { keyFor, lockSigners } from './keys.ts';
import { sourceOf, vouching } from '../land/vouched.ts';
import { wordsOf } from './wire.ts';
import { ownLock } from '../observe/runner.ts';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);
const atOf = (line: string): string => {
  if (line.includes(' about=')) return fieldOf(line, 'at');
  const from = line.indexOf(' at=') + ' at='.length;
  return line.slice(from, line.indexOf(' ', from));
};

/**
 * The points a fold folds: each coordinate the place holds at the digest its readers last read it, with what they said of
 * it there, the lines that stand, and the receipts the store keeps. A coordinate is never a digest it had before nor a coordinate
 * of another place, so an edit elsewhere moves nothing here; and a reader is what it said, so a reader edit that says
 * the same moves nothing either. A fold is a function of these points, so a fold that was not found is never a
 * mystery — what moved is the difference between the points kept beside the last one and the points there are now.
 */
export type PlaceReads = { readonly owned: readonly string[]; readonly scopes: ReadonlySet<string>; readonly place: string };

export function foldPoints(store: string, standing: readonly string[], under: string | undefined, keeper?: string, instrument = '', observed: readonly string[] = [], root = dirname(store), answered?: ReadonlyMap<string, string>, reads?: PlaceReads): readonly string[] {
  const said = new Map<string, string[]>();
  for (const line of answered === undefined ? observed : []) {
    if (line.includes(' measure=observed ')) continue;
    const key = `${fieldOf(line, 'by').split(':')[1] ?? ''} ${atOf(line)}`;
    (said.get(key) ?? said.set(key, []).get(key)!).push(line);
  }
  const coordinates = observed
    .filter((line) => line.includes(' measure=observed ') && atOf(line).startsWith('place:') && (!under || fieldOf(line, 'scope').startsWith(under)))
    .map((line) => ((key) => `${fieldOf(line, 'scope')} ${atOf(line)} ${answered?.get(key) ?? saidDigest(store, said.get(key) ?? [])}`)(`${fieldOf(line, 'by').split(':')[1] ?? ''} ${atOf(line)}`));
  const signers = new Set(reads ? lockSigners(store) : []);
  const tree = reads ? vouching(standing) : undefined;
  const digestOf = (lines: readonly string[]): string => bytesDigest(store, text(lines.join('\n')));
  const narrowed = reads === undefined ? [] : [
    `lock ${digestOf([...reads.owned].sort())}`,
    `judge ${digestOf(ledgerLines(store, 'judge').filter((line) => reads.scopes.has(fieldOf(line, 'scope'))))}`,
    `take ${digestOf(ledgerLines(store, 'take').filter((line) => reads.scopes.has(fieldOf(line, 'scope').replace(/^take\//, ''))))}`,
    `tree ${digestOf(ledgerLines(store, tree ?? '').filter((line) => (sourceOf(line) ?? '').startsWith(reads.place)))}`,
  ];
  const heads = (existsSync(join(store, 'ledger')) ? readdirSync(join(store, 'ledger')) : []).filter((name) => name.endsWith(EXTENSION)).map((name) => name.slice(0, -EXTENSION.length))
    .filter((writer) => writer !== keeper && writer !== 'gate' && !writer.startsWith('reader') && !(reads && (signers.has(writer) || writer === 'judge' || writer === 'take' || writer === tree)))
    .map((writer) => `${writer} ${writer === liveWriter(store, standing) ? lastWord(store, writer) : bytesDigest(store, text(ledgerLines(store, writer).join('\n')))}`);
  const written = [...new Set([...viewsOf(standing).values()].flatMap((view) => ('regions' in view && view.shape ? [view.shape] : [])))].sort()
    .map((shape) => `written ${shape} ${coordinateDigest(store, join(root, under ?? '', shape)) ?? 'absent'}`);
  const lined = ownLock().filter((line) => fieldOf(line, 'scope').startsWith('region/') && fieldOf(line, 'measure') === 'lines' && fieldOf(line, 'value') !== 'withdraw')
    .flatMap((line) => fieldOf(line, 'value').split('|').filter(Boolean)).sort().map((coordinate) => `lines ${coordinate} ${coordinateDigest(store, join(root, under ?? '', coordinate)) ?? 'absent'}`);
  return [
    `place ${under ?? '.'}`,
    `instrument ${instrument}`,
    ...written,
    ...lined,
    ...[...new Set(coordinates)].sort(),
    ...heads.sort(),
    ...narrowed,
    `lines ${bytesDigest(store, text([...standing].sort().join('\n')))}`,
    ...(existsSync(join(store, 'cas', 'receipts')) ? readdirSync(join(store, 'cas', 'receipts')).sort() : []),
  ];
}

/**
 * What a reader said at one digest, as one digest: every point of a fold that stands for an answer is this. The writer
 * whose class the lock names live is judged when read, so a fold keeps what it said — which lines it found standing and
 * which ledger it folded — and not when.
 */
export const saidDigest = (store: string, lines: readonly string[]): string => bytesDigest(store, text([...new Set(lines
  .filter((line) => !line.includes(' measure=observed ') && !line.includes(' scope=cost/'))
  .map((line) => `${fieldOf(line, 'scope')} ${fieldOf(line, 'measure')} ${fieldOf(line, 'value')}`))].sort().join('\n')));

function liveWriter(store: string, standing: readonly string[]): string | undefined {
  if (!wordsOf(standing, 'live').includes('attest')) return undefined;
  try {
    return keyFor(store, 'attest');
  } catch {
    return undefined;
  }
}

const lastWord = (store: string, writer: string): string => ((last) => `${fieldOf(last, 'at')} ${fieldOf(last, 'restsOn')} ${fieldOf(last, 'value')}`)(
  ledgerLines(store, writer).filter((line) => fieldOf(line, 'scope') === `${writer}/target`).at(-1) ?? '');

export function movedPoints(store: string, now: readonly string[], key: string): { readonly gone: readonly string[]; readonly came: readonly string[] } | undefined {
  const last = observeText(memoAt(store, lastOf(now)))?.trim();
  const held = last === undefined || last === key ? undefined : observeText(memoAt(store, `fold/${last}`));
  if (held === undefined) return undefined;
  const was = new Set(((JSON.parse(held) as { readonly points?: readonly string[] }).points ?? []));
  const has = new Set(now);
  return { gone: [...was].filter((one) => !has.has(one)), came: now.filter((one) => !was.has(one)) };
}

const lastOf = (points: readonly string[]): string => `last/${createHash('sha256').update(points[0] ?? '').digest('hex')}`;

/**
 * A fold is kept under its key and a view's text under the key and the view's name, in the store's memos: the first to
 * keep a key keeps it, since one point set folds into one set of bytes, and a fold kept by another instrument is
 * another origin's, readable as history and never as this instrument's own state.
 */
const elsewhere = { folds: 0 };
export const foldsElsewhere = (): number => elsewhere.folds;

type Packed = Omit<PlaceFold, 'standing' | 'observed' | 'grey' | 'refused' | 'demands' | 'paid' | 'missing' | 'history' | 'orphans' | 'signed'> & {
  readonly standing: string;
  readonly observed: string;
  readonly grey: string;
  readonly refused: string;
  readonly demands: string;
  readonly paid: string;
  readonly missing: string;
  readonly history: string;
  readonly orphans: string;
  readonly signed: readonly [string, number][];
};

const joined = (lines: readonly string[]): string => lines.join('\n');
const split = (text: string): readonly string[] => (text === '' ? [] : text.split('\n'));
const linesOf = (value: string | readonly string[] | undefined): readonly string[] =>
  value === undefined ? [] : typeof value === 'string' ? split(value) : value;

export function keptPlace(store: string, under?: string): PlaceFold | undefined {
  const key = observeText(memoAt(store, lastOf([`place ${under ?? '.'}`])))?.trim();
  if (key === undefined || key === '') return undefined;
  const held = observeText(memoAt(store, `fold/${key}`));
  if (held === undefined) return undefined;
  const blob = JSON.parse(held) as { readonly fold: Packed & { readonly standing?: string | readonly string[] } };
  const fold = blob.fold;
  return {
    ...fold,
    standing: linesOf(fold.standing),
    observed: linesOf(fold.observed),
    grey: linesOf(fold.grey),
    refused: linesOf(fold.refused),
    demands: linesOf(fold.demands),
    paid: linesOf(fold.paid),
    missing: linesOf(fold.missing),
    history: linesOf(fold.history),
    orphans: linesOf(fold.orphans),
    signed: new Map(fold.signed),
    kept: true,
  };
}

export const keptRender = (store: string, key: string, name: string): string | undefined => observeText(memoAt(store, `render/${key}/${name}`));

export const keepRender = (store: string, _signer: string, key: string, name: string, _epoch: number, text_: string): void => { landMemo(store, `render/${key}/${name}`, text(text_)); };

export function keepFold(store: string, key: string, fold: PlaceFold, points: readonly string[], instrument = ''): void {
  const packed: Packed = {
    ...fold,
    standing: joined(fold.standing),
    observed: joined(fold.observed),
    grey: joined(fold.grey),
    refused: joined(fold.refused),
    demands: joined(fold.demands),
    paid: joined(fold.paid),
    missing: joined(fold.missing),
    history: joined(fold.history),
    orphans: joined(fold.orphans),
    signed: [...fold.signed],
    kept: false,
  };
  landMemo(store, `fold/${key}`, text(JSON.stringify({ fold: packed, points, instrument })));
  const at = memoAt(store, lastOf(points));
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(`${at}.${process.pid}.part`, `${key}\n`);
  renameSync(`${at}.${process.pid}.part`, at);
}
