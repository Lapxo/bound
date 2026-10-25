import { canonical, matches } from '@lapxo/topos/wire';
import { fieldOf, fieldsOf } from '../fold/claims.ts';
import { lockStanding } from '../fold/keys.ts';
import { worldAt } from '../fold/places.ts';
import { defaulted, placesOf, viewsOf, type View } from '../fold/views.ts';
import { zoomed } from '../fold/zoom.ts';
import { ownLockOf } from '../fold/signed.ts';
import { wordFrom, wireLine } from '../fold/wire.ts';
import { sourced } from '../land/vouched.ts';
import type { PlaceFold } from '../cli/place.ts';
import { nameOf } from '../render/page.ts';

/** Ephemeral view input, never a signed source record or publication artifact. */
const unsigned = (line: string): Record<string, string> => {
  const fields = fieldsOf(line);
  delete fields['sig'];
  delete fields['epoch'];
  return { ...fields, by: 'target' };
};
import { ownLock, ownStore } from '../observe/runner.ts';

/**
 * A place seen from inside it: the wire and the keys it is read with, the regions it is written in, and every line of
 * the place — its manifest, its build, its pages, its prose, its own ceilings and every line a view of it reads. Nothing
 * of the tree's history, and nothing the instrument keeps for itself, crosses; a need outside the place is left behind.
 * A capsule renders a place from these lines, in the tree as in the place published alone, so both write one coordinate; the
 * lock a place is rendered with is these lines as target lines its first land signs at epoch one, the bootstrap first.
 * A view is the place's own: a line of it that names coordinates is taken when one of them is a coordinate of the place, and a
 * line that names none where its view names this place or no place at all, or at a world that holds no line of a view
 * the views/world list names. A line another published place leads is taken only by its needs.
 */
export function takenFor(held: readonly string[], under: string, world?: { readonly own: readonly string[]; readonly tree: ReadonlyMap<string, View> }): (line: string) => boolean {
  const views = new Map([...viewsOf(held).values()].flatMap((view) => ('regions' in view ? [[view.name, view] as const] : [])));
  const inside = (need: string): boolean => need.startsWith(under);
  const crosses = ownLock().filter((line) => fieldOf(line, 'scope') === 'publish/takes').flatMap((line) => fieldOf(line, 'value').split('|').filter(Boolean));
  const kept = new Set([sourced(held), wordFrom(held, 'families', 'reader', lockStanding(ownStore())), 'publish']);
  const places = new Set(held.map((line) => fieldOf(line, 'scope').split('/')).filter((steps) => steps.length === 3 && steps[0] === 'publish' && steps[2] === 'bootstrap').map((steps) => steps[1]));
  return (line: string): boolean => {
    const scope = fieldOf(line, 'scope');
    const needs = fieldOf(line, 'needs').split('|').filter(Boolean);
    if (crosses.some((glob) => matches(glob, scope))) return true;
    if (scope.startsWith(under)) return true;
    if (scope.startsWith('view/')) {
      const view = views.get(scope.slice('view/'.length));
      if (view === undefined || view.shape === '') return false;
      const listed = wireLine(held, 'views/world');
      if ((listed === undefined ? [] : fieldOf(listed, 'value').split('|').filter(Boolean)).includes(view.name)) return world !== undefined && defaulted(held, view, world.own, world.tree);
      return (world !== undefined && defaulted(held, view, world.own, world.tree)) || (needs.length ? needs.some(inside) : placesOf(held, view).includes(under) || !placesOf(held, view).length);
    }
    const first = scope.split('/')[0] ?? '';
    if (kept.has(first)) return false;
    return (!places.has(first) && scope.includes(`/${under}`)) || (needs.length > 0 && needs.every(inside));
  };
}

export function placeLines(fold: Pick<PlaceFold, 'root' | 'standing' | 'under'>): readonly string[] {
  const place = nameOf(fold);
  const under = `${place}/`;
  const held = fold.standing.filter((line) => fieldOf(line, 'value') !== 'withdraw');
  const own = ownLockOf(fold.root, place);
  const taken = takenFor(held, under, worldAt(fold.root, place) ? { own, tree: viewsOf(ownLockOf(fold.root, '')) } : undefined);
  const rooted = (line: string): string => canonical(unsigned(zoomed(line, place)));
  const key = (line: string): string => ['scope', 'role', 'measure'].map((field) => fieldOf(line, field)).join(' ');
  const mine = own.filter((line) => !fieldOf(line, 'scope').startsWith('keys/')).map((line) => canonical(unsigned(line)));
  const ruled = new Set(mine.map(key));
  const merged = [...mine, ...held.filter(taken).map(rooted).filter((line) => !ruled.has(key(line)))];
  const scopes = new Set(merged.map((line) => fieldOf(line, 'scope')));
  return [...new Set(merged.filter((line) => !fieldOf(line, 'condition') || scopes.has(fieldOf(line, 'condition'))))];
}

