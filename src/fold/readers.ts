import { resolve } from '../host/io.ts';
import { canonical, fields, matches } from '@lapxo/topos/wire';
import { namesAt, wordOn, wordsOf, wireLine } from './wire.ts';
import { fits } from '../observe/match.ts';
import type { CoordinateRole } from './wire.ts';
import { bytesDigest, coordinateDigest } from './digests.ts';
import { fieldOf } from './claims.ts';
import { capsuleAt, placesIn } from './places.ts';
import { capsulesFor } from './reach.ts';
import { ownLockOf } from './signed.ts';
import { ownLock } from '../observe/runner.ts';
import { entriesIn, coordinatesUnder, observeFile, stampOf } from '../observe/files.ts';
import type { Kind } from '../observe/run.ts';

export interface ReaderClaim {
  readonly id: string;
  readonly shape: readonly string[];
  readonly where: readonly string[];
  readonly module: string;
  readonly kind: Kind;
  readonly capsule?: { readonly digest: string; readonly entry: string; readonly region: string; readonly reads: readonly string[]; readonly globs: ReadonlyMap<string, readonly string[]> };
}

export type Offer = { readonly place: string; readonly seen: string; readonly bytes: () => Uint8Array; readonly digest?: () => string };

export type Look = { readonly under: (dir: string, pruned: boolean) => readonly string[]; readonly stamp: (at: string) => string };

export function lookOf(root: string, roleOf: (coordinate: string) => CoordinateRole): Look {
  const walked = new Map<string, readonly string[]>();
  const stamped = new Map<string, string>();
  return {
    under: (dir, pruned) => walked.get(`${pruned} ${dir}`) ?? walked.set(`${pruned} ${dir}`, coordinatesUnder(dir, root, pruned ? (one) => roleOf(one) !== 'foreign' : undefined)).get(`${pruned} ${dir}`)!,
    stamp: (at) => stamped.get(at) ?? stamped.set(at, stampOf(at)?.stamp ?? '').get(at)!,
  };
}

function entriesOf(root: string, where: string, roleOf: (coordinate: string) => CoordinateRole): Uint8Array | undefined {
  const dir = where.replace(/\/?$/, '/');
  const at = resolve(root, dir);
  if (stampOf(at)?.kind !== 'dir') return undefined;
  const names = entriesIn(at)
    .filter((entry) => roleOf(`${dir}${entry.name}`) === 'source')
    .map((entry) => (entry.dir ? `${entry.name}/` : entry.name))
    .sort();
  return new TextEncoder().encode(names.join('\n'));
}

const reachOfLine = (module: string, where: readonly string[]): readonly string[] => {
  const [pkg = '', ...rest] = module.split('/');
  const stem = (rest.at(-1) ?? '').replace(/\.[^.]+$/, '');
  return where.flatMap((one) => [`${pkg} ${stem} ${one.replace(/\/?$/, '/')}`, `${pkg} ${stem}s ${one.replace(/\/?$/, '/')}`]);
};

/**
 * The reader regions of the capsules a place can run, where the place's own lock offers them or, at a world, the wire's offers/world list does for a
 * region its own lock does not name: `region/<name>` under a measure the wire's region-measures list names gives the region and its coordinates, and the first capsule, pinned before carried, that writes the region
 * reads them, handed the coordinates it declares it reads among those the place offers. A capsule region takes over what a
 * place's declared region. A standing reader for that same provider and region keeps ownership, so nothing is read twice.
 * A newly declared region does not need a retired reader in private history to be observed.
 */
export function capsuleReadersOf(root: string, store: string, standing: readonly string[], lines: readonly ReaderClaim[], resolve: typeof capsulesFor = capsulesFor): readonly ReaderClaim[] {
  const reaching = new Set(lines.flatMap((reader) => reachOfLine(reader.module, reader.where)));
  const measures = wordsOf(standing, 'region-measures');
  const world = fields(fieldOf(wireLine(standing, 'offers/world') ?? '', 'value')).map(([region, globs]) => canonical({ scope: `region/${region}`, measure: wordOn(standing, 'region-coordinate', ownLock()), value: globs }));
  const groups = new Map<string, { module: string; digest: string; entry: string; region: string; reads: readonly string[]; globs: Map<string, readonly string[]> }>();
  for (const place of ['', ...placesIn(root)]) {
    const where = place ? `${place}/` : '';
    const own = ownLockOf(root, place).filter((line) => fieldOf(line, 'scope').startsWith('region/') && measures.includes(fieldOf(line, 'measure')) && fieldOf(line, 'value') !== 'withdraw');
    const offered = [...own, ...(capsuleAt(root, place) ? world.filter((line) => !own.some((one) => fieldOf(one, 'scope') === fieldOf(line, 'scope'))) : [])];
    if (!offered.length) continue;
    const capsules = resolve(standing, place);
    for (const line of offered) {
      const region = fieldOf(line, 'scope').slice('region/'.length);
      const by = capsules.find(({ capsule }) => capsule.lines.some((one) => fieldOf(one, 'scope') === `region/${region}` && fieldOf(one, 'measure') === 'writes'));
      const pkg = fieldOf(by?.offer ?? '', 'scope').split('/')[1] ?? '';
      if (by === undefined || reaching.has(`${pkg} ${region} ${where || '/'}`)) continue;
      const key = `${by.capsule.digest} ${region}`;
      const group = groups.get(key) ?? groups.set(key, { module: `${pkg}/${region}`, digest: by.capsule.digest, entry: fieldOf(by.offer, 'shape'), region, reads: by.capsule.declaration.regions[region] ?? [], globs: new Map() }).get(key)!;
      group.globs.set(where, fieldOf(line, 'value').split('|').filter(Boolean));
    }
  }
  return [...groups.values()].map((group) => ({ id: group.module, shape: ['run'], where: [...group.globs.keys()], module: group.module, kind: 'process' as const,
    capsule: { digest: group.digest, entry: group.entry, region: group.region, reads: group.reads, globs: group.globs } }));
}

