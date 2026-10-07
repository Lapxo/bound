import {ContentNeeded} from './content-needed.ts';
import {readOnly} from './read-only.ts';
import { sha } from './hash.ts';
import { wireLinesOf as linesOf } from '../fold/claims.ts';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { CAPSULE } from '@lapxo/topos/wire';
import { declarationOf } from '@lapxo/topos/capsule';
import type { Declaration } from '@lapxo/topos/capsule';
import type { Request, Response } from '@lapxo/topos/contract';
import { unpack } from './archive.ts';
import { executeCapsule, validResponse } from './capsule-process.ts';
import { blobAt, holdStore, replaceWhole, storeAt } from '../land/ledger.ts';
import { coordinatesUnder, observeFile, observeText } from '../observe/files.ts';
import { hostOf } from '../observe/run.ts';
import { ownLock, ownRoot, ownStore, processOf } from '../observe/runner.ts';
import { said } from '../fold/wire.ts';

export interface Capsule {
  readonly digest: string;
  readonly declaration: Declaration;
  readonly lines: readonly string[];
  readonly ask: (requests: readonly Request[]) => readonly (Response | undefined)[];
}

const declared = new Map<string, { readonly lines: readonly string[]; readonly declaration: Declaration }>();
const laid = new Map<string, string>();
process.on('exit', () => { for (const at of laid.values()) rmSync(at, { recursive: true, force: true }); });

/** A blob is unpacked once in a process, where every run of it the process asks for reads it. */
function unpacked(digest: string, bytes: Uint8Array): string {
  const held = laid.get(digest);
  if (held !== undefined) return held;
  const at = mkdtempSync(join(tmpdir(), `${basename(ownRoot())}-capsule-`));
  try { unpack(bytes, at); }
  catch (error) { rmSync(at, { recursive: true, force: true }); throw error; }
  laid.set(digest, at);
  return at;
}

/**
 * A capsule is the bytes a digest names in the instrument's own store, and only when they hash to it: its own lock is
 * read from them, and the coordinate a lock names runs as a process of its own, like a reader. Each answer is kept in one
 * slot of the capsule, the place and the region; the body of the request is the hit, so a file that moved misses and
 * overwrites the slot, and a request asked again for the same bytes is read back and never run twice. Operational failures never enter the cache; refusals and abstentions are asked again.
 */
const capsules = new Map<string, Capsule>();

/** A blob is loaded once in an act. A later ask for the same digest reads that capsule, and does not hash or unpack it again. */
export function capsuleAt(digest: string, entry: string, store?: string): Capsule | undefined {
  const identity = `${store ?? ownStore()}\0${digest}\0${entry}`;
  const held = capsules.get(identity);
  if (held !== undefined) return held;
  const bytes = observeFile(blobAt(store ?? ownStore(), digest));
  if (bytes === undefined) throw new ContentNeeded(digest, `REFUSE·pin ${digest} offered capsule unavailable · not laid`);
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== digest) throw Error(`REFUSE·pin ${digest} content hash mismatch · not laid`);
  const known = declared.get(digest) ?? ((lines) => ({ lines, declaration: declarationOf(lines) }))(linesOf(observeText(join(unpacked(digest, bytes), CAPSULE))));
  declared.set(digest, known);
  const names = Object.keys(known.declaration.regions);
  const root = unpacked(digest, bytes);
  const module = resolve(root, entry);
  const coordinate = relative(root, module);
  if (!entry || isAbsolute(entry) || (coordinate === '..' || coordinate.startsWith(`..${sep}`)) || entry.split(/[\\/]/).includes('..')) {
    throw new Error(`REFUSE·capsule ${digest} declared entry ${entry || '(absent)'} unavailable`);
  }
  const capsule = { digest, ...known, ask: (requests: readonly Request[]) => {
    if (!statSync(module, { throwIfNoEntry: false })?.isFile()) throw new Error(`REFUSE·capsule ${digest} declared entry ${entry} unavailable`);
    return answered(digest, bytes, requests, names, root, store ?? ownStore(), module);
  } };
  capsules.set(identity, capsule);
  return capsule;
}

const layoutsOf = (): readonly (readonly [string, string])[] => said(ownLock(), 'release/layout')
  .map((token) => token.split(':')).filter((pair): pair is [string, string] => pair.length === 2 && pair[0] !== undefined && pair[1] !== undefined);
