import type { PlaceFold } from '../cli/place.ts';
import { fieldOf } from '../fold/claims.ts';
import { placesIn } from '../fold/places.ts';
import { placedAt } from '../fold/reach.ts';
import { polesOf, rankOf, unpackRegions } from '../fold/region.ts';
import { INTERVALS } from '@lapxo/topos/forms';

type State = 'CONFLICT' | 'FORBIDDEN' | 'REQUIRED' | 'FREE';
const WORST: readonly State[] = ['CONFLICT', 'FORBIDDEN', 'REQUIRED', 'FREE'];
const empty = (ceiling: { readonly lo: number; readonly hi: number } | readonly string[] | undefined): boolean =>
  ceiling !== undefined && 'lo' in ceiling && !INTERVALS.inhabited(ceiling);

/**
 * The field of a place at resolution N: every bound placed at the place or at none, in the state its poles give, and
 * every coordinate cut to its first N steps in the worst state it holds. Interval poles with no value in common
 * conflict, as two signers on one key do; an alphabet that permits none is a ceiling like any other. A value read
 * outside the poles is forbidden; a bound nothing read, a reader that refused and a demand unpaid are required; the
 * rest is free. It is read off the region summaries and the landed readings, and no reader runs.
 */
export function field(fold: PlaceFold, at: number): readonly string[] {
  if (fold.regions === undefined) return ['GREY     field · this fold carries no region summaries; it is read again at the next fold'];
  const regions = unpackRegions(fold.regions);
  const places = placesIn(fold.root);
  const place = fold.under?.replace(/\/$/, '');
  const here = (line: string): boolean => place === undefined || [place, undefined].includes(placedAt(places, line));
  const own = { ...fold.own, unread: fold.ceilings.unread.length + fold.ceilings.vacuous.length };
  const poles = new Map<string, ReturnType<typeof polesOf>>();
  const states: (readonly [string, State])[] = [
    ...regions.bounds.filter((bound) => here(bound.line)).map((bound) => {
      const ceiling = (poles.get(bound.region) ?? poles.set(bound.region, polesOf(regions, bound.region)).get(bound.region)!).get(`${bound.question} ${bound.measure}`)?.ceiling;
      const got = rankOf(regions, bound, own);
      return [fieldOf(bound.line, 'scope'), empty(ceiling) ? 'CONFLICT' : got.bars || got.sums ? 'FORBIDDEN' : got.met ? 'FREE' : 'REQUIRED'] as const;
    }),
    ...fold.missing.filter(here).map((line) => [fieldOf(line, 'scope'), 'REQUIRED'] as const),
    ...fold.forks.flatMap((fork) => fork.lines.slice(0, 1)).filter(here).map((line) => [fieldOf(line, 'scope'), 'CONFLICT'] as const),
  ];
  const cells = new Map<string, { state: State; bounds: number }>();
  for (const [scope, state] of states) {
    const cell = scope.split('/').slice(0, Math.max(1, at)).join('/');
    const held = cells.get(cell);
    cells.set(cell, { state: held !== undefined && WORST.indexOf(held.state) < WORST.indexOf(state) ? held.state : state, bounds: (held?.bounds ?? 0) + 1 });
  }
  const ordered = [...cells].sort((a, b) => WORST.indexOf(a[1].state) - WORST.indexOf(b[1].state) || a[0].localeCompare(b[0]));
  return [
    '## field', '', '```',
    `FIELD    @${at} · ${cells.size} cells · ${states.length} bounds · ${WORST.map((state) => `${state} ${ordered.filter(([, one]) => one.state === state).length}`).join(' · ')}`,
    ...ordered.map(([cell, one]) => `FIELD    ${cell} · ${one.state} · ${one.bounds} bounds`),
    '```',
  ];
}
