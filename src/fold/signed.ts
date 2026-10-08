import { join } from '../host/io.ts';
import { region, within } from '@lapxo/obligations/field';
import { LOCK, parse, windowAt } from '@lapxo/topos/wire';
import { fieldOf, foldClaims, isWire, sayingOf } from './claims.ts';
import { signaturesOf } from './digests.ts';
import { lockLines, lockStanding } from './keys.ts';
import { wordOf } from './wire.ts';
import { authorityFor, rootSigner } from './signers.ts';
import { ledgerLines, shardLines, storeOf } from '../land/ledger.ts';
import { verifiesFields } from '../land/sign.ts';
import { observeText } from '../observe/files.ts';

type Verified = { readonly text: string; readonly lock: readonly string[]; readonly lines: readonly string[]; readonly applied: ReadonlySet<string>; readonly projected: ReadonlySet<string>; readonly folded: Map<boolean, readonly string[]> };
const held = new Map<string, Verified>();
const told = new Map<string, readonly string[]>();

/** Lines told to a place's own lock for a preview: folded as if the file held them, and standing only as its signed lines do. */
export const tellOwn = (place: string, lines: readonly string[]): void => void told.set(place, lines);

function verified(root: string, place: string, preview=true): Verified {
  const store = storeOf(root);
  const lock = lockLines(store);
  const publicText = observeText(join(root, place, LOCK)) ?? '';
  const hasAuthority = lock.some(line => fieldOf(line, 'sig') !== '');
  const algorithms = hasAuthority ? signaturesOf(store).admitted : [];
  const signers = algorithms.length ? authorityFor(lock, rootSigner(root), algorithms).admitted : [];
  const history = signers.flatMap(signer => place ? shardLines(store, signer.id, `${place}/${LOCK}`) : ledgerLines(store, signer.id)).filter(line => fieldOf(line, 'sig') !== '');
  const text = [publicText, ...history, ...(preview?told.get(place)??[]:[])].join('\n');
  const key = `${root} ${place}`;
  const last = held.get(key);
  if (last !== undefined && last.text === text && last.lock === lock) return last;
  const lines = [...new Set(text.split('\n').filter(isWire))];
  // Unrestricted coverage does not construct a region coordinate. Restricted
  // coverage still requires the lock's declared namespace before comparison.
  const family = signers.some(signer => !signer.coverage.includes('*')) ? wordOf(lockStanding(store), 'families', 'region') : '';
  const stands=(line:string):boolean=>ownRecordAdmitted(line,place,family,signers,algorithms);
  const applied = new Set(lines.filter(stands));
  // A published copy of an authenticated delivery is not another inscription.
  const projected = new Set([...applied].map(sayingOf));
  const got: Verified = { text, lock, lines, applied, projected, folded: new Map() };
  held.set(key, got);
  return got;
}

/**
 * A place's own lock, folded as the tree folds its own: a line that carries a signature stands only when a key the
 * tree's lock admits signed it, inside the window that key held at the epoch it signed and inside its coverage of the
 * place, the line's scope read as a region of the place; a line that carries none is the place's target text until the
 * place signs its lock, and never stands where only signed lines are asked for.
 */
export function ownLockOf(root: string, place: string, signedOnly = false): readonly string[] {
  const got = verified(root, place);
  const kept = got.folded.get(signedOnly);
  if (kept !== undefined) return kept;
  const standing = foldClaims(got.lines.filter((line) => got.applied.has(line) || (!signedOnly && !/ sig=/.test(line) && !got.projected.has(sayingOf(line))))).standing
    .filter((line) => fieldOf(line, 'value') !== 'withdraw');
  got.folded.set(signedOnly, standing);
  return standing;
}

/**
 * What a place's own lock holds by signature — a key the tree admits signed the line, inside its window and its coverage
 * of the place — withdrawal or not: whether one line stands there so, the lines that do, and how many were written into
 * the lock rather than applied to it.
 */
export const admittedIn = (root: string, place: string, line: string): boolean => verified(root, place).applied.has(line);

export const appliedIn = (root: string, place: string): readonly string[] => [...verified(root, place).applied];

export const forksIn = (root: string, place: string): readonly string[] => ((got) => foldClaims(got.lines.filter((line) => got.applied.has(line) || (!/ sig=/.test(line) && !got.projected.has(sayingOf(line))))).forks.map((fork) => fork.key))(verified(root, place));

export const writtenIn = (root: string, place: string): number => ((got) => got.lines.filter((line) => !got.applied.has(line)).length)(verified(root, place));

/** Authenticated history excludes prospective lines told only for admission. */
export const appliedHistoryIn=(root:string,place:string):readonly string[]=>[...verified(root,place,false).applied];

/** Shared signature/window/coordinate coverage boundary for own history. */
export function ownRecordAdmitted(line:string,place:string,family:string,signers:ReturnType<typeof authorityFor>['admitted'],algorithms:readonly string[]):boolean{
    const got = parse(line);
    if (got.kind !== 'fact' || got.value.fields['sig'] === undefined) return false;
    const fields = got.value.fields;
    const signer = signers.find((one) => one.id === fields['by']);
    const epoch = Number(fields['epoch']) || 0;
    if (signer === undefined || !verifiesFields(fields, signer.publicKey, algorithms)) return false;
    const window = windowAt(signer, epoch);
    return epoch >= window.start && (window.close === null || epoch <= window.close)
      && signer.coverage.some((prefix) => prefix === '*' || within(region(`${family}/${place}/${fields['scope'] ?? ''}`, './'), region(prefix, './')));
}
