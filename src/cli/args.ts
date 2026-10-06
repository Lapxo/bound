import { relative, sep } from 'node:path';
import { observeText } from '../observe/files.ts';
import { sourceOf } from '../observe/runner.ts';
import { PROTOCOL, parse } from '@lapxo/topos/wire';
import { FLAGS, VALUED } from './names.ts';

export { VALUED };

/** What the loop runs that is not source: its entry, the packages it imports and the readers it loads, read by where they lie. */
export function entryOf(root: string): string {
  return relative(root, sourceOf()).split(sep).join('/');
}

export function valueOf(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

export const valuesOf = (args: readonly string[], flag: string): readonly string[] => args.flatMap((arg, i) => (arg === flag && args[i + 1] !== undefined ? [args[i + 1]!] : []));
export const namedPlaces = (args: readonly string[]): readonly string[] => valuesOf(args, FLAGS.place).map((one) => one.replace(/\/$/, ''));

export function positionalsOf(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (VALUED.includes(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith('--')) out.push(arg);
  }
  return out;
}

export const placesOfFile = (file: string): readonly string[] => (observeText(file) ?? '').split('\n').map((line) => line.trim())
  .filter((line) => line.startsWith('# place ')).map((line) => line.slice('# place '.length).trim().replace(/\/$/, '')).filter(Boolean);

export function claimLinesIn(file: string): string[] {
  const lines = (observeText(file) ?? '').split('\n').map(line => line.trim())
    .filter(line => line.startsWith(`${PROTOCOL.split('/')[0]}/`));
  for (const line of lines) {
    const got = parse(line);
    if (got.kind !== 'fact') throw new Error(`REFUSE·wire batch ${got.why} · nothing signed or landed`);
  }
  return lines;
}
