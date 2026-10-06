import { fieldOf } from './claims.ts';
import { wordOf, wordsOf } from './wire.ts';

interface Asked {
  readonly name: string;
  readonly at: number;
  readonly called?: boolean;
}

export interface View {
  readonly name: string;
  readonly regions: readonly Asked[];
  readonly shape: string;
}

/**
 * A view is a signed line `view/<name>` whose value lists regions in the order they are written, each at the resolution
 * it asks for (`region@n`, the steps of each line it keeps, three when it asks for none, and the one the view is called
 * at for `region@*`), and whose shape, when it has one, names the coordinate the view renders into. What renders a region is
 * read where the fold is known, and a view asking one nothing renders is refused there, by name.
 */
export function viewsOf(standing: readonly string[]): ReadonlyMap<string, View> {
  const held = wordsOf(standing, 'families');
  const family = `${held.includes('view') || !held.length ? 'view' : wordOf(standing, 'families', 'view')}/`;
  const views = new Map<string, View>();
  for (const line of standing) {
    const scope = fieldOf(line, 'scope');
    if (!scope.startsWith(family) || fieldOf(line, 'role') !== 'demands' || fieldOf(line, 'value') === 'withdraw') continue;
    const name = scope.slice(family.length);
    if (views.has(name)) continue;
    const regions = fieldOf(line, 'value').split('|').filter(Boolean)
      .map((token) => ({ name: token.split('@')[0]!, at: token.includes('@') && Number.isFinite(Number(token.split('@')[1])) ? Number(token.split('@')[1]) : 3, ...(token.endsWith('@*') ? { called: true } : {}) }));
    views.set(name, { name, regions, shape: fieldOf(line, 'shape') });
  }
  return views;
}

/**
 * A view the wire's views/world list names writes at a world that holds no view of that name of its own: the tree's line
 * of the name, at the shape it names. A place's own view of a shape shadows the list at that shape: own over root, one
 * writer. Two views naming the same shape in one place is a refuse at rank, before any render.
 */
export const defaulted = (standing: readonly string[], view: View, own: readonly string[], tree: ReadonlyMap<string, View>): boolean => {
  const family = `${wordOf(standing, 'families', 'view')}/`;
  const owns = (name: string): boolean => own.some((line) => fieldOf(line, 'scope') === `${family}${name}` && fieldOf(line, 'value') !== 'withdraw');
  const writes = (shape: string): boolean => shape !== '' && own.some((line) => fieldOf(line, 'scope').startsWith(family) && fieldOf(line, 'shape') === shape && fieldOf(line, 'value') !== 'withdraw');
  return !writes(view.shape) && wordsOf(standing, 'views/world').includes(view.name) && tree.get(view.name)?.shape === view.shape && !owns(view.name);
};

/** Shapes two standing views of one place both name: rank refuses before a render, one path, one writer. */
export function sharedShapes(standing: readonly string[]): readonly string[] {
  const named = new Map<string, string[]>();
  for (const line of standing) {
    const scope = fieldOf(line, 'scope');
    if (!scope.startsWith('view/') || fieldOf(line, 'role') !== 'demands' || fieldOf(line, 'value') === 'withdraw') continue;
    const shape = fieldOf(line, 'shape');
    if (!shape) continue;
    named.set(shape, [...(named.get(shape) ?? []), scope.slice('view/'.length)]);
  }
  return [...named].filter(([, names]) => new Set(names).size > 1).map(([shape, names]) => `${shape} · view/${[...new Set(names)].join(' · view/')}`);
};

const placed = new WeakMap<readonly string[], Map<string, readonly string[]>>();

export function placesOf(standing: readonly string[], view: View): readonly string[] {
  const known = placed.get(standing) ?? new Map<string, readonly string[]>();
  placed.set(standing, known);
  const asked = known.get(`${view.name} ${view.shape}`);
  if (asked !== undefined) return asked;
  const scope = `${wordOf(standing, 'families', 'view')}/${view.name}`;
  const lines = standing.filter((one) => fieldOf(one, 'scope') === scope && fieldOf(one, 'value') !== 'withdraw');
  const same = lines.filter((one) => fieldOf(one, 'value') === fieldOf(lines[0] ?? '', 'value') && fieldOf(one, 'shape') === view.shape);
  const places = !view.shape ? [] : [...new Set(same.flatMap((one) => fieldOf(one, 'needs').split('|'))
    .filter((need) => need === view.shape || need.endsWith(`/${view.shape}`)).map((need) => need.slice(0, need.length - view.shape.length)))];
  known.set(`${view.name} ${view.shape}`, places);
  return places;
}
