import { createHash } from '../host/io.ts';
import { alphabetForm } from '@lapxo/obligations/forms';
import type { Interval } from '@lapxo/obligations/forms';
import type { Lattice } from '@lapxo/obligations/lattice';
import { cell, parts, sign } from '@lapxo/obligations/views/field';
import type { World } from '@lapxo/obligations/views/field';
import { point, region as coordinates, within } from '@lapxo/obligations/field';
import { matches, parse, roleClaimsOf } from '@lapxo/topos/wire';
import { fieldOf } from './claims.ts';
import { INTERVALS, spanOf } from '@lapxo/topos/forms';

/**
 * A region is a prefix of the place, read at a resolution: the prefixes a lock already names — the steps a role, a
 * directory or a need is given at — are its regions, a cell belongs to the longest of them that holds it, and a region
 * rests on the region its prefix extends. A signature or a requirement is a line at the region its scope names, never a
 * value copied into the cells there; a cell's poles are the meet of the live bounds on its chain of rest, met in the
 * lattice of their form. Each region carries a summary of what lies in it, summed over the regions that rest on it —
 * cells, the sums and the values they read at the lattice's own resolution, the bounds signed at it — so what a bound
 * would bite is read off a summary without visiting a cell, and two readings of one place differ exactly in the regions
 * whose summaries differ. Nothing here is kept between folds; a region is read from the lines that stand and the cells seen.
 */
export interface Bound {
  readonly line: string;
  readonly question: string;
  readonly region: string;
  readonly measure: string;
  readonly form: string;
  readonly value: string;
}

export interface Regions {
  readonly named: readonly string[];
  readonly bounds: readonly Bound[];
  readonly summaries: ReadonlyMap<string, {
    readonly region: string;
    readonly cells: number;
    readonly sums: ReadonlyMap<string, number>;
    readonly values: ReadonlyMap<string, ReadonlyMap<string, number>>;
    readonly bounds: readonly Bound[];
  }>;
}

type Summary = Regions['summaries'] extends ReadonlyMap<string, infer S> ? S : never;

const trimmed = (prefix: string): string => prefix.replace(/(?:\/\*\*|\/\*|\/)+$/, '');
const globbed = (prefix: string): boolean => prefix.includes('*');

export function regionsNamed(standing: readonly string[]): readonly string[] {
  const out = new Set<string>(['']);
  for (const line of standing) {
    if (fieldOf(line, 'value') === 'withdraw') continue;
    const scope = fieldOf(line, 'scope');
    const got = ['role', 'paths'].includes(fieldOf(line, 'measure')) ? parse(line) : undefined;
    const roled = got?.kind === 'fact' ? roleClaimsOf([got.value.fields]).map((claim) => claim.name) : [];
    const said = roled.length ? roled
      : scope.startsWith('dir/') ? [scope.slice('dir/'.length)]
        : scope.startsWith('region/') && fieldOf(line, 'res') ? [fieldOf(line, 'value')] : [];
    for (const prefix of [...said, ...fieldOf(line, 'needs').split('|')].map(trimmed)) if (prefix && !globbed(prefix)) out.add(prefix);
  }
  return [...out].sort();
}

function restsOn(named: readonly string[], prefix: string): string {
  let best = '';
  for (const one of named) if (one.length > best.length && one !== prefix && prefix.startsWith(`${one}/`)) best = one;
  return best;
}

function regionOf(named: readonly string[], place: string): string {
  const at = trimmed(place);
  let best = '';
  for (const one of named) if (one.length > best.length && (at === one || at.startsWith(`${one}/`))) best = one;
  return best;
}

const names = (named: readonly string[], prefix: string): boolean => (globbed(prefix) ? named.some((one) => matches(prefix, one)) : named.includes(prefix));

export function boundOf(named: readonly string[], line: string): Bound {
  const scope = fieldOf(line, 'scope');
  const steps = scope.split('/');
  const of = (question: string, region: string): Bound => ({ line, question, region, measure: fieldOf(line, 'measure'), form: fieldOf(line, 'form'), value: fieldOf(line, 'value') });
  for (let i = 1; i < steps.length; i += 1) {
    const tail = trimmed(steps.slice(i).join('/'));
    if (tail && names(named, tail)) return of(steps.slice(0, i).join('/'), tail);
  }
  for (let j = steps.length - 1; j > 0; j -= 1) {
    const head = steps.slice(0, j).join('/');
    if (names(named, head)) return of(steps.slice(j).join('/'), head);
  }
  return of(scope, '');
}

