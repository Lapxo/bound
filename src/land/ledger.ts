import { appendFileSync, closeSync, dirname, existsSync, join, linkSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from '../host/io.ts';
import { storeRoot } from '../host/ports/store.ts';
import { canonical, EXTENSION, PROTOCOL } from '@lapxo/topos/wire';
import { fieldOf } from '../fold/claims.ts';
import { observeText } from '../observe/files.ts';

export function storeOf(root: string): string {
  return join(storeRoot(root), EXTENSION);
}

/**
 * The store of a place: every name under it is read here and nowhere else, whoever needs a place asks for it by its
 * steps, and one append-only file per writer stands beside the bytes kept by digest — one per region for a writer
 * whose lines are about regions, so a fold opens only the regions it reaches. A file is read once per stamp, and a
 * ledger only grows: what it held is kept, and only the bytes appended since, from where it last ended a line, are read.
 */
export function storeAt(store: string, ...steps: readonly string[]): string {
  return join(store, ...steps);
}

export function writerFile(store: string, writer: string): string {
  return storeAt(store, 'ledger', `${writer.replace(/[^a-zA-Z0-9_-]/g, '')}${EXTENSION}`);
}

const held = new Map<string, { readonly stamp: string; readonly size: number; readonly lines: readonly string[] }>();

export function ledgerLines(store: string, writer: string): readonly string[] {
  return linesAt(writerFile(store, writer));
}

export function shardFile(store: string, writer: string, region: string): string {
  return storeAt(store, 'ledger', writer.replace(/[^a-zA-Z0-9_-]/g, ''), `${region.replace(/\/+$/, '') || '@'}${EXTENSION}`);
}

export const shardLines = (store: string, writer: string, region: string): readonly string[] => linesAt(shardFile(store, writer, region));

export function landShard(store: string, writer: string, region: string, lines: readonly string[]): number {
  return appendNew(shardFile(store, writer, region), lines);
}

function linesAt(at: string): readonly string[] {
  const st = statSync(at, { throwIfNoEntry: false });
  if (!st) return [];
  const stamp = `${Math.floor(st.mtimeMs)}-${st.size}`;
  const mine = held.get(at);
  if (mine?.stamp === stamp) return mine.lines;
  const grown = mine !== undefined && mine.size > 0 && st.size > mine.size ? tailOf(at, mine.size, st.size) : undefined;
  const lines = grown !== undefined && mine !== undefined ? [...mine.lines, ...grown.split('\n').filter((line) => line.startsWith(PROTOCOL))] : readFileSync(at, 'utf8').split('\n').filter((line) => line.startsWith(PROTOCOL));
  held.set(at, { stamp, size: st.size, lines });
  return lines;
}

function tailOf(at: string, from: number, to: number): string | undefined {
  const fd = openSync(at, 'r');
  try {
    const bytes = Buffer.alloc(to - from + 1);
    readSync(fd, bytes, 0, bytes.length, from - 1);
    return bytes[0] === 0x0a ? bytes.subarray(1).toString('utf8') : undefined;
  } finally {
    closeSync(fd);
  }
}

function appendNew(at: string, lines: readonly string[]): number {
  const had = new Set(linesAt(at));
  const fresh = [...new Set(lines)].filter((line) => line.startsWith(PROTOCOL) && !had.has(line));
  if (fresh.length) {
    mkdirSync(dirname(at), { recursive: true });
    appendFileSync(at, `${fresh.join('\n')}\n`);
  }
  return fresh.length;
}

export function signedLines(store: string, writer: string): string[] {
  return ledgerLines(store, writer).filter((line) => line.includes(`by=${writer}`) && /\bsig=/.test(line));
}

export function blobAt(store: string, digest: string): string {
  return storeAt(store, 'cas', 'blobs', digest.slice(digest.indexOf(':') + 1));
}

/**
 * Where the bytes of one digest are kept: naming a blob is not reading it. A file named by the digest of its bytes lands
 * whole, once, whoever lands it: every writer writes the same bytes, so a
 * rename over one already there changes nothing, and a reader never meets half of it.
 */
function landWhole(at: string, bytes: Uint8Array | string): string {
  if (existsSync(at)) return at;
  replaceWhole(at, bytes);
  return at;
}

/** A file replaced whole: the bytes land in a temp beside it and the name moves in one rename, so a killed write keeps the temp, never a torn file under the name a later read parses. */
export function replaceWhole(at: string, bytes: Uint8Array | string): void {
  mkdirSync(dirname(at), { recursive: true });
  const part = `${at}.${process.pid}.part`;
  writeFileSync(part, bytes);
  renameSync(part, at);
}

export const landBlob = (store: string, digest: string, bytes: Uint8Array): string => {
  const at = landWhole(blobAt(store, digest), bytes);
  holdStore(store, 'blobs', digest, bytes.byteLength);
  return at;
};

export function holdStore(store: string, kind: 'blobs' | 'laid' | 'answers', name: string, bytes: number): void {
  const hex = name.replace(/^[^:]*:/, '');
  const scope = `cas/${kind}/${hex}`;
  const held = ledgerLines(store, 'store').filter((line) => fieldOf(line, 'scope') === scope);
  if (held.length && fieldOf(held[held.length - 1]!, 'value') !== 'withdraw') return;
  land(store, 'store', [canonical({
    scope, role: 'writes', form: 'interval', measure: 'bytes',
    value: `${bytes}..${bytes}`, at: `place:${kind === 'answers' ? hex : `sha256:${hex}`}`, by: 'store',
  })]);
}

export const memoAt = (store: string, key: string): string => storeAt(store, 'cas', 'memo', ...key.split('/').map((step) => step.replace(/[^a-zA-Z0-9._@-]/g, '_')));

export function landMemo(store: string, key: string, bytes: Uint8Array): string {
  const at = memoAt(store, key);
  if (existsSync(at)) return at;
  mkdirSync(dirname(at), { recursive: true });
  const part = `${at}.${process.pid}.part`;
  writeFileSync(part, bytes);
  try {
    linkSync(part, at);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  } finally {
    rmSync(part, { force: true });
  }
  return at;
}

export const landEnvelope = (store: string, digest: string, bytes: string): string =>
  landWhole(storeAt(store, 'cas', 'envelopes', `${digest.slice(digest.indexOf(':') + 1)}.json`), bytes);

export function land(
  store: string,
  writer: string,
  lines: readonly string[],
): { readonly at: string; readonly appended: number } {
  const at = writerFile(store, writer);
  return { at, appended: appendNew(at, lines) };
}

const step = (value: string): string => value.replace(/[^a-zA-Z0-9._@-]/g, '_');

function verdictAt(store: string, tree: string, lot: string): string {
  return memoAt(store, `verdict/${step(tree)}/${step(lot)}`);
}

export function keptVerdict(store: string, tree: string, lot: string): unknown[] | undefined {
  const text = observeText(verdictAt(store, tree, lot));
  if (text === undefined) return undefined;
  try {
    const got = JSON.parse(text) as unknown;
    return Array.isArray(got) ? got : undefined;
  } catch {
    return undefined;
  }
}

export function keepVerdict(store: string, tree: string, lot: string, judged: readonly unknown[]): void {
  landMemo(store, `verdict/${step(tree)}/${step(lot)}`, new TextEncoder().encode(JSON.stringify(judged)));
}
