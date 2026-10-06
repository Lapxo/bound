import { createHash, join } from '../host/io.ts';
import { said, wordOf, wordsOf } from '../fold/wire.ts';
import type { CoordinateRole } from '../fold/wire.ts';
import { fieldOf } from '../fold/claims.ts';
import { point, region, within } from '@lapxo/obligations/field';
import { canonical } from '@lapxo/topos/wire';
import { land, ledgerLines } from './ledger.ts';
import { lockStanding } from '../fold/keys.ts';
import { ownLock } from '../observe/runner.ts';
import { entriesIn, linkOf, observeFile, observeText, stampOf } from '../observe/files.ts';

/** A location is a file or a directory; `x/*` names the directory `x/`. A deeper glob is not a location. */
export function locationsOf(needs: string): { readonly locations: readonly string[]; readonly refused: readonly string[] } {
  const locations: string[] = [];
  const refused: string[] = [];
  for (const raw of needs.split('|').map((n) => n.trim()).filter(Boolean)) {
    const steps = raw.split('/').filter(Boolean);
    while (steps[steps.length - 1] === '*' || steps[steps.length - 1] === '**') steps.pop();
    if (!steps.length || raw.includes('#') || steps.some((step) => step.includes('*'))) {
      refused.push(raw);
      continue;
    }
    locations.push(steps.join('/'));
  }
  return { locations, refused };
}

function digestOf(bytes: Buffer | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * The source coordinates under one location, by digest. A path whose role is not source is never walked, so nothing under
 * it is read. A link is a coordinate whose bytes are its target; it is never followed.
 */
export function coordinatesOf(root: string, location: string, roleOf: (coordinate: string) => CoordinateRole): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (rel: string): void => {
    if (roleOf(rel) !== 'source') return;
    const abs = join(root, rel);
    const st = stampOf(abs);
    if (!st) return;
    if (st.kind === 'link') {
      out.set(rel, digestOf(`link:${linkOf(abs)}`));
      return;
    }
    if (st.kind === 'dir') {
      for (const name of entriesIn(abs).map((entry) => entry.name).sort()) visit(join(rel, name));
      return;
    }
    if (st.kind === 'file') out.set(rel, digestOf(Buffer.from(observeFile(abs) ?? new Uint8Array())));
  };
  visit(location.replace(/\/$/, ''));
  return out;
}

/** The law a witness file says it answers for: its own `witness=<law>` line, or its `"witness"` field. */
export function witnessOf(root: string, coordinate: string): string | undefined {
  if (stampOf(join(root, coordinate))?.kind !== 'file') return undefined;
  const text = observeText(join(root, coordinate)) ?? '';
  return /^witness=([^\s]+)/m.exec(text)?.[1] ?? /"witness"\s*:\s*"([^"]+)"/.exec(text)?.[1];
}

function storeFamily(standing: readonly string[], coordinate: string): string {
  const names = said(ownLock(), coordinate);
  if (!names.length) throw new Error(`REFUSE·instrument ${coordinate} has no admitted declaration in the instrument lock`);
  return wordsOf(standing, 'families').length ? wordOf(standing, 'families', names) : names[0]!;
}

export const vouching = (standing: readonly string[]): string => storeFamily(standing, 'store/vouches');
export const sourced = (standing: readonly string[]): string => storeFamily(standing, 'store/source');
export const sourceOf = (line: string): string | undefined => (fieldOf(line, 'measure') === 'digest' && fieldOf(line, 'scope').includes('/') ? fieldOf(line, 'scope').slice(fieldOf(line, 'scope').indexOf('/') + 1) : undefined);

export function inside(path: string, location: string): boolean {
  return within(point(path), region(location));
}

export function vouchedCoordinates(store: string): Map<string, string> {
  const out = new Map<string, string>();
  const standing = lockStanding(store);
  if (!wordsOf(standing, 'states').length) return out;
  const absent = wordOf(standing, 'states', 'absent');
  for (const line of ledgerLines(store, vouching(standing))) {
    const path = sourceOf(line);
    const value = fieldOf(line, 'value');
    if (!path || !value) continue;
    if (value === absent) out.delete(path);
    else out.set(path, value);
  }
  return out;
}

export function everLanded(store: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const line of ledgerLines(store, vouching(lockStanding(store)))) {
    const path = sourceOf(line);
    if (path) out.add(path);
  }
  return out;
}

export function hasVouchedTree(store: string): boolean {
  return ledgerLines(store, vouching(lockStanding(store))).length > 0;
}

export function landCoordinates(
  store: string,
  present: ReadonlyMap<string, string>,
  gone: readonly string[],
  at: string,
): number {
  const standing = lockStanding(store);
  const line = (path: string, value: string): string => canonical({
    scope: `${sourced(standing)}/${path}`, role: 'writes', form: 'alphabet', measure: 'digest', value, by: 'land', at,
  });
  return land(store, vouching(standing), [...[...present].map(([path, value]) => line(path, value)), ...gone.map((path) => line(path, wordOf(standing, 'states', 'absent')))]).appended;
}
