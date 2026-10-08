import {ledgerLines,ledgerWriters} from '../land/ledger.ts';
import {readOnly} from '../host/read-only.ts';
import { appendFileSync, dirname, join, mkdirSync, readdirSync, realpathSync, relative, resolve } from '../host/io.ts';
import { bytesDigest as bytesWith, fullDigest as fullWith } from '../host/digest.ts';
import { coordinatesUnder, observeFile, observeText, stampOf } from '../observe/files.ts';
import { releaseOf, signedLockLines } from './keys.ts';
import { EXTENSION, fieldOf, foldClaims, selfName } from './claims.ts';
import { wireLine } from './wire.ts';
import { publicLock, LOCK } from '@lapxo/topos/wire';
import {builtinModules,createRequire} from 'node:module';
import {moduleImports} from '../host/adapters/modules/javascript.ts';

const held = new Map<string, string>();
let algorithmMs = 0;

export const algorithmCost = (): number => algorithmMs;

/**
 * The algorithm this tree digests with: the one its wire names, read from the lock and told to the port, which keeps
 * none of its own. A lock that names no algorithm is a tree nothing can be digested in, and it is refused as one.
 */
function namedAlgorithm(store: string): string | undefined {
  const needle = 'scope=wire/digest-algorithms';
  const older = 'scope=audit/wire/digest-algorithms';
  let best = -1;
  let name = '';
  const release = releaseOf(store);
  if (release) {
    const said = release.find((line) => (fieldOf(line, 'scope') === 'wire/digest-algorithms' || fieldOf(line, 'scope') === 'audit/wire/digest-algorithms') && fieldOf(line, 'value') !== 'withdraw');
    return said === undefined ? undefined : fieldOf(said, 'value').split('|').filter(Boolean)[0]?.split(':')[0];
  }
  if (!existsLedger(store)) {
    const text = observeText(join(dirname(store), LOCK));
    const lines = text?.split('\n').filter(line => line.startsWith('bound-lock/'));
    const published = lines === undefined ? undefined : publicLock(lines);
    const contract = published === undefined ? undefined : wireLine(published, 'digest-algorithms');
    return contract === undefined ? undefined : fieldOf(contract, 'value').split('|')[0]?.split(':')[0];
  }
  for (const writer of ledgerWriters(store)) {
    const text = ledgerLines(store,writer).join('\n');
    let from = 0;
    while (from < text.length) {
      const at = (() => {
        const next = text.indexOf(needle, from);
        const was = text.indexOf(older, from);
        if (next < 0) return was;
        if (was < 0) return next;
        return Math.min(next, was);
      })();
      if (at < 0) break;
      const start = text.lastIndexOf('\n', at) + 1;
      const end = text.indexOf('\n', at);
      const line = text.slice(start, end < 0 ? undefined : end);
      from = end < 0 ? text.length : end + 1;
      if (!line.includes(' sig=')) continue;
      const epoch = Number(fieldOf(line, 'epoch')) || 0;
      if (epoch < best) continue;
      best = epoch;
      const value = fieldOf(line, 'value');
      name = value === 'withdraw' ? '' : (value.split('|').filter(Boolean)[0]?.split(':')[0] ?? '');
    }
  }
  return name || undefined;
}