const oneModule = (at: string): string | undefined => {
  const files = coordinatesUnder(at, at).filter((one) => one.endsWith('.js'));
  return files.length === 1 ? files[0] : undefined;
};
const split = new Map<string, readonly string[]>();
const spawnOf = (at: string, names: readonly string[]): readonly string[] => {
  const held = split.get(at);
  if (held !== undefined) return held;
  const layout = names.length === 0 ? undefined : layoutsOf().find(([dir, ext]) => names.some((name) => observeText(join(at, dir, `${name}${ext}`)) !== undefined));
  const child = layout !== undefined ? [processOf('located', 'host'), at, layout[0], layout[1]]
    : ((file) => (file === undefined ? [] : [processOf('located', 'host'), at, file, 'render']))(oneModule(at));
  split.set(at, child);
  return child;
};

export const childFlags = (argv: readonly string[] = process.execArgv): readonly string[] =>
  argv.filter((flag, i) => !/^(-e|-p|--eval|--print)$/.test(argv[i - 1] ?? '') && !/^(-e|-p|--eval|--print|--input-type)(=|$)/.test(flag));

function answered(digest: string, bytes: Uint8Array, requests: readonly Request[], names: readonly string[], tree?: string, cacheStore: string = ownStore(), entry?: string): readonly (Response | undefined)[] {
  const child = entry === undefined ? spawnOf(tree ?? unpacked(digest, bytes), names) : [entry];
  if (!child.length) {
    process.stderr.write(`LOAD     regions · none of ${names.length} under the directories release/layout names\n`);
    return requests.map(() => undefined);
  }
  const loader = entry !== undefined ? `${createHash('sha256').update(`${relative(tree!, entry)}\n`).digest('hex')}\n` : child.length > 1 ? `${createHash('sha256').update(observeFile(child[0]!) ?? new Uint8Array()).digest('hex')}\n` : '';
  const slotOf = (request: Request): string => sha(`${digest}\n${loader}${request.verb}\n${request.rootScope}\n${request.region ?? ''}`);
  const hitOf = (request: Request): string => sha(`${digest}\n${loader}${JSON.stringify(request)}`);
  const kept = requests.map((request) => storeAt(cacheStore, 'cas', 'answers', slotOf(request)));
  const hits = requests.map(hitOf);
  const held = kept.map((at, i) => {
    const text = observeText(at);
    if (text === undefined) return undefined;
    try {
      const got = JSON.parse(text) as { readonly format?: string; readonly hit?: string; readonly said?: Response };
      return got.format === 'capsule-answer/2' && got.hit === hits[i] && validResponse(got.said, requests[i]!) && got.said.kind === 'fact' ? got.said : undefined;
    } catch (error) {
      throw new Error(`${at}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const missing = requests.filter((_, i) => held[i] === undefined);
  if (missing.length && readOnly()) throw Error(`REFUSE·preview capsule ${digest} has no verified answer for the proposed inputs; fold the declared inputs first`);
  if (missing.length) process.stderr.write(`CAPSULE  ${digest.slice(7, 19)} · ${requests.length} asked · ${missing.length} run · ${missing.map((one) => `${one.rootScope}${one.region}`).join(' ')}\n`);
  // Execute and validate the entire batch before committing any answer to the cache.
  const ran = !missing.length ? [] : executeCapsule(process.execPath, [...childFlags(), hostOf(), ...child], missing);
  return requests.map((request, i) => {
    if (held[i] !== undefined) return held[i];
    const said = ran[missing.indexOf(request)];
    if (said?.kind === 'fact') {
      const text = JSON.stringify({ format: 'capsule-answer/2', hit: hits[i], said });
      replaceWhole(kept[i]!, text);
      holdStore(cacheStore, 'answers', slotOf(request), Buffer.byteLength(text));
    }
    return said;
  });
}

/** The host may supply its cache store independently of the located executable. */
export function locatedAt(tree: string, place: string, cacheStore: string = ownStore()): Capsule | undefined {
  const at = join(tree, place);
  const lines = linesOf(observeText(join(at, CAPSULE)));
  if (!lines.length) return undefined;
  const known = { lines, declaration: declarationOf(lines) };
  const names = Object.keys(known.declaration.regions);
  if (!spawnOf(at, names).length) return undefined;
  const hash = createHash('sha256');
  hash.update(observeFile(join(at, CAPSULE)) ?? new Uint8Array());
  for (const name of names) for (const [dir, ext] of layoutsOf()) {
    const bytes = observeFile(join(at, dir, `${name}${ext}`));
    if (bytes !== undefined) { hash.update(bytes); break; }
  }
  const digest = `sha256:${hash.digest('hex')}`;
  return { digest, ...known, ask: (requests) => answered(digest, new Uint8Array(), requests, names, at, cacheStore) };
}