function poleAt(named: readonly string[], region: string, bounds: readonly Bound[]): Interval | readonly string[] | undefined {
  const chain: string[] = [];
  for (let at = region; !chain.includes(at); at = restsOn(named, at)) chain.push(at);
  const signedIn = <T,>(L: Lattice<T>, spans: readonly (readonly [Bound, T])[]): T => {
    let world: World<T> = new Map(chain.map((_, i) => [`c${i}`, cell<T>(`c${i}`, 0, [], i + 1 < chain.length ? [`c${i + 1}`] : [])] as const));
    for (const [one, span] of spans) world = sign(L, world, `c${Math.max(0, chain.indexOf(one.region))}`, span);
    return parts(L, world.get('c0')!, world).signed;
  };
  const spans = bounds.filter((one) => one.form === 'interval').flatMap((one) => ((got) => (got ? [[one, got] as const] : []))(spanOf(one.value)));
  if (spans.length) return signedIn(INTERVALS, spans);
  const alphabets = bounds.filter((one) => one.form === 'alphabet');
  if (!alphabets.length) return undefined;
  const words = (value: string): readonly string[] => (value.startsWith('not:') ? value.slice(4) : value).split('|').filter((one) => one && one !== 'none');
  const tokens = [...new Set(['', ...alphabets.flatMap((one) => words(one.value))])].sort();
  const mask = (value: string): ReturnType<typeof alphabetForm.parse> => alphabetForm.parse({ tokens }, {
    want: value.startsWith('not:') ? tokens.filter((one) => !words(value).includes(one)) : words(value),
  });
  const held = signedIn(alphabetForm.lattice({ tokens }), alphabets.map((one) => [one, mask(one.value)] as const)).members(tokens);
  return held.includes('') ? tokens.filter((one) => one !== '' && !held.includes(one)).map((one) => `not:${one}`) : held;
}

/**
 * The poles of a region, question by question: each live bound is signed at the region it names and travels by rest, as
 * the object signs, so the ceiling is what the region reads up its chain of rest, the meet in the lattice of their form, and beside it what the region's cells hold under that question,
 * value by count. Read off the summaries alone; no cell is visited.
 */
export function polesOf(regions: Regions, region: string): ReadonlyMap<string, { readonly ceiling: Interval | readonly string[] | undefined; readonly held: ReadonlyMap<string, number> | undefined }> {
  const chain: string[] = [];
  for (let at = region; ; at = restsOn(regions.named, at)) {
    chain.push(at);
    if (at === '') break;
  }
  const asked = new Map<string, Bound[]>();
  for (const bound of regions.bounds.filter((one) => chain.includes(one.region))) {
    const key = `${bound.question} ${bound.measure}`;
    asked.set(key, [...(asked.get(key) ?? []), bound]);
  }
  const summary = regions.summaries.get(region);
  const heldAt = (question: string, measure: string): ReadonlyMap<string, number> | undefined => {
    const out = new Map<string, number>();
    for (const [key, bar] of summary?.values ?? []) {
      const [asked_, at] = [key.slice(0, key.lastIndexOf(' ')), key.slice(key.lastIndexOf(' ') + 1)];
      if (at !== measure || !within(point(asked_), coordinates(question))) continue;
      for (const [value, count] of bar) out.set(value, (out.get(value) ?? 0) + count);
    }
    return out.size ? out : undefined;
  };
  return new Map([...asked].map(([key, bounds]) => [key, { ceiling: poleAt(regions.named, region, bounds), held: heldAt(bounds[0]!.question, bounds[0]!.measure) }] as const));
}

