import {hostRequiresFreshBytes} from '../host/call-context.ts';
import {preparingView,viewInput} from '../host/reading-context.ts';
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
  let bytes: Buffer;
  try { bytes = readFileSync(at); }
  catch (error) {
    // A concurrent act can retire a coordinate after its stamp was read.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    seen.delete(at);
    return undefined;
  }
  seen.set(at, { stamp, bytes });
  return bytes;
}

// Always read current bytes before reuse; metadata never establishes equality.
const currentBytes=new Map<string,{readonly bytes:Buffer;readonly encoded:string}>();
let retainedBytes=0;
const CURRENT_BYTE_LIMIT=16*1024*1024,CURRENT_FILE_LIMIT=256;
function currentFile(at:string):{readonly bytes:Buffer;readonly encoded:string}|undefined{
 let bytes:Buffer;
 try{bytes=readFileSync(at)}catch(error){
  if(!['ENOENT','EISDIR'].includes((error as NodeJS.ErrnoException).code??''))throw error;
  const old=currentBytes.get(at);if(old){retainedBytes-=old.bytes.length;currentBytes.delete(at)}return undefined;
 }
 const held=currentBytes.get(at);if(held&&bytes.equals(held.bytes))return held;
 if(held){retainedBytes-=held.bytes.length;currentBytes.delete(at)}
 const value={bytes,encoded:bytes.toString('base64')};
 if(bytes.length<=CURRENT_BYTE_LIMIT){
  while(currentBytes.size>=CURRENT_FILE_LIMIT||retainedBytes+bytes.length>CURRENT_BYTE_LIMIT){const first=currentBytes.keys().next().value!;retainedBytes-=currentBytes.get(first)!.bytes.length;currentBytes.delete(first)}
  currentBytes.set(at,value);retainedBytes+=bytes.length;
 }
 return value;
}
function viewBytes(at:string):Buffer|undefined{
 if(!preparingView())return hostRequiresFreshBytes()?currentFile(at)?.bytes:bytesAt(at);
 const encoded=viewInput('file:'+at,()=>currentFile(at)?.encoded);
 if(encoded===undefined)return undefined;
 const held=currentBytes.get(at);
 // Keep the captured value even if a later observation changed this coordinate.
 return held?.encoded===encoded?held.bytes:Buffer.from(encoded,'base64');
}
export const observeFile = (at: string): Uint8Array | undefined => ((bytes) => (bytes === undefined ? undefined : new Uint8Array(bytes)))(viewBytes(at));

export const observeText = (at: string): string | undefined => viewBytes(at)?.toString('utf8');

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
  return viewInput('entries:'+at,()=>readdirSync(at, { withFileTypes: true }).map((entry) => ({ name: entry.name, dir: entry.isDirectory() })));
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
