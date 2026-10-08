import { existsSync, lstatSync, statSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The one place the instrument reads the world: a coordinate's bytes, the entries of a directory, the coordinates under a place,
 * a link's target and a coordinate's stamp. Every fold, render and landing asks here, so each reading is made once and named.
 */
const seen = new Map<string, { readonly stamp: string; readonly bytes: Buffer }>();

/** A coordinate read once is kept by its stamp — its inode, size and time — and read again only when the stamp moves. */
function bytesAt(at: string): Buffer | undefined {
  // Reading follows a link, so its cache stamp must describe the same target.
  // Directory links have no file bytes; traversal keeps its separate link policy.
  let st = stampable(at);
  if (st?.isSymbolicLink()) {
    try { st = statSync(at); } catch { return undefined; }
  }
  if (st === undefined || st.isDirectory() || !existsSync(at)) return undefined;
  const stamp = `${st.ino}-${st.size}-${st.mtimeMs}`;
  const held = seen.get(at);
  if (held?.stamp === stamp) return held.bytes;
  const bytes = readFileSync(at);
  seen.set(at, { stamp, bytes });
  return bytes;
}

export const observeFile = (at: string): Uint8Array | undefined => ((bytes) => (bytes === undefined ? undefined : new Uint8Array(bytes)))(bytesAt(at));

export const observeText = (at: string): string | undefined => bytesAt(at)?.toString('utf8');

export const exists = (at: string): boolean => existsSync(at);

export type Kind = 'file' | 'dir' | 'link' | 'other';

export function stampOf(at: string): { readonly kind: Kind; readonly stamp: string } | undefined {
  const st = stampable(at);
  if (!st) return undefined;
  const kind: Kind = st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other';
  return { kind, stamp: `${Math.floor(st.mtimeMs)}-${st.size}` };
}

/** A coordinate listed a moment ago can be gone before it is read: a landing renames its file into place. Gone is none. */
function stampable(at: string): Stats | undefined {
  try {
    return lstatSync(at);
  } catch {
    return undefined;
  }
}

export const linkOf = (at: string): string => readlinkSync(at);

export function entriesIn(at: string): readonly { readonly name: string; readonly dir: boolean }[] {
  if (!stampable(at)?.isDirectory()) return [];
  return readdirSync(at, { withFileTypes: true }).map((entry) => ({ name: entry.name, dir: entry.isDirectory() }));
}

export function coordinatesUnder(dir: string, root: string, into: (step: string) => boolean = () => true): string[] {
  const out: string[] = [];
  const name = (at: string): string => relative(root, at).split(sep).join('/');
  const walk = (at: string, kind: 'file' | 'dir' | 'link' | 'other'): void => {
    if (kind === 'link') return;
    if (kind === 'file') {
      out.push(name(at));
      return;
    }
    if (kind !== 'dir' || !into(name(at))) return;
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const here = join(at, entry.name);
      if (entry.isSymbolicLink()) continue;
      walk(here, entry.isFile() ? 'file' : entry.isDirectory() ? 'dir' : 'other');
    }
  };
  const st = stampable(dir);
  walk(dir, !st ? 'other' : st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other');
  return out;
}
