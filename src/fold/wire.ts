import * as topos from '@lapxo/topos/wire';
import type { RoleClaim } from '@lapxo/topos/wire';
import { fieldOf, selfName } from './claims.ts';

export type CoordinateRole = 'source' | 'derived' | 'observed' | 'foreign';
const spoken = topos as unknown as Readonly<Record<string, unknown>>;
export const namesAt = (spoken['namesAt'] ?? spoken['namesLeaf']) as (at: string, name: string) => boolean;
export const roleAt = (spoken['roleAt'] ?? spoken['leafRoleOf']) as (at: string, claims: readonly RoleClaim[]) => CoordinateRole;

/** The standing line that names a wire list, under `wire/`, else the older `audit/wire/` for one era. A word the wire names is read from the lock by the list it belongs to: the instrument asks for one and refuses if the lock no longer lists it, so an alphabet is never frozen here and a family that moves is a refusal, not a silence. */
export const wireLine = (standing: readonly string[], list: string): string | undefined =>
  standing.find((line) => fieldOf(line, 'scope') === `wire/${list}` && fieldOf(line, 'value') !== 'withdraw')
  ?? standing.find((line) => fieldOf(line, 'scope') === `audit/wire/${list}` && fieldOf(line, 'value') !== 'withdraw');

export function wordsOf(standing: readonly string[], list: string): readonly string[] {
  const said = wireLine(standing, list);
  return (said === undefined ? [] : fieldOf(said, 'value').split('|')).filter(Boolean);
}

/**
 * A word asked in its eras, newest first, is read in the lock it is asked of: the first era that lock's own wire lists
 * is the word there, so a place published under an older wire is read in the word it was written in, and none is a
 * refusal. A list that names exactly one word is read as that word; a list that names none, or more than one, is a
 * refusal. The older `audit/wire/` prefix is one era of `wire/`, not a fall-back to another lock.
 */
export function wordOf(standing: readonly string[], list: string, name: string | readonly string[]): string {
  const held = wordsOf(standing, list);
  const eras = typeof name === 'string' ? [name] : name;
  const found = eras.find((one) => held.includes(one));
  if (found !== undefined) return found;
  throw new Error(`${selfName()}: REFUSE·wire \`${eras.join('|')}\` is not one of \`wire/${list}\`: ${held.join('|') || 'the lock lists none'}`);
}

export function theWord(standing: readonly string[], list: string): string {
  const held = wordsOf(standing, list);
  if (held.length !== 1) {
    throw new Error(`${selfName()}: REFUSE·wire \`wire/${list}\` names ${held.length} words, not one: ${held.join('|') || 'the lock lists none'}`);
  }
  return wordOf(standing, list, held);
}

export const wordOn = (standing: readonly string[], list: string, fallback: readonly string[]): string =>
  theWord(wordsOf(standing, list).length ? standing : fallback, list);

/** A named word, read from the standing that lists it, else from the fallback lock. */
export function wordFrom(standing: readonly string[], list: string, name: string | readonly string[], fallback: readonly string[]): string {
  const eras = typeof name === 'string' ? [name] : name;
  return wordOf(eras.some((one) => wordsOf(standing, list).includes(one)) ? standing : fallback, list, name);
}

export const said = (lines: readonly string[], scope: string): readonly string[] => lines
  .filter((line) => fieldOf(line, 'scope') === scope && fieldOf(line, 'value') !== 'withdraw').flatMap((line) => fieldOf(line, 'value').split('|').filter(Boolean));