export function regionsOf(standing: readonly string[], ceilings: readonly string[], cells: readonly { readonly question: string; readonly measure: string; readonly value: string; readonly place: string }[]): Regions {
  const named = regionsNamed(standing);
  const bounds = ceilings.map((line) => boundOf(named, line));
  const summaries = new Map<string, { region: string; cells: number; sums: Map<string, number>; values: Map<string, Map<string, number>>; bounds: Bound[] }>();
  const at = (region: string): ReturnType<typeof summaries.get> & object => summaries.get(region)
    ?? summaries.set(region, { region, cells: 0, sums: new Map(), values: new Map(), bounds: [] }).get(region)!;
  for (const region of [...named, ...bounds.map((one) => one.region)]) at(region);
  for (const bound of bounds) at(bound.region).bounds.push(bound);
  const chains = new Map<string, readonly string[]>();
  const chainOf = (region: string): readonly string[] => chains.get(region) ?? chains.set(region, region === '' ? [''] : [region, ...chainOf(restsOn(named, region))]).get(region)!;
  const globs = [...summaries.keys()].filter(globbed);
  const placed = new Map<string, { place: string; key: string; sum?: number; ids: Set<string> }>();
  for (const cell of cells) {
    const key = `${cell.question} ${cell.measure}`;
    const span = /^(-?\d+(?:\.\d+)?)\.\./.exec(cell.value);
    const held = placed.get(`${cell.place}\u0000${key}`) ?? placed.set(`${cell.place}\u0000${key}`, { place: cell.place, key, ids: new Set() }).get(`${cell.place}\u0000${key}`)!;
    if (span) held.sum = (held.sum ?? 0) + Number(span[1]);
    else for (const one of cell.value.split('|')) if (one && one !== 'none') held.ids.add(one);
  }
  for (const { place, key, sum, ids } of placed.values()) {
    const home = regionOf(named, place);
    const reached = [...chainOf(home), ...globs.filter((glob) => chainOf(home).some((one) => one && matches(glob, one)))];
    for (const region of new Set(reached)) {
      const summary = at(region);
      summary.cells += 1;
      if (sum !== undefined) summary.sums.set(key, (summary.sums.get(key) ?? 0) + sum);
      const bars = summary.values.get(key) ?? summary.values.set(key, new Map()).get(key)!;
      for (const one of sum !== undefined ? [String(sum)] : ids) bars.set(one, (bars.get(one) ?? 0) + 1);
    }
  }
  return { named, bounds, summaries };
}

/**
 * What a bound bites, read off the summary of its region and never off a cell: the values its region's cells read that
 * lie outside it, and of those the ones every bound above it still admits. A question finer than a summary is not asked.
 */
export function rankOf(regions: Regions, bound: Bound, own: Readonly<Record<string, number>> = {}): { readonly bars: number; readonly cells: number; readonly fresh: number; readonly met: number; readonly sums: number } {
  const mine_ = own[bound.measure] ?? (bound.measure === 'count' ? own[fieldOf(bound.line, 'scope')] : undefined);
  if (mine_ !== undefined) {
    const span = poleAt(regions.named, bound.region, [bound]) as Interval | undefined;
    const off = span !== undefined && !Array.isArray(span) && (mine_ < span.lo || mine_ > span.hi) ? 1 : 0;
    return { bars: off, cells: 0, fresh: off, met: 1, sums: off };
  }
  const summary = regions.summaries.get(bound.region);
  if (!summary) return { bars: 0, cells: 0, fresh: 0, met: 0, sums: 0 };
  const above = regions.bounds.filter((one) => one !== bound && one.measure === bound.measure && one.form === bound.form
    && within(point(bound.question), coordinates(one.question))
    && (one.region === '' || bound.region === one.region || bound.region.startsWith(`${one.region}/`) || (globbed(one.region) && matches(one.region, bound.region))));
  const alone = bound.form === 'alphabet' || bound.measure === 'per-file' || fieldOf(bound.line, 'scope').endsWith('/*');
  const outside = (value: string, of: Interval | readonly string[] | undefined): boolean => {
    if (of === undefined) return false;
    if (!Array.isArray(of)) {
      const n = Number(value);
      return !INTERVALS.leq({ lo: n, hi: n }, of as Interval);
    }
    const list = of as readonly string[];
    return list.some((one) => one.startsWith('not:')) ? list.includes(`not:${value}`) : !list.includes(value);
  };
  const mine = poleAt(regions.named, bound.region, [bound]);
  const held = poleAt(regions.named, bound.region, above);
  let bars = 0;
  let cells = 0;
  let fresh = 0;
  let met = 0;
  const whole = coordinates(fieldOf(bound.line, 'scope'));
  const top = regions.summaries.get('') ?? summary;
  const picked = new Map<string, { readonly bar: ReadonlyMap<string, number>; readonly sum: number | undefined }>();
  const take = (from: Summary, holds: (question: string) => boolean): void => {
    for (const [key, bar] of from.values) {
      const [question, measure] = [key.slice(0, key.lastIndexOf(' ')), key.slice(key.lastIndexOf(' ') + 1)];
      if (!picked.has(key) && measure === bound.measure && holds(question)) picked.set(key, { bar, sum: from.sums.get(key) });
    }
  };
  take(top, (question) => within(point(question), whole));
  take(summary, (question) => within(point(question), coordinates(bound.question)));
  for (const { bar } of picked.values()) {
    for (const [value, count] of bar) {
      met += count;
      if (!alone || !outside(value, mine)) continue;
      bars += 1;
      cells += count;
      if (!outside(value, held)) fresh += count;
    }
  }
  const sums = alone ? 0 : [...picked.values()].filter(({ sum }) => sum !== undefined && outside(String(sum), mine)).length;
  return { bars, cells, fresh, met, sums };
}