export function handedAt(root: string, reader: ReaderClaim, roleOf: (coordinate: string) => CoordinateRole, look: Look, place: string): readonly string[] {
  const { reads, globs } = reader.capsule!;
  const run = reads.some((read) => read.includes('@'));
  return look.under(resolve(root, place), true).filter((coordinate) => {
    const inside = coordinate.slice(place.length);
    return (!run || roleOf(coordinate) === 'source') && reads.some((read) => fits(read, inside)) && (globs.get(place) ?? []).some((glob) => matches(glob, inside));
  }).sort();
}

/**
 * What a reader is offered at the places it reads: a coordinate for a reader of coordinates, the listing for one that reads a
 * directory, and for one that runs over its place its sources and every coordinate its shape names besides — a coordinate a view
 * writes from what readers said is offered only when named, so no reading moves its own offer — each by the stamp it
 * was seen at and the bytes that key what it said; a capsule reader is offered the coordinates it is handed.
 */
export function offersOf(root: string, store: string, reader: ReaderClaim, roleOf: (coordinate: string) => CoordinateRole, look: Look, into: (where: string) => boolean): readonly Offer[] {
  const offered: Offer[] = [];
  const wheres = reader.where.filter(into);
  if (reader.capsule !== undefined && reader.capsule.reads.some((read) => read.includes('@'))) {
    for (const where of wheres) {
      const held = handedAt(root, reader, roleOf, look, where);
      const stamps = held.map((coordinate) => `${coordinate} ${look.stamp(resolve(root, coordinate))}`).join('\n');
      offered.push({
        place: where,
        seen: bytesDigest(store, new TextEncoder().encode(stamps)).replace(/^[^:]*:/, '').slice(0, 16),
        bytes: () => new TextEncoder().encode(held.map((coordinate) => `${coordinate} ${coordinateDigest(store, resolve(root, coordinate)) ?? bytesDigest(store, new Uint8Array())}`).join('\n')),
      });
    }
  } else if (reader.capsule !== undefined) {
    for (const coordinate of [...new Set(wheres.flatMap((where) => handedAt(root, reader, roleOf, look, where)))].sort()) {
      offered.push({ place: coordinate, seen: look.stamp(resolve(root, coordinate)), bytes: () => observeFile(resolve(root, coordinate)) ?? new Uint8Array(), digest: () => coordinateDigest(store, resolve(root, coordinate)) ?? bytesDigest(store, new Uint8Array()) });
    }
  } else if (reader.kind === 'process') {
    for (const where of wheres) {
      const dir = resolve(root, where);
      if (stampOf(dir)?.kind !== 'dir') continue;
      const held = look.under(dir, true).filter((coordinate) => roleOf(coordinate) === 'source' || (roleOf(coordinate) !== 'foreign' && reader.shape.some((name) => namesAt(coordinate, name) || fits(name, coordinate)))).sort();
      const stamps = held.map((coordinate) => `${coordinate} ${look.stamp(resolve(root, coordinate))}`).join('\n');
      offered.push({
        place: where.replace(/\/?$/, '/'),
        seen: bytesDigest(store, new TextEncoder().encode(stamps)).replace(/^[^:]*:/, '').slice(0, 16),
        bytes: () => new TextEncoder().encode(held.map((coordinate) => `${coordinate} ${coordinateDigest(store, resolve(root, coordinate)) ?? bytesDigest(store, new Uint8Array())}`).join('\n')),
      });
    }
  } else if (reader.shape.some((name) => name.endsWith('/'))) {
    for (const where of wheres) {
      const listed = entriesOf(root, where, roleOf);
      if (listed) offered.push({ place: where.replace(/\/?$/, '/'), seen: bytesDigest(store, listed).replace(/^[^:]*:/, '').slice(0, 16), bytes: () => listed });
    }
  } else {
    const paths = wheres.flatMap((where) => look.under(resolve(root, where), true));
    for (const path of [...new Set(paths)].sort()) {
      if (!reader.shape.some((name) => namesAt(path, name))) continue;
      offered.push({ place: path, seen: look.stamp(resolve(root, path)), bytes: () => observeFile(resolve(root, path)) ?? new Uint8Array(), digest: () => coordinateDigest(store, resolve(root, path)) ?? bytesDigest(store, new Uint8Array()) });
    }
  }
  return offered;
}
