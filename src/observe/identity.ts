import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { canonical } from '@lapxo/topos/wire';
import { bytesDigest } from '../fold/digests.ts';
import { fieldOf, selfName } from '../fold/claims.ts';
import { observeText } from './files.ts';
import { runReader } from './run.ts';
import type { Kind } from './run.ts';
import { wordOf } from '../fold/wire.ts';
import { lockStanding } from '../fold/keys.ts';

type Case = { readonly place: string; readonly text?: string; readonly files?: Readonly<Record<string, string>> };

/** Where a reader's vectors lie: in its package, beside its source, under the name of its module, the folder the wire's vector family names. */
export const vectorsOf = (module: string, standing: readonly string[]): string =>
  join(module.split('/')[0] ?? '', `${wordOf(standing, 'families', 'vector')}s`, `${basename(module).replace(/\.[^.]+$/, '')}.json`);

export const withoutVectors = (root: string, modules: readonly string[], standing: readonly string[]): number =>
  [...new Set(modules)].filter((module) => observeText(resolve(root, vectorsOf(module, standing))) === undefined).length;

export function resetsOnEqualEmits(lines: readonly string[]): number {
  const named = new Map<string, Set<string>>();
  for (const line of lines.filter((one) => fieldOf(one, 'measure') === 'emits')) {
    const key = `${fieldOf(line, 'scope')} ${fieldOf(line, 'value')}`;
    named.set(key, (named.get(key) ?? new Set<string>()).add(fieldOf(line, 'at')));
  }
  return [...named.values()].filter((ats) => ats.size > 1).length;
}

function emitted(store: string, root: string, module: string, kind: Kind, cases: readonly Case[]): string | undefined {
  const laid = kind === 'process' ? mkdtempSync(join(tmpdir(), `${selfName()}-vectors-`)) : root;
  try {
    for (const one of kind === 'process' ? cases : []) {
      for (const [name, text] of Object.entries(one.files ?? {})) {
        mkdirSync(dirname(join(laid, one.place, name)), { recursive: true });
        writeFileSync(join(laid, one.place, name), text);
      }
    }
    const rows = runReader(resolve(root, module), laid, cases.map((one) => ({ place: one.place, ...(kind === 'js' ? { text: one.text ?? '' } : {}) })));
    if (cases.length && rows.every((mine) => !mine.length)) return undefined;
    const said = rows.map((mine) => mine.filter((row) => !/^(cost|derived|vector-memo)\//.test(row.scope)).map((row) => JSON.stringify(row)).sort());
    return bytesDigest(store, new TextEncoder().encode(JSON.stringify(said))).replace(/^[^:]*:/, '');
  } finally {
    if (laid !== root) rmSync(laid, { recursive: true, force: true });
  }
}

/** The executable keys the reader; its vector results describe only the cases measured. */
export function identityOf(input: {
  readonly store: string;
  readonly root: string;
  readonly speaker: string;
  readonly module: string;
  readonly kind: Kind;
  readonly code: string;
  readonly lineage: readonly string[];
  readonly kept: readonly string[];
}): { readonly by: string; readonly lines: readonly string[] } {
  const text = observeText(resolve(input.root, vectorsOf(input.module, lockStanding(input.store))));
  if (text === undefined) return { by: input.code, lines: [] };
  const short = (value: string): string => bytesDigest(input.store, new TextEncoder().encode(value)).replace(/^[^:]*:/, '').slice(0, 12);
  const key = short(`${input.code} ${short(text)}`);
  const mine = input.kept.filter((line) => fieldOf(line, 'scope') === `reader/${input.module}`);
  const known = mine.find((line) => fieldOf(line, 'measure') === 'extension' && fieldOf(line, 'at') === `place:${key}`);
  if (known !== undefined && fieldOf(known, 'value') === input.code) return { by: input.code, lines: [] };
  const emits = emitted(input.store, input.root, input.module, input.kind, (JSON.parse(text) as { readonly cases?: readonly Case[] }).cases ?? []);
  if (emits === undefined) return { by: input.code, lines: [] };
  const by = input.code;
  const line = (measure: string, value: string, at: string): string => canonical({
    scope: `reader/${input.module}`, role: 'writes', form: 'alphabet', measure, value, by: `${input.speaker}:${by}`, at: `place:${at}`,
  });
  return { by, lines: [line('extension', by, key), line('emits', emits, by)] };
}