function existsLedger(store: string): boolean {
  try { return readdirSync(join(store, 'ledger')).length > 0; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function algorithmOf(store: string): string {
  const mine = held.get(store);
  if (mine !== undefined) return mine;
  const first = namedAlgorithm(store);
  if (first === undefined) throw new Error(`${selfName()}: REFUSE·runtime the lock names no \`wire/digest-algorithms\`: nothing can be digested here`);
  held.set(store, first);
  return first;
}

/**
 * The signature algorithms this tree admits, and the one it signs with now: each carries its era after its name, the
 * wire's `era` line names the one that is current, and every other is history, read and never written again. A wire
 * that names no era signs with the one that carries a digest, which is how the first era was named.
 */
export function signaturesOf(store: string, told: readonly string[] = []): { readonly admitted: readonly string[]; readonly era: string } {
  return eraOf(foldClaims([...signedLockLines(store, told), ...told]).standing);
}

export function eraOf(standing: readonly string[]): { readonly admitted: readonly string[]; readonly era: string } {
  const said = wireLine(standing, 'signature-algorithms');
  const admitted = (said === undefined ? [] : fieldOf(said, 'value').split('|')).filter(Boolean);
  const current = wireLine(standing, 'era');
  const era = (current === undefined ? undefined : admitted.find((one) => one.endsWith(`:${fieldOf(current, 'value')}`))) ?? admitted.find((one) => one.includes(':'));
  if (era === undefined) throw new Error(`${selfName()}: REFUSE·runtime the lock names no signature algorithm by digest: nothing can be signed here`);
  return { admitted, era };
}

export const bytesDigest = (store: string, bytes: Uint8Array): string => bytesWith(bytes, algorithmOf(store));
export const fullDigest = (store: string, input: string | readonly string[]): string => fullWith(input, algorithmOf(store));

const stamped = new Map<string, Map<string, string>>();
const memoOf = (store: string): Map<string, string> => stamped.get(store) ?? stamped.set(store, new Map((observeText(join(store, 'cas', `stamps${EXTENSION}`)) ?? '')
  .split('\n').flatMap((row) => (row.indexOf('\t') > 0 ? [[row.slice(0, row.indexOf('\t')), row.slice(row.indexOf('\t') + 1)] as const] : [])))).get(store)!;

export function coordinateDigest(store: string, at: string): string | undefined {
  const stamp = stampOf(at);
  if (stamp?.kind !== 'file') return stamp === undefined ? undefined : bytesDigest(store, observeFile(at) ?? new Uint8Array());
  if (readOnly()) return bytesDigest(store, observeFile(at) ?? new Uint8Array());
  const key = `${at} ${stamp.stamp}`;
  const memo = memoOf(store);
  const held = memo.get(key);
  if (held !== undefined) return held;
  const digest = bytesDigest(store, observeFile(at) ?? new Uint8Array());
  memo.set(key, digest);
  if (readOnly()) return digest;
  mkdirSync(join(store, 'cas'), { recursive: true });
  appendFileSync(join(store, 'cas', `stamps${EXTENSION}`), `${key}\t${digest}\n`);
  return digest;
}

export function memoized(store: string, key: string, compute: () => string): string {
  const memo = memoOf(store);
  const held = memo.get(key);
  if (held !== undefined) return held;
  const value = compute();
  memo.set(key, value);
  if (readOnly()) return value;
  mkdirSync(join(store, 'cas'), { recursive: true });
  appendFileSync(join(store, 'cas', `stamps${EXTENSION}`), `${key}\t${value}\n`);
  return value;
}

const imported = new Map<string, readonly string[]>();
const importsOf = (store: string, at: string, digest: string): readonly string[] => {
  const key = `imports ${fullDigest(store,importsOf.toString())} ${digest}`;
  const memo = memoOf(store);
  const held = imported.get(digest) ?? (readOnly() ? undefined : memo.get(key)?.split('|').filter(Boolean));
  if (held !== undefined) return held;
  const found = moduleImports(new TextDecoder().decode(observeFile(at) ?? new Uint8Array()),at);
  imported.set(digest, found);
  memo.set(key, found.join('|'));
  if (!readOnly()) appendFileSync(join(store, 'cas', `stamps${EXTENSION}`), `${key}\t${found.join('|')}\n`);
  return found;
};

/**
 * The digest of the instrument itself: the entry module and everything it imports, by their bytes, and the source of
 * every region its lock says it depends on, followed as far as those regions depend — code it runs as much as its own.
 * A region its own lock names a release for, laid where it needs it, is that release by digest: what it runs, never a
 * sibling rebuilt beside it.
 * A fold is a function of its points and the instrument is one of them, so a fold kept by another bound is another
 * origin's fold — readable as history, never as this instrument's own state.
 */
export function instrumentOf(store: string, entry: string, standing: readonly string[] = [], root = dirname(resolve(entry)), releases: readonly string[] = []): string {
  return instrumentDigest(store, entry, standing, root, releases).replace(/^[^:]*:/, '').slice(0, 12);
}

export function instrumentDigest(store: string, entry: string, standing: readonly string[] = [], root = dirname(resolve(entry)), releases: readonly string[] = []): string {
  const seen = instrumentCoordinates(store, entry, standing, root, releases);
  return bytesDigest(store, new TextEncoder().encode([...seen.values()].sort().join('\n')));
}

export function instrumentCoordinates(store: string, entry: string, standing: readonly string[] = [], root = dirname(resolve(entry)), releases: readonly string[] = []): ReadonlyMap<string, string> {
  const seen = new Map<string, string>();
  const walk = (at: string): void => {
    if (seen.has(at)) return;
    const digest = coordinateDigest(store, at);
    if (digest === undefined) return;
    // The host loader resolves links before loading a module. Count that module
    // once, while retaining distinct modules even when their bytes are equal.
    const module = realpathSync(at);
    if (seen.has(module)) return;
    seen.set(module, digest);
    for (const one of importsOf(store, module, digest)) {
      if (one.startsWith('node:') || builtinModules.includes(one)) continue;
      if (one.startsWith('.')) walk(resolve(dirname(module), one));
      else walk(createRequire(module).resolve(one));
    }
  };
  walk(resolve(entry));
  const deps = standing.filter((line) => fieldOf(line, 'scope').startsWith('dep/') && fieldOf(line, 'value') !== 'withdraw')
    .map((line) => ({ region: fieldOf(line, 'scope').slice('dep/'.length).replace(/\*+$/, ''), on: fieldOf(line, 'value').split('|').filter((one) => one && one !== 'none') }));
  const released = new Map(releases.filter((line) => fieldOf(line, 'scope').startsWith('dep/') && fieldOf(line, 'role') === 'reads' && fieldOf(line, 'needs') && fieldOf(line, 'value') !== 'withdraw')
    .map((line) => [fieldOf(line, 'scope').slice('dep/'.length), fieldOf(line, 'value')] as const));
  const reached = new Set<string>();
  const follow = (region: string | undefined): void => {
    for (const name of deps.find((dep) => dep.region === region)?.on ?? []) {
      if (released.has(name)) {
        seen.set(`release:${name}`, released.get(name)!);
        continue;
      }
      for (const next of deps.filter((dep) => dep.region.startsWith(`${name}/`) && !reached.has(dep.region))) {
        reached.add(next.region);
        for (const coordinate of coordinatesUnder(resolve(root, next.region), root)) walk(resolve(root, coordinate));
        follow(next.region);
      }
    }
  };
  follow(deps.find((dep) => relative(root, resolve(entry)).startsWith(dep.region))?.region);
  const home = relative(root, resolve(entry)).split('/')[0] ?? '';
  for (const line of standing.filter((one) => fieldOf(one, 'scope').startsWith(`${home}/process/`) && fieldOf(one, 'kind') === 'process' && fieldOf(one, 'value') !== 'withdraw')) {
    for (const need of fieldOf(line, 'needs').split('|').filter(Boolean)) walk(resolve(root, need));
  }
  for (const line of releases.filter(one=>fieldOf(one,'scope').startsWith('process/')&&fieldOf(one,'kind')==='process'&&fieldOf(one,'value')!=='withdraw')) {
    for (const need of fieldOf(line,'needs').split('|').filter(Boolean)) walk(resolve(root,need));
  }
  return seen;
}
