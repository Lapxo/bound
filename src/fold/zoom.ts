import { join } from '../host/io.ts';
import { canonical, LOCK, parse, RECEIPTS } from '@lapxo/topos/wire';
import { fieldOf, foldClaims, isWire } from './claims.ts';
import { entriesIn, observeText } from '../observe/files.ts';

/**
 * A line of the tree seen from inside a place: every path it names under the place is read from the place's root, and
 * a path outside it is dropped, since the place alone cannot read it. The place's name drops out of the scope, the condition
 * and the policy a line is held at, and a cone names the coordinates it covers the same way; the place itself is `./`. In a
 * scope the name drops out of the step after the family, or after the one word that qualifies it (prose/en, hazard/<kind>,
 * source/<measure>); a deeper step that spells it is inside a name, such as a package a module imports, and stays.
 */
export function zoomed(line: string, place: string): string {
  const got = parse(line);
  if (got.kind !== 'fact') return line;
  const fields: Record<string, string> = { ...got.value.fields };
  const under = `${place}/`;
  const paths = (value: string): string => value.split('|').filter(Boolean)
    .flatMap((one) => (one === under ? ['./'] : one.startsWith(under) ? [one.slice(under.length)] : [])).join('|');
  const scope = (value: string): string => {
    if (value === under) return './';
    if (value.startsWith(under)) return value.slice(under.length);
    const steps = value.split('/');
    const at = steps.findIndex((step, i) => step === place && (i === 1 || i === 2) && i < steps.length - 1);
    return at < 0 ? value : [...steps.slice(0, at), ...steps.slice(at + 1)].join('/');
  };
  if (fields['needs'] !== undefined) {
    const kept = paths(fields['needs']);
    if (kept) fields['needs'] = kept;
    else delete fields['needs'];
  }
  for (const name of ['scope', 'condition']) if (fields[name]) fields[name] = scope(fields[name]!);
  const at = fields['at'] ?? '';
  const colon = at.indexOf(':');
  if (colon > 0 && at.startsWith(under, colon + 1)) fields['at'] = `${at.slice(0, colon + 1)}${at.slice(colon + 1 + under.length)}`;
  if (fields['measure'] === 'cone' && fields['value']) fields['value'] = paths(fields['value']);
  return canonical(fields);
}

/** The lines of each place's own lock that still name the place: seen from inside a place, no scope carries its name. */
export function namingTheirPlace(root: string): number {
  return entriesIn(root).filter((entry) => entry.dir && !entry.name.startsWith('.')).flatMap((entry) => {
    const own = (observeText(join(root, entry.name, LOCK)) ?? '').split('\n').filter(isWire);
    return foldClaims(own).standing.filter((line) => fieldOf(line, 'value') !== 'withdraw')
      .map((line) => fieldOf(line, 'scope')).filter((scope) => scope.startsWith(`${entry.name}/`) || scope.includes(`/${entry.name}/`));
  }).length;
}

/**
 * What a zoom rewrote that is not the place: over each place the lock publishes, every scope and condition of the tree
 * and of the place's receipts that spells the place as a step, zoomed from inside it. Losing the place's step after the
 * family, or after the one word qualifying it, is the zoom; any other rewrite took a value for the place.
 */
export function zoomedOutsideThePlace(root: string, standing: readonly string[]): number {
  const places = standing.filter((line) => /^publish\/[^/]+\/bootstrap$/.test(fieldOf(line, 'scope')) && fieldOf(line, 'value') !== 'withdraw')
    .map((line) => fieldOf(line, 'scope').split('/')[1]!);
  const lost = (before: string, after: string, place: string): boolean => {
    if (after === before) return false;
    if (before === `${place}/`) return after !== './';
    if (before.startsWith(`${place}/`)) return after !== before.slice(place.length + 1);
    const steps = before.split('/');
    return ![1, 2].some((i) => steps[i] === place && i < steps.length - 1 && after === [...steps.slice(0, i), ...steps.slice(i + 1)].join('/'));
  };
  return places.reduce((count, place) => {
    const text = observeText(join(root, place, RECEIPTS));
    const receipts = text === undefined ? [] : text.split('\n').filter(isWire);
    return count + [...standing, ...receipts].flatMap((line) => ['scope', 'condition']
      .filter((field) => fieldOf(line, field).split('/').includes(place))
      .filter((field) => lost(fieldOf(line, field), fieldOf(zoomed(line, place), field), place))).length;
  }, 0);
}
