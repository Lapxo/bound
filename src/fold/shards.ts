import { createHash, dirname, existsSync, mkdirSync, renameSync, writeFileSync } from '../host/io.ts';
import { canonical } from '@lapxo/topos/wire';
import { bytesDigest } from './digests.ts';
import { blobAt, landShard, ledgerLines, shardFile, shardLines, storeAt, writerFile } from '../land/ledger.ts';
import { fieldOf, isWire } from './claims.ts';
import { observeFile, observeText } from '../observe/files.ts';

export const OBSERVED = / measure=observed /;
export const LEVEL = /(?:^|\s)scope=(?:cost\/)?reader\//;
export const readerOf = (line: string): string | undefined => /(?:^|\s)by=reader:([0-9a-f]+)/.exec(line)?.[1];
type Latest = { readonly at: string; readonly line: string };

export const trimmed = (where: string): string => where.replace(/\/+$/, '');
export const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

/**
 * What a reader said is kept by region: the region a place lies in is the longest a reader's lock names that holds it,
 * the stamps and digests it was observed at are lines of that region's shard, and what the reader answered for the
 * region is one observation, stored under its reader's extension, the region, the digest of the region's places and
 * the resolution it was read at. A fold opens the shards of the regions it reaches and reads each observation by its
 * key: nothing is scanned, the same bytes are never read twice, and an observation found under its key is the reading.
 */
export function regionIn(regions: readonly string[], place: string): string {
  let best = '';
  for (const region of regions) if (region.length > best.length && (place === region || place.startsWith(`${region}/`))) best = region;
  return best;
}

const observationAt = (store: string, key: string): string => storeAt(store, 'cas', 'observations', key);
export const keyOf = (by: string, region: string, pairs: readonly string[], resolution = '1'): string => sha(`${by}\n${region}\n${sha([...pairs].sort().join('\n'))}\n${resolution}`);

export const observed = (store: string, key: string): boolean => existsSync(observationAt(store, key));

export function observation(store: string, key: string): readonly string[] | undefined {
  return observeText(observationAt(store, key))?.split('\n').filter(isWire);
}

export function keepObservation(store: string, key: string, lines: readonly string[]): void {
  const at = observationAt(store, key);
  if (existsSync(at)) return;
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(`${at}.${process.pid}`, `${[...new Set(lines)].sort().join('\n')}\n`);
  renameSync(`${at}.${process.pid}`, at);
}

export function opened(store: string, speaker: string, region: string, alive: ReadonlySet<string>): { readonly region: string; readonly places: ReadonlyMap<string, Latest>; readonly keys: Map<string, string> } {
  const places = new Map<string, Latest>();
  const keys = new Map<string, string>();
  const pointers = new Map<string, string>();
  const lines = shardLines(store, speaker, region);
  for (const line of lines) {
    if (OBSERVED.test(line)) places.set(`${readerOf(line) ?? ''} ${fieldOf(line, 'scope')}`, { at: fieldOf(line, 'at'), line });
    else if (line.includes(' measure=observation ')) {
      keys.set(readerOf(line) ?? '', fieldOf(line, 'value'));
      pointers.set(readerOf(line) ?? '', line);
    }
  }
  const live = [...lines.filter((line) => LEVEL.test(line)), ...[...places].filter(([name]) => alive.has(name.slice(0, name.indexOf(' ')))).map(([, one]) => one.line),
    ...[...pointers].filter(([by]) => alive.has(by)).map(([, line]) => line)];
  if (lines.length > 2 * live.length + 500) {
    const at = shardFile(store, speaker, region);
    writeFileSync(`${at}.${process.pid}`, `${live.join('\n')}\n`);
    renameSync(`${at}.${process.pid}`, at);
  }
  return { region, places, keys };
}

export const pointer = (speaker: string, by: string, region: string, key: string, pairs: readonly string[]): string =>
  canonical({ scope: region || '.', role: 'writes', form: 'alphabet', measure: 'observation', value: key, by: `${speaker}:${by}`, at: `place:${sha([...pairs].sort().join('\n'))}` });

export function legacyOf(store: string, speaker: string, regions: readonly string[]): ReadonlyMap<string, readonly string[]> | undefined {
  if (!existsSync(writerFile(store, speaker))) return undefined;
  const latest = new Map<string, string>();
  const readings = new Map<string, string[]>();
  const level = new Map<string, string[]>();
  for (const line of ledgerLines(store, speaker)) {
    if (OBSERVED.test(line)) latest.set(`${readerOf(line) ?? ''} ${fieldOf(line, 'scope')}`, line);
    else if (LEVEL.test(line)) {
      const region = regionIn(regions, fieldOf(line, 'scope').replace(/^(?:cost\/)?reader\//, ''));
      level.set(region, [...(level.get(region) ?? []), line]);
    } else {
      const key = `${readerOf(line) ?? ''} ${fieldOf(line, 'at')}`;
      readings.set(key, [...(readings.get(key) ?? []), line]);
    }
  }
  const shards = new Map(level);
  for (const line of latest.values()) {
    const region = regionIn(regions, fieldOf(line, 'scope'));
    shards.set(region, [...(shards.get(region) ?? []), line]);
  }
  for (const [region, lines] of shards) landShard(store, speaker, region, lines);
  return readings;
}

export function setAside(store: string, speaker: string): void {
  const at = writerFile(store, speaker);
  if (!existsSync(at)) return;
  const bytes = observeFile(at) ?? new Uint8Array();
  const kept = blobAt(store, bytesDigest(store, bytes));
  mkdirSync(dirname(kept), { recursive: true });
  renameSync(at, kept);
  process.stderr.write(`SHARDED  ${speaker} · one file of ${bytes.length} bytes laid out by region · kept as ${bytesDigest(store, bytes)}\n`);
}