function ownDigest(summary: Summary): string {
  const hash = createHash('sha256');
  hash.update(`${summary.region}\n${summary.cells}\n`);
  for (const line of summary.bounds.map((one) => one.line).sort()) hash.update(`${line}\n`);
  for (const key of [...summary.sums.keys()].sort()) hash.update(`${key}=${summary.sums.get(key)}\n`);
  for (const key of [...summary.values.keys()].sort()) hash.update(`${key}:${[...summary.values.get(key)!].sort(([a], [b]) => (a < b ? -1 : 1)).map(([v, n]) => `${v}*${n}`).join(',')}\n`);
  return hash.digest('hex');
}

export function finerOf(regions: Regions): ReadonlyMap<string, readonly string[]> {
  const finer = new Map<string, string[]>();
  for (const region of regions.summaries.keys()) if (region !== '') {
    const parent = globbed(region) ? '' : restsOn(regions.named, region);
    finer.set(parent, [...(finer.get(parent) ?? []), region]);
  }
  return finer;
}

export function digestsOf(regions: Regions): ReadonlyMap<string, string> {
  const finer = finerOf(regions);
  const out = new Map<string, string>();
  const digest = (region: string): string => out.get(region) ?? out.set(region, createHash('sha256').update(`${ownDigest(regions.summaries.get(region)!)}\n${[...(finer.get(region) ?? [])].sort().map(digest).join('\n')}`).digest('hex')).get(region)!;
  digest('');
  return out;
}

export function differing(a: Regions, b: Regions): { readonly regions: readonly string[]; readonly compared: number } {
  const [x, y] = [digestsOf(a), digestsOf(b)];
  const named = [...new Set([...a.named, ...b.named])];
  const out: string[] = [];
  let compared = 0;
  const descend = (region: string): void => {
    compared += 1;
    if (x.get(region) === y.get(region)) return;
    const [one, two] = [a.summaries.get(region), b.summaries.get(region)];
    if (!one || !two || ownDigest(one) !== ownDigest(two)) out.push(region);
    const finer = new Set([...a.summaries.keys(), ...b.summaries.keys()].filter((name) => name !== '' && name !== region
      && (globbed(name) ? region === '' : restsOn(named, name) === region)));
    for (const name of [...finer].sort()) descend(name);
  };
  descend('');
  return { regions: out, compared };
}

export interface Packed {
  readonly named: readonly string[];
  readonly bounds: readonly string[];
  readonly summaries: readonly (readonly [string, number, readonly (readonly [string, number])[], readonly (readonly [string, readonly (readonly [string, number])[]])[]])[];
}

export const packRegions = (regions: Regions): Packed => ({
  named: regions.named,
  bounds: regions.bounds.map((one) => one.line),
  summaries: [...regions.summaries.values()].map((one) => [one.region, one.cells, [...one.sums], [...one.values].map(([key, bars]) => [key, [...bars]] as const)] as const),
});

export function unpackRegions(packed: Packed): Regions {
  const bounds = packed.bounds.map((line) => boundOf(packed.named, line));
  return {
    named: packed.named,
    bounds,
    summaries: new Map(packed.summaries.map(([region, cells, sums, values]) => [region, {
      region, cells, sums: new Map(sums), values: new Map(values.map(([key, bars]) => [key, new Map(bars)])), bounds: bounds.filter((one) => one.region === region),
    }])),
  };
}

export function unlikeReplay(regions: Regions, red: ReadonlySet<string>, own: Readonly<Record<string, number>>): number {
  const read = new Map<string, boolean>();
  for (const bound of regions.bounds) {
    const got = rankOf(regions, bound, own);
    if (got.met === 0) continue;
    const scope = fieldOf(bound.line, 'scope');
    read.set(scope, (read.get(scope) ?? false) || got.cells > 0 || got.sums > 0);
  }
  return [...read].filter(([scope, bitten]) => bitten !== red.has(scope)).length;
}
