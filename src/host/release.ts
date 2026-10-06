import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { canonical } from '@lapxo/topos/wire';
import { fieldOf, isWire } from '../fold/claims.ts';
import { archiveCoordinate, archiveDestination, members } from './archive.ts';
import { blobAt, holdStore, landBlob, replaceWhole, storeAt } from '../land/ledger.ts';
import { coordinatesUnder, observeFile, observeText } from '../observe/files.ts';

export const laidAt = (store: string, digest: string): string => storeAt(store, 'cas', 'laid', digest.replace(/^[^:]*:/, ''));
export const releasesOf = (lock: readonly string[]): readonly string[] =>
  lock.filter((line) => fieldOf(line, 'scope').startsWith('dep/') && fieldOf(line, 'role') === 'reads' && fieldOf(line, 'value') !== 'withdraw');
const laidMark = '.laid';
const digestOf = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const hashed = (digest: string, bytes: Uint8Array): boolean =>
  createHash(digest.includes(':') ? digest.slice(0, digest.indexOf(':')) : 'sha256').update(bytes).digest('hex') === digest.replace(/^[^:]*:/, '');

const snapshotOf = (text: string): readonly (readonly [string, string])[] =>
  text.split('\n').filter(isWire).filter((line) => fieldOf(line, 'measure') === 'digest' && fieldOf(line, 'scope').startsWith('file/'))
    .map((line) => [fieldOf(line, 'scope').slice('file/'.length), fieldOf(line, 'value')] as const);

function snapshotLines(files: readonly (readonly [string, string])[]): string {
  return files.map(([coord, digest]) => canonical({
    scope: `file/${coord}`, role: 'writes', form: 'alphabet', measure: 'digest', value: digest, at: `place:${digest}`, by: 'target',
  })).join('\n') + (files.length ? '\n' : '');
}

function layDir(from: string, into: string): void {
  for (const coord of coordinatesUnder(from, from)) {
    if (coord === laidMark) continue;
    const src = join(from, coord);
    const dest = archiveDestination(into, coord);
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(dest)) continue;
    const bytes = observeFile(src);
    if (bytes === undefined) throw new Error(`REFUSE·release unreadable historical member ${coord}`);
    writeFileSync(dest, bytes, { flag: 'wx' });
  }
}

function swapPlace(place: string, next: string, digest: string): void {
  const old = `${next}.old`;
  if (lstatSync(old, { throwIfNoEntry: false }) !== undefined) throw new Error(`REFUSE·release recovery required for ${old}`);
  writeFileSync(join(next, laidMark), digest, { flag: 'wx' });
  let moved = false;
  try {
    if (lstatSync(place, { throwIfNoEntry: false }) !== undefined) { renameSync(place, old); moved = true; }
    renameSync(next, place);
  } catch (error) {
    if (moved && lstatSync(place, { throwIfNoEntry: false }) === undefined) renameSync(old, place);
    throw error;
  }
  if (moved) rmSync(old, { recursive: true, force: true });
}

function nextPlace(place: string): string {
  const next = `${place}.${process.pid}`;
  mkdirSync(dirname(place), { recursive: true });
  mkdirSync(next); // An abandoned staging directory is never silently reused.
  return next;
}

function layFiles(store: string, own: string, files: readonly (readonly [string, string])[], into: string): void {
  const held = files.map(([coordinate, digest]) => {
    const coord = archiveCoordinate(coordinate);
    const dest = archiveDestination(into, coord);
    const src = [blobAt(own, digest), blobAt(store, digest)].find(existsSync);
    if (src === undefined) throw new Error(`REFUSE·release missing blob ${digest} for ${coord}`);
    const bytes = observeFile(src);
    if (bytes === undefined || !hashed(digest, bytes)) throw new Error(`REFUSE·release blob ${digest} for ${coord} does not hold`);
    return { dest, bytes };
  });
  for (const { dest, bytes } of held) {
    mkdirSync(dirname(dest), { recursive: true });
    // Materialized files may be edited by their consumer; never share writable inodes with the CAS.
    writeFileSync(dest, bytes, { flag: 'wx' });
  }
}

function layoutMatches(place: string, files: readonly (readonly [string, string])[]): boolean {
  return files.every(([coord, digest]) => {
    const path = join(place, archiveCoordinate(coord));
    const st = lstatSync(path, { throwIfNoEntry: false });
    const bytes = st?.isFile() ? observeFile(path) : undefined;
    return bytes !== undefined && hashed(digest, bytes);
  });
}

function sameSnapshot(actual: readonly (readonly [string, string])[], expected: readonly (readonly [string, string])[]): boolean {
  const named = new Map(actual);
  return named.size === actual.length && actual.length === expected.length && expected.every(([name, digest]) => named.get(name) === digest);
}

function keepSnapshot(store: string, digest: string, bytes: Uint8Array): readonly (readonly [string, string])[] {
  const files = members(bytes).map((one) => {
    const file = digestOf(one.bytes);
    landBlob(store, file, one.bytes);
    return [one.name, file] as const;
  });
  const text = snapshotLines(files);
  replaceWhole(laidAt(store, digest), text);
  holdStore(store, 'laid', digest, Buffer.byteLength(text));
  return files;
}

/**
 * What the host does before anything runs: each release the instrument's own lock names by digest is a snapshot of
 * lines and digests, kept by digest, and the place the line needs is a materialization of verified CAS bytes. Materialized files do not share writable inodes with the store. A blob is laid only when its bytes hash to the digest that names it. What stands laid is
 * said by resolvedOf: a line for each release whose blob hashes to its name and whose place, or the cas when its line
 * needs none, holds it.
 */
