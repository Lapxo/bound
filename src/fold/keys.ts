import { dirname, existsSync, join } from '../host/io.ts';
import { ledgerLines, signedLines } from '../land/ledger.ts';
import { EXTENSION, fieldOf, foldClaims, isWire, LOCK, selfName } from './claims.ts';
import { entriesIn, observeText } from '../observe/files.ts';

type Keys = { readonly classes: ReadonlyMap<string, readonly string[]>; readonly signers: readonly string[] };

const held = new Map<string, Keys>();
const merged = new Map<string, { readonly parts: readonly (readonly string[])[]; readonly lines: readonly string[] }>();

/**
 * Whose lines carry a class of writing, as the lock says it. Every ledger the store keeps is read, the key claims
 * folded, and the class answered with the id the lock admitted first for it: no module here holds a signer's name, so
 * the day another head runs the same work its lines come out under its own name without a letter changing.
 */
export const keyOf = (store: string, kind: string, told: readonly string[] = []): string | undefined => keysOf(store, told).classes.get(kind)?.[0];

export function keyFor(store: string, kind: string, told: readonly string[] = []): string {
  const id = keyOf(store, kind, told);
  if (id === undefined) {
    throw new Error(`${selfName()}: REFUSE·keys the lock admits no key of class \`${kind}\`: name one as \`keys/<id> measure=class value=${kind}\``);
  }
  return id;
}

export function lockSigners(store: string, told: readonly string[] = []): readonly string[] {
  const keys = keysOf(store, told);
  const attests = new Set(keys.classes.get('attest') ?? []);
  return keys.signers.filter((id) => !attests.has(id));
}

export function lockLines(store: string): readonly string[] {
  const release = releaseOf(store);
  if (release) return release;
  const parts = lockSigners(store).map((id) => ledgerLines(store, id)).filter((part) => part.length > 0);
  const last = merged.get(store);
  if (last !== undefined && last.parts.length === parts.length && last.parts.every((part, i) => part === parts[i])) return last.lines;
  const lines = parts.length === 1 ? parts[0]! : parts.flat();
  merged.set(store, { parts, lines });
  return lines;
}

const standings = new WeakMap<readonly string[], readonly string[]>();

/** What stands of the lock, folded once per landing of any of its ledgers: lockLines is the bytes, lockSigners the ids that write them, signedLockLines the same lines still carrying their signatures. */
export function lockStanding(store: string): readonly string[] {
  const lines = lockLines(store);
  return standings.get(lines) ?? standings.set(lines, foldClaims(signedLockLines(store)).standing).get(lines)!;
}

export function signedLockLines(store: string, told: readonly string[] = []): string[] {
  const release = releaseOf(store);
  if (release) return [...release];
  return lockSigners(store, told).flatMap((id) => signedLines(store, id));
}

function keysOf(store: string, told: readonly string[]): Keys {
  const mine = told.length ? read(store, told) : held.get(store) ?? read(store);
  if (!told.length) held.set(store, mine);
  return mine;
}

const ledgerKeyLines = (store: string): readonly string[] => (existsSync(join(store, 'ledger')) ? entriesIn(join(store, 'ledger')).map((entry) => entry.name) : [])
  .filter((name) => name.endsWith(EXTENSION)).flatMap((name) => ledgerLines(store, name.slice(0, -EXTENSION.length)))
  .filter((line) => /\bsig=/.test(line) && /(?:^|\s)scope=keys\/[^/\s]+\s/.test(line));

const releases = new Map<string, readonly string[] | undefined>();

/**
 * A release's lock, where the store signs no key of its own: the lock as it was laid is the place's only lines, read
 * and never written. What it says is true where a pin names the release; no ledger is made of it.
 */
export function releaseOf(store: string): readonly string[] | undefined {
  if (releases.has(store)) return releases.get(store);
  const at = join(dirname(store), LOCK);
  const lines = ledgerKeyLines(store).length || !existsSync(at) ? [] : (observeText(at) ?? '').split('\n').filter(isWire);
  const got = lines.some((line) => fieldOf(line, 'scope') === 'publish/bootstrap' && fieldOf(line, 'value') !== 'withdraw') ? lines : undefined;
  releases.set(store, got);
  return got;
}

function read(store: string, told: readonly string[] = []): Keys {
  const said = [...ledgerKeyLines(store), ...releaseOf(store) ?? [], ...told]
    .filter((line) => /\bsig=/.test(line) && /(?:^|\s)scope=keys\/[^/\s]+\s/.test(line));
  const standing = foldClaims(said).standing.filter((line) => fieldOf(line, 'value') !== 'withdraw')
    .sort((a, b) => (Number(fieldOf(a, 'epoch')) || 0) - (Number(fieldOf(b, 'epoch')) || 0));
  const idOf = (line: string): string => fieldOf(line, 'scope').slice('keys/'.length);
  const classes = new Map<string, string[]>();
  for (const line of standing.filter((one) => fieldOf(one, 'measure') === 'class')) classes.set(fieldOf(line, 'value'), [...(classes.get(fieldOf(line, 'value')) ?? []), idOf(line)]);
  const named = new Set(standing.filter((one) => fieldOf(one, 'measure') === 'public-key').map(idOf));
  const signers = [...new Set(standing.filter((one) => fieldOf(one, 'measure') === 'class').map(idOf))].filter((id) => named.has(id));
  return { classes, signers };
}
