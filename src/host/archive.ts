import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const BLOCK = 512; // POSIX tar record size.
export interface Member { readonly name: string; readonly bytes: Uint8Array }
const refuse = (why: string): never => { throw new Error(`REFUSE·archive ${why}`); };

/** POSIX archive coordinates; normalization cannot make two members share one destination. */
export function archiveCoordinate(name: string): string {
  if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\') || name.includes('\0')) refuse(`invalid coordinate ${JSON.stringify(name)}`);
  const parts = name.replace(/\/+$/, '').split('/');
  while (parts[0] === '.') parts.shift();
  if (!parts.length || parts.some((part) => !part || part === '.' || part === '..')) refuse(`invalid coordinate ${JSON.stringify(name)}`);
  return parts.join('/');
}

function pax(bytes: Uint8Array): Record<string, string> {
  const fields: Record<string, string> = {};
  for (let at = 0; at < bytes.length;) {
    const space = bytes.indexOf(32, at);
    if (space < 0) refuse('malformed PAX record length');
    const lengthText = new TextDecoder().decode(bytes.subarray(at, space));
    if (!/^\d+$/.test(lengthText)) refuse('malformed PAX record length');
    const length = Number(lengthText);
    const end = at + length;
    if (!Number.isSafeInteger(length) || length <= space - at + 1 || end > bytes.length || bytes[end - 1] !== 10) refuse('truncated PAX record');
    const record = new TextDecoder().decode(bytes.subarray(space + 1, end - 1));
    const equals = record.indexOf('=');
    if (equals < 1) refuse('malformed PAX attribute');
    const key = record.slice(0, equals);
    if (key.startsWith('GNU.sparse') || key.startsWith('SCHILY.realsize')) refuse('sparse PAX members are unsupported');
    fields[key] = record.slice(equals + 1);
    at = end;
  }
  return fields;
}

/** The gzip/POSIX tar adapter reads regular files, directories and PAX attributes, or rejects the whole archive. */
export function members(archive: Uint8Array): readonly Member[] {
  const bytes = gunzipSync(archive);
  const text = (at: number, length: number): string => bytes.subarray(at, at + length).toString('utf8').replace(/\0[\s\S]*$/, '');
  const octal = (at: number, length: number): number => {
    const raw = text(at, length).trim();
    if (!/^[0-7]+$/.test(raw)) refuse(`invalid octal field at ${at}`);
    const n = Number.parseInt(raw, 8);
    if (!Number.isSafeInteger(n) || n < 0) refuse(`unrepresentable field at ${at}`);
    return n;
  };
  const out: Member[] = [];
  const files = new Set<string>();
  const directories = new Set<string>();
  let global: Record<string, string> = {};
  let local: Record<string, string> | undefined;
  for (let at = 0; ; ) {
    if (at + BLOCK > bytes.length) refuse('missing complete end records');
    const header = bytes.subarray(at, at + BLOCK);
    if (header.every((byte) => byte === 0)) {
      if (local !== undefined) refuse('PAX attributes have no following member');
      if (at + 2 * BLOCK > bytes.length || !bytes.subarray(at).every((byte) => byte === 0)) refuse('invalid end records or trailing data');
      return out;
    }
    const checksum = header.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    if (octal(at + 148, 8) !== checksum) refuse(`header checksum mismatch at ${at}`);
    const magic = text(at + 257, 6);
    if (magic && magic !== 'ustar' && magic !== 'ustar ') refuse(`unsupported tar format ${magic}`);
    const type = text(at + 156, 1);
    const attrs = { ...global, ...local };
    let size = octal(at + 124, 12);
    if (type !== 'x' && type !== 'g' && attrs['size'] !== undefined) {
      if (!/^\d+$/.test(attrs['size'])) refuse('invalid PAX size');
      size = Number(attrs['size']);
      if (!Number.isSafeInteger(size)) refuse('unrepresentable PAX size');
    }
    const next = at + BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (next > bytes.length) refuse(`truncated member at ${at}`);
    const body = bytes.subarray(at + BLOCK, at + BLOCK + size);
    if (type === 'x' || type === 'g') {
      const fields = pax(body);
      if (type === 'g') global = { ...global, ...fields };
      else local = { ...local, ...fields };
    } else {
      const rawName = attrs['path'] ?? [magic ? text(at + 345, 155) : '', text(at, 100)].filter(Boolean).join('/');
      local = undefined;
      if (type === '5' && /^\.\/?$/.test(rawName) && size === 0) { at = next; continue; }
      const name = archiveCoordinate(rawName);
      if (!['', '0', '5'].includes(type)) refuse(`unsupported member type ${type} at ${name}`);
      const steps = name.split('/');
      if (steps.slice(0, -1).some((_, i) => files.has(steps.slice(0, i + 1).join('/')))) refuse(`file is an ancestor of ${name}`);
      if (type === '5') {
        if (size !== 0 || files.has(name)) refuse(`invalid directory ${name}`);
        directories.add(name);
      } else {
        if (files.has(name) || directories.has(name)) refuse(`duplicate or conflicting member ${name}`);
        files.add(name);
        steps.slice(0, -1).forEach((_, i) => directories.add(steps.slice(0, i + 1).join('/')));
        out.push({ name, bytes: body });
      }
    }
    at = next;
  }
}

/** Existing links or files are never followed or overwritten by extraction. */
export function archiveDestination(into: string, name: string): string {
  const root = resolve(into);
  const parts = archiveCoordinate(name).split('/');
  let at = root;
  const base = lstatSync(at, { throwIfNoEntry: false });
  if (base !== undefined && !base.isDirectory()) refuse(`destination is not a directory: ${root}`);
  for (let i = 0; i < parts.length; i += 1) {
    at = join(at, parts[i]!);
    const st = lstatSync(at, { throwIfNoEntry: false });
    if (st !== undefined && (i === parts.length - 1 || !st.isDirectory())) refuse(`destination already occupied: ${at}`);
  }
  return at;
}

export function unpack(archive: Uint8Array, into: string): readonly string[] {
  const files = members(archive);
  const destinations = files.map((one) => archiveDestination(into, one.name));
  for (const [i, one] of files.entries()) {
    const at = destinations[i]!;
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, one.bytes, { flag: 'wx' });
  }
  return files.map((one) => one.name);
}