export function layReleases(store: string, own: string, lock: readonly string[], contentStore: string = own): number {
  let laid = 0;
  for (const line of releasesOf(lock)) {
    const digest = fieldOf(line, 'value');
    const at = laidAt(store, digest);
    const dir = lstatSync(at, { throwIfNoEntry: false })?.isDirectory() ?? false;
    const bytes = observeFile(blobAt(contentStore, digest));
    const named = digest.replace(/^[^:]*:/, '');
    if (bytes !== undefined && !hashed(digest, bytes)) {
      throw new Error(`REFUSE·release ${fieldOf(line, 'scope')} · blob ${named.slice(0, 12)} hashes to ${digestOf(bytes).slice(7, 19)} · not laid`);
    }
    if (bytes !== undefined && !dir && observeText(at) === undefined) keepSnapshot(store, digest, bytes);
    const current = observeText(at);
    if (bytes !== undefined && current !== undefined && !dir && !sameSnapshot(snapshotOf(current), members(bytes).map((one) => [one.name, digestOf(one.bytes)] as const))) throw new Error(`REFUSE·release snapshot for ${digest} omits or changes archive members; explicit rebuild required`);
    if (bytes === undefined && !dir && current === undefined) throw new Error(`REFUSE·release ${fieldOf(line, 'scope')} has no available archive or snapshot`);
    const needs = fieldOf(line, 'needs');
    if (!needs) continue;
    const place = join(own, archiveCoordinate(needs));
    const link = lstatSync(place, { throwIfNoEntry: false });
    if (link?.isSymbolicLink() && !realpathSync(place).includes(`${sep}cas${sep}laid${sep}`)) continue;
    if (dir) {
      const files = bytes === undefined ? undefined : members(bytes).map((one) => [one.name, digestOf(one.bytes)] as const);
      if (!lstatSync(place, { throwIfNoEntry: false })?.isSymbolicLink() && observeText(join(place, laidMark)) === digest && files !== undefined && layoutMatches(place, files)) continue;
      const next = nextPlace(place);
      try { layDir(at, next); swapPlace(place, next, digest); }
      catch (error) { rmSync(next, { recursive: true, force: true }); throw error; }
      laid += 1;
      continue;
    }
    const snap = observeText(at);
    if (snap === undefined) throw new Error(`REFUSE·release ${fieldOf(line, 'scope')} has no available snapshot`);
    if (!lstatSync(place, { throwIfNoEntry: false })?.isSymbolicLink() && observeText(join(place, laidMark)) === digest && layoutMatches(place, snapshotOf(snap))) continue;
    const next = nextPlace(place);
    try {
      layFiles(store, contentStore, snapshotOf(snap), next);
      swapPlace(place, next, digest);
    } catch (error) {
      rmSync(next, { recursive: true, force: true });
      throw error;
    }
    laid += 1;
  }
  return laid;
}

export const resolvedOf = (store: string, own: string, lock: readonly string[], contentStore: string = own): readonly string[] => releasesOf(lock).flatMap((line) => {
  const digest = fieldOf(line, 'value');
  const bytes = observeFile(blobAt(contentStore, digest));
  const ok = bytes !== undefined && hashed(digest, bytes);
  const needs = fieldOf(line, 'needs');
  const place = needs ? join(own, archiveCoordinate(needs)) : '';
  const at = laidAt(store, digest);
  const laid = needs
    ? observeText(join(place, laidMark)) === digest || (existsSync(place) && existsSync(at) && realpathSync(place) === realpathSync(at))
    : existsSync(at);
  const expected = ok ? members(bytes).map((one) => [one.name, digestOf(one.bytes)] as const) : undefined;
  const historicalDirectory = lstatSync(at, { throwIfNoEntry: false })?.isDirectory() === true;
  const snapshot = observeText(at);
  const complete = expected !== undefined && (needs
    ? layoutMatches(place, expected)
    : historicalDirectory ? layoutMatches(at, expected) : snapshot !== undefined && sameSnapshot(snapshotOf(snapshot), expected));
  return ok && laid && complete ? [canonical({ scope: `resolved/${fieldOf(line, 'scope').slice('dep/'.length)}`, role: 'writes', form: 'alphabet', measure: 'digest', value: digest, at: `place:${digest}`, by: 'target' })] : [];
});

/** A host loads verified release bytes from a runtime tree, never interprets a snapshot file as a directory. */
export function runtimeTreeAt(store: string, own: string, digest: string, contentStore: string = own): string | undefined {
  const named = /^([a-zA-Z0-9-]+):([a-fA-F0-9]+)$/.exec(digest);
  if (named === null) throw new Error(`REFUSE·release invalid digest ${digest}`);
  const bytes = observeFile(blobAt(contentStore, digest));
  if (bytes === undefined) return undefined;
  if (!hashed(digest, bytes)) throw new Error(`REFUSE·release ${digest} does not name its available bytes`);
  const files = members(bytes).map((one) => [one.name, digestOf(one.bytes)] as const);
  const place = storeAt(store, 'cas', 'runtime', named[1]!, named[2]!);
  if (observeText(join(place, laidMark)) === digest && layoutMatches(place, files)) return place;
  for (const member of members(bytes)) landBlob(store, digestOf(member.bytes), member.bytes);
  const next = nextPlace(place);
  try { layFiles(store, own, files, next); swapPlace(place, next, digest); }
  catch (error) { rmSync(next, { recursive: true, force: true }); throw error; }
  return place;
}
