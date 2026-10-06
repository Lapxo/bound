import { join } from '../host/io.ts';
import { CAPSULE, canonical, LOCK, matches, parse } from '@lapxo/topos/wire';
import { fieldOf } from './claims.ts';
import { isCeiling } from './configures.ts';
import { entriesIn, observeText } from '../observe/files.ts';
import { ownLock } from '../observe/runner.ts';
import { said } from './wire.ts';
import { ownLockOf } from './signed.ts';

type Spoken = { readonly place: string; readonly line: string };

export const placesIn = (root: string): readonly string[] => entriesIn(root)
  .filter((entry) => entry.dir && observeText(join(root, entry.name, LOCK)) !== undefined).map((entry) => entry.name).sort();

/** A directory with no own lock is founded by the root: a line of its region family names the directory's coordinates, and a covered batch that names the place lands its first own lock. */
export const foundableIn = (root: string, standing: readonly string[], family: string, name: string): boolean => !placesIn(root).includes(name)
  && (entriesIn(root).find((entry) => entry.name === name)?.dir ?? false)
  && standing.some((line) => fieldOf(line, 'scope') === `${family}/${name}` && fieldOf(line, 'measure') === 'coordinates' && fieldOf(line, 'value').split('|').includes(`${name}/**`));

export const capsuleAt = (root: string, name: string): boolean => [LOCK, CAPSULE]
  .some((lock) => (observeText(join(root, name, lock)) ?? '').split('\n').some((line) => fieldOf(line, 'scope').startsWith('capsule/')));

/** A world is a place whose own lock names capsule/key. A view named by wire/views/world resolves into these and no other place. */
export const worldAt = (root: string, name: string): boolean => [LOCK, CAPSULE]
  .some((lock) => (observeText(join(root, name, lock)) ?? '').split('\n').some((line) => fieldOf(line, 'scope') === 'capsule/key' && fieldOf(line, 'value') !== 'withdraw'));

export const worldsIn = (root: string): readonly string[] => placesIn(root).filter((name) => worldAt(root, name));

export function kindsOf(root: string, place: string): readonly string[] {
  const lock = ownLockOf(root, place);
  const kinds: string[] = [];
  if (worldAt(root, place)) kinds.push('world');
  const saidKind = lock.find((line) => fieldOf(line, 'scope') === 'place/kind' && fieldOf(line, 'value') !== 'withdraw');
  if (saidKind !== undefined) kinds.push(...fieldOf(saidKind, 'value').split('|').filter(Boolean));
  return [...new Set(kinds)];
}

type ClassDefault = { readonly classes: readonly string[]; readonly line: string };

export function classDefaults(root: string): readonly ClassDefault[] {
  return placesIn(root).flatMap((place) => {
    const lock = ownLockOf(root, place);
    return lock.filter((line) => fieldOf(line, 'scope').startsWith('class/') && fieldOf(line, 'value') !== 'withdraw')
      .flatMap((line) => {
        const kind = fieldOf(line, 'scope').slice('class/'.length);
        const named = new Set(fieldOf(line, 'value').split('|').filter(Boolean));
        return lock.filter((one) => named.has(fieldOf(one, 'scope')) && isCeiling(one))
          .map((audit) => ({ classes: kind === '' ? [] : [kind], line: audit }));
      });
  });
}

export const fromPlace = (place: string, places: readonly string[]) => (path: string): string =>
  (path === './' ? `${place}/` : places.some((one) => path.startsWith(`${one}/`)) ? path : `${place}/${path}`);

/**
 * What each place's own lock says for the tree, in the tree's names: the families bound's own lock lists, every need
 * and every reader's module read from the place, and the scopes it lists under a place written with the place after
 * the steps its glob names. A view the place writes and no need names is the place's own coordinate.
 */
const heard = new Map<string, { readonly parts: readonly (readonly string[])[]; readonly got: readonly Spoken[] }>();

export function spoken(root: string): readonly Spoken[] {
  const places = placesIn(root);
  const parts = [ownLock(), ...places.map((place) => ownLockOf(root, place))];
  const last = heard.get(root);
  if (last !== undefined && last.parts.length === parts.length && last.parts.every((part, i) => part === parts[i])) return last.got;
  const got = speakingOf(root, places);
  heard.set(root, { parts, got });
  return got;
}

function speakingOf(root: string, places: readonly string[]): readonly Spoken[] {
  const speaks = said(ownLock(), 'place/speaks');
  const under = said(ownLock(), 'place/speaks-under');
  if (!speaks.length && !under.length) return [];
  return places.flatMap((place) => ownLockOf(root, place).flatMap((line) => {
    const got = parse(line);
    const scope = fieldOf(line, 'scope');
    const steps = scope.split('/');
    const cut = under.flatMap((glob) => steps.map((_, i) => i + 1).filter((i) => i < steps.length && matches(glob, steps.slice(0, i).join('/')))).sort((a, b) => a - b)[0];
    if (got.kind !== 'fact' || (cut === undefined && !speaks.some((glob) => matches(glob, scope)))) return [];
    const fields: Record<string, string> = { ...got.value.fields };
    const path = fromPlace(place, places);
    if (cut !== undefined && steps[cut] !== place) fields['scope'] = [...steps.slice(0, cut), place, ...steps.slice(cut)].join('/');
    if (fields['needs']) fields['needs'] = fields['needs'].split('|').filter(Boolean).map(path).join('|');
    else if (fields['shape'] && fields['role'] === 'demands') fields['needs'] = path(fields['shape']);
    if (fields['measure'] === 'reader' && fields['value']) fields['value'] = path(fields['value']);
    return [{ place, line: canonical(fields) }];
  }));
}
